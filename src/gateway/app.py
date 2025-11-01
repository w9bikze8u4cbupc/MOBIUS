"""WSGI gateway that streams export ZIP archives and checksum manifests.

The application enforces API key authentication, provides strong cache
validators, and emits CDN-friendly headers.  It also exposes a keyed health
endpoint suitable for load balancers.
"""

from __future__ import annotations

import hashlib
import io
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from email.utils import format_datetime, parsedate_to_datetime
from pathlib import Path, PurePosixPath
from typing import Dict, Iterable, Iterator, List, Optional, Tuple

CACHE_MODE_REVALIDATE = "revalidate"
CACHE_MODE_IMMUTABLE = "immutable"
CACHE_MODE_NO_STORE = "no-store"

_DEFAULT_CACHE_MODE = CACHE_MODE_REVALIDATE

_API_REALM = "exports"
_AUTH_HEADER = "X-Mobius-Key"


@dataclass
class Response:
    """Represents the status, headers, and body for a response."""

    status: str
    headers: List[Tuple[str, str]]
    body: Iterable[bytes]


class _FileIterable:
    """Iterable that streams a file object and closes it on completion."""

    def __init__(self, fileobj: io.BufferedReader, chunk_size: int = 64 * 1024) -> None:
        """
        Initialize an iterable that streams the given binary file-like object in fixed-size chunks
        and ensures the file is closed after iteration completes.
        
        Parameters:
            fileobj (io.BufferedReader): A binary file-like object opened for reading; must support `read()` and `close()`.
            chunk_size (int): Number of bytes to read per chunk when iterating; must be greater than zero.
        """
        self._file = fileobj
        self._chunk_size = chunk_size

    def __iter__(self) -> Iterator[bytes]:
        """
        Yield successive chunks of the underlying file until end-of-file, and ensure the file is closed when iteration finishes or is interrupted.
        
        Returns:
            Iterator[bytes]: Chunks of file data (each up to the configured chunk size); the file is closed after iteration completes or if an exception occurs.
        """
        try:
            while True:
                chunk = self._file.read(self._chunk_size)
                if not chunk:
                    break
                yield chunk
        finally:
            self._file.close()


def application(environ: Dict[str, object], start_response) -> Iterable[bytes]:
    """
    WSGI application entry point exposing the Gateway-based HTTP handler.
    
    Dispatches the request to Gateway, calls start_response with the response status and headers, and returns the response body iterable.
    
    Returns:
        body (Iterable[bytes]): Iterable of bytes representing the HTTP response body.
    """

    response = Gateway(environ).dispatch()
    start_response(response.status, response.headers)
    return response.body


class Gateway:
    """Handles routing and response generation."""

    def __init__(self, environ: Dict[str, object]) -> None:
        """
        Initialize the Gateway with the WSGI environment and record the current UTC time.
        
        Parameters:
            environ (Dict[str, object]): The WSGI environ mapping for the incoming request; stored for use by request handlers and header construction.
        """
        self.environ = environ
        self.now = datetime.now(timezone.utc)

    # ------------------------------------------------------------------
    # Routing
    # ------------------------------------------------------------------
    def dispatch(self) -> Response:
        """
        Route the incoming HTTP request to the appropriate handler and produce a Response.
        
        Supports only GET and HEAD methods; other methods yield a 405 Method Not Allowed response.
        Routes:
        - "/healthz" → health endpoint handler
        - "/exports/<...>" → exports handler with the subpath (portion after "/exports/")
        - any other path → 404 Not Found
        
        Returns:
            Response: the HTTP response object produced by the selected handler (status may be 200, 304, 401, 404, 405, 500, etc., depending on request and handler).
        """
        method = self.environ.get("REQUEST_METHOD", "GET").upper()
        if method not in {"GET", "HEAD"}:
            return self._method_not_allowed()

        path = self.environ.get("PATH_INFO", "") or "/"

        if path == "/healthz":
            return self._handle_health(method)

        if path.startswith("/exports/"):
            return self._handle_exports(method, path[len("/exports/"):])

        return self._not_found()

    # ------------------------------------------------------------------
    # Health
    # ------------------------------------------------------------------
    def _handle_health(self, method: str) -> Response:
        """
        Handle the health-check endpoint, enforcing access control and producing the appropriate HTTP response.
        
        Parameters:
            method (str): HTTP method for the request; expected values are "GET" or "HEAD".
        
        Returns:
            Response: A 200 OK response with body b"OK\n" for GET and an empty body for HEAD when access is allowed; returns a 401 Unauthorized Response when access is denied.
        """
        if not self._is_health_public() and not self._check_api_key():
            return self._unauthorized()

        headers = self._base_headers(cache_control=CACHE_MODE_NO_STORE)
        body = [b"OK\n"] if method == "GET" else []
        return Response("200 OK", headers, body)

    # ------------------------------------------------------------------
    # Exports
    # ------------------------------------------------------------------
    def _handle_exports(self, method: str, raw_subpath: str) -> Response:
        """
        Route requests under /exports to the appropriate export responder (ZIP or SHA256 manifest) after authentication and path validation.
        
        Parameters:
            method (str): The HTTP method (expected "GET" or "HEAD").
            raw_subpath (str): Percent-encoded subpath extracted from the request path (the portion after "/exports/").
        
        Returns:
            Response: A Response object representing one of:
              - 200/304 with headers and body for a ZIP or its SHA256 manifest when available,
              - 401 if API key authentication fails,
              - 404 if decoding fails, the path is invalid, or the target does not map to a supported export,
              - 500 if the export root directory is not configured.
        """
        if not self._check_api_key():
            return self._unauthorized()

        export_root = self._get_export_root()
        if export_root is None:
            return self._server_error("MOBIUS_EXPORT_ROOT is not configured")

        decoded = self._percent_decode(raw_subpath)
        if not decoded:
            return self._not_found()

        if decoded.endswith(".zip"):
            return self._serve_zip(method, export_root, decoded)
        if decoded.endswith(".zip.sha256"):
            return self._serve_sha256(method, export_root, decoded[:-len(".sha256")])

        return self._not_found()

    def _serve_zip(self, method: str, root: Path, subpath: str) -> Response:
        """
        Serve a ZIP export at the given subpath, performing cache validation and returning headers appropriate for download.
        
        Performs path resolution and existence checks; if the file is found and not modified per request validators, returns a 304 response. For HEAD requests returns headers without a body. For successful GET requests returns a Response whose body is an iterable of bytes that streams the ZIP file content.
        
        Returns:
            Response: HTTP response with status and headers. The response body is empty for 304 Not Modified and for HEAD requests; for a successful GET it is an iterable of bytes streaming the ZIP file content.
        """
        try:
            target, pure = self._resolve_export_path(root, subpath)
        except ValueError:
            return self._not_found()

        if not target.is_file():
            return self._not_found()

        stat_result = target.stat()
        etag = self._strong_etag(stat_result.st_mtime_ns, stat_result.st_size)
        last_modified = self._http_datetime(stat_result.st_mtime)

        not_modified = self._check_not_modified(etag, last_modified)
        headers = self._export_headers(
            filename=pure.name,
            etag=etag,
            last_modified=last_modified,
            content_length=str(stat_result.st_size),
            content_type="application/zip",
        )

        if not_modified:
            return Response("304 Not Modified", headers, [])

        if method == "HEAD":
            return Response("200 OK", headers, [])

        fileobj = open(target, "rb")
        body_iter: Iterable[bytes]
        file_wrapper = self.environ.get("wsgi.file_wrapper")
        if file_wrapper:
            body_iter = file_wrapper(fileobj, 64 * 1024)
        else:
            body_iter = _FileIterable(fileobj)

        return Response("200 OK", headers, body_iter)

    def _serve_sha256(self, method: str, root: Path, zip_subpath: str) -> Response:
        """
        Serve a SHA-256 checksum manifest for the ZIP file at the given export subpath.
        
        Parameters:
            method (str): HTTP method, expected "GET" or "HEAD".
            root (Path): Absolute filesystem path of the configured export root.
            zip_subpath (str): Percent-decoded POSIX-style subpath to the ZIP file within the export root.
        
        Returns:
            Response: HTTP response containing one of:
              - 200 with a text/plain body "<sha256>  <filename>\n" for GET,
              - 200 with an empty body for HEAD,
              - 304 with no body when the resource is not modified,
              - 404 when the resolved path is invalid or not a file.
        """
        try:
            target, pure = self._resolve_export_path(root, zip_subpath)
        except ValueError:
            return self._not_found()

        if not target.is_file():
            return self._not_found()

        stat_result = target.stat()
        sha_hex = self._digest_for(target)
        etag = f'"sha256-{sha_hex}"'
        last_modified = self._http_datetime(stat_result.st_mtime)

        body_text = f"{sha_hex}  {pure.name}\n"
        body_bytes = body_text.encode("utf-8")
        headers = self._export_headers(
            filename=f"{pure.name}.sha256",
            etag=etag,
            last_modified=last_modified,
            content_length=str(len(body_bytes)),
            content_type="text/plain; charset=utf-8",
        )

        if self._check_not_modified(etag, last_modified):
            return Response("304 Not Modified", headers, [])

        if method == "HEAD":
            return Response("200 OK", headers, [])

        return Response("200 OK", headers, [body_bytes])

    # ------------------------------------------------------------------
    # Helper responses
    # ------------------------------------------------------------------
    def _method_not_allowed(self) -> Response:
        """
        Return a 405 Method Not Allowed response including an Allow header for GET and HEAD.
        
        Returns:
            Response: A Response with status "405 Method Not Allowed", base headers plus "Allow: GET, HEAD", and an empty body.
        """
        headers = self._base_headers()
        headers.append(("Allow", "GET, HEAD"))
        return Response("405 Method Not Allowed", headers, [b""])

    def _not_found(self) -> Response:
        """
        Constructs a 404 Not Found Response using no-store cache headers and an empty body.
        
        Returns:
            Response: A Response whose status is "404 Not Found", whose headers use Cache-Control "no-store", and whose body is empty.
        """
        return Response("404 Not Found", self._base_headers(cache_control=CACHE_MODE_NO_STORE), [b""])

    def _unauthorized(self) -> Response:
        """
        Builds a 401 Unauthorized HTTP response indicating API-key authentication is required.
        
        The response uses no-store caching and includes a `WWW-Authenticate` header that advertises the API key realm for clients.
        
        Returns:
            Response: A `401 Unauthorized` response with headers (including `Cache-Control: no-store` and `WWW-Authenticate`) and an empty body.
        """
        headers = self._base_headers(cache_control=CACHE_MODE_NO_STORE)
        headers.append(("WWW-Authenticate", f'{_AUTH_HEADER} realm="{_API_REALM}"'))
        return Response("401 Unauthorized", headers, [b""])

    def _server_error(self, message: str) -> Response:
        """
        Builds a 500 Internal Server Error Response containing the provided message as the body.
        
        Parameters:
            message (str): UTF-8 text included as the response body.
        
        Returns:
            Response: A Response with status "500 Internal Server Error", Cache-Control set to no-store, and the UTF-8 encoded message as the body.
        """
        headers = self._base_headers(cache_control=CACHE_MODE_NO_STORE)
        return Response("500 Internal Server Error", headers, [message.encode("utf-8")])

    # ------------------------------------------------------------------
    # Header building helpers
    # ------------------------------------------------------------------
    def _base_headers(self, *, cache_control: Optional[str] = None) -> List[Tuple[str, str]]:
        """
        Builds the common HTTP response headers used by the gateway.
        
        Parameters:
            cache_control (Optional[str]): Optional override for cache behavior. When omitted, the gateway's configured cache mode is used. Accepted values include CACHE_MODE_REVALIDATE, CACHE_MODE_IMMUTABLE, and CACHE_MODE_NO_STORE.
        
        Returns:
            headers (List[Tuple[str, str]]): A list of (header-name, header-value) pairs including Cache-Control, Date, Vary, Accept-Ranges, and optionally X-Mobius-Version if the `MOBIUS_VERSION` environment variable is set.
        """
        headers: List[Tuple[str, str]] = []

        if cache_control is None:
            cache_control = self._cache_control_mode()

        if cache_control == CACHE_MODE_REVALIDATE:
            headers.append(("Cache-Control", "public, max-age=0, must-revalidate"))
        elif cache_control == CACHE_MODE_IMMUTABLE:
            headers.append(("Cache-Control", "public, max-age=31536000, immutable"))
        elif cache_control == CACHE_MODE_NO_STORE:
            headers.append(("Cache-Control", "no-store"))

        headers.append(("Date", format_datetime(self.now, usegmt=True)))
        headers.append(("Vary", "Accept-Encoding"))
        headers.append(("Accept-Ranges", "bytes"))

        version = os.environ.get("MOBIUS_VERSION")
        if version:
            headers.append(("X-Mobius-Version", version))
        return headers

    def _export_headers(
        self,
        *,
        filename: str,
        etag: str,
        last_modified: datetime,
        content_length: str,
        content_type: str,
    ) -> List[Tuple[str, str]]:
        """
        Builds the HTTP response headers required for serving an exported file.
        
        Includes base/cache headers and appends Content-Type, Content-Length, ETag, Last-Modified (formatted for HTTP), and Content-Disposition for the provided filename.
        
        Parameters:
            filename (str): The filename used in the Content-Disposition header.
            etag (str): The ETag value for the response (e.g., a strong ETag).
            last_modified (datetime): The file's last-modified timestamp; formatted as an HTTP date.
            content_length (str): The size of the response body in bytes, expressed as a string.
            content_type (str): The MIME type for the response body.
        
        Returns:
            headers (List[Tuple[str, str]]): Ordered list of (header-name, header-value) pairs for the response.
        """
        headers = self._base_headers()
        headers.append(("Content-Type", content_type))
        headers.append(("Content-Length", content_length))
        headers.append(("ETag", etag))
        headers.append(("Last-Modified", format_datetime(last_modified, usegmt=True)))
        headers.append(("Content-Disposition", self._content_disposition(filename)))
        return headers

    # ------------------------------------------------------------------
    # Utilities
    # ------------------------------------------------------------------
    def _check_api_key(self) -> bool:
        """
        Determine whether the request is authorized by API key.
        
        If MOBIUS_API_KEY is not set, authentication is treated as disabled and requests are allowed. Otherwise compares the configured key to the value of the X-Mobius-Key request header.
        
        Returns:
            True if authentication is disabled or the provided API key matches the configured value, False otherwise.
        """
        expected = os.environ.get("MOBIUS_API_KEY")
        if not expected:
            return True
        provided = self._header_value(_AUTH_HEADER)
        return provided == expected

    def _header_value(self, name: str) -> Optional[str]:
        """
        Retrieve a request header value from the WSGI environ.
        
        Parameters:
            name (str): HTTP header name (e.g. "X-Mobius-Key" or "If-None-Match").
        
        Returns:
            Optional[str]: The header value if present and a string, otherwise `None`.
        """
        environ_key = "HTTP_" + name.upper().replace("-", "_")
        value = self.environ.get(environ_key)
        if isinstance(value, str):
            return value
        return None

    def _is_health_public(self) -> bool:
        """
        Check if the health endpoint is public based on the MOBIUS_HEALTH_PUBLIC environment variable.
        
        Returns:
            True if MOBIUS_HEALTH_PUBLIC is set to "1", "true", "TRUE", or "True", False otherwise.
        """
        return os.environ.get("MOBIUS_HEALTH_PUBLIC") in {"1", "true", "TRUE", "True"}

    def _get_export_root(self) -> Optional[Path]:
        """
        Resolve the MOBIUS_EXPORT_ROOT environment variable to an absolute Path.
        
        Reads the `MOBIUS_EXPORT_ROOT` environment variable and returns its resolved absolute Path. If the environment variable is not set or empty, returns `None`.
        
        Returns:
            Optional[Path]: Resolved absolute Path of `MOBIUS_EXPORT_ROOT`, or `None` if unset.
        """
        root_value = os.environ.get("MOBIUS_EXPORT_ROOT")
        if not root_value:
            return None
        return Path(root_value).resolve()

    def _cache_control_mode(self) -> str:
        """
        Selects and validates the cache mode from the MOBIUS_CACHE_MODE environment variable.
        
        Reads MOBIUS_CACHE_MODE and returns it if it matches one of the supported modes; otherwise returns the module default.
        
        Returns:
            str: The cache mode string — one of "revalidate", "immutable", or "no-store". If the environment value is missing or invalid, the default mode is returned.
        """
        mode = os.environ.get("MOBIUS_CACHE_MODE", _DEFAULT_CACHE_MODE)
        if mode not in {CACHE_MODE_REVALIDATE, CACHE_MODE_IMMUTABLE, CACHE_MODE_NO_STORE}:
            return _DEFAULT_CACHE_MODE
        return mode

    def _percent_decode(self, value: str) -> str:
        """
        Decode a percent-encoded string and return the decoded result.
        
        Parameters:
            value (str): Percent-encoded input (for example, "file%20name.zip").
        
        Returns:
            str: Decoded string, or an empty string if decoding fails.
        """
        try:
            from urllib.parse import unquote

            return unquote(value)
        except Exception:
            return ""

    def _resolve_export_path(self, root: Path, subpath: str) -> Tuple[Path, PurePosixPath]:
        """
        Resolve a requested export subpath against an export root while validating and preventing path traversal.
        
        Validates that the provided subpath is a relative, well-formed POSIX path (no empty segments, "." or ".."), resolves it against the given root to an absolute Path, and ensures the resolved target resides within the root directory.
        
        Parameters:
            root (Path): Absolute filesystem directory that serves as the export root.
            subpath (str): POSIX-style path component from the request (URL-decoded).
        
        Returns:
            Tuple[Path, PurePosixPath]: A tuple where the first element is the resolved absolute Path inside `root` and the second element is the parsed PurePosixPath representation of `subpath`.
        
        Raises:
            ValueError: If `subpath` is absolute, contains empty/"."/".." segments, or resolves outside of `root` (path traversal).
        """
        pure = PurePosixPath(subpath)
        if pure.is_absolute():
            raise ValueError("absolute path not allowed")
        if any(part in {"", ".", ".."} for part in pure.parts):
            raise ValueError("invalid path segment")

        target = (root / Path(*pure.parts)).resolve()
        try:
            target.relative_to(root)
        except ValueError:
            raise ValueError("path traversal detected")
        return target, pure

    def _content_disposition(self, filename: str) -> str:
        """
        Create a Content-Disposition header that supplies both an ASCII-safe filename fallback and an RFC 5987 UTF-8 encoded filename.
        
        Parameters:
            filename (str): The original filename to expose to clients.
        
        Returns:
            str: A Content-Disposition header value of the form
                 `attachment; filename="<ascii_fallback>"; filename*=UTF-8''<utf8_encoded>`.
        """
        safe_fallback = self._ascii_fallback(filename)
        utf8_encoded = self._rfc5987_encode(filename)
        return f"attachment; filename=\"{safe_fallback}\"; filename*=UTF-8''{utf8_encoded}"

    def _ascii_fallback(self, filename: str) -> str:
        """
        Produce an ASCII-safe filename suitable for use in HTTP Content-Disposition.
        
        Parameters:
            filename (str): Original filename which may contain non-ASCII or unsafe characters.
        
        Returns:
            str: A sanitized ASCII filename. If the original contains ASCII alphanumerics after normalization those are returned with backslashes replaced by underscores and quotes removed; otherwise returns "download.<suffix>" if the original had an extension or "download" if not.
        """
        import unicodedata

        normalized = unicodedata.normalize("NFKD", filename)
        ascii_bytes = normalized.encode("ascii", "ignore")
        ascii_text = ascii_bytes.decode("ascii")
        sanitized = ascii_text.replace("\\", "_").replace('"', "")
        if sanitized and any(ch.isalnum() for ch in sanitized):
            return sanitized

        suffix = ""
        if "." in filename:
            parts = filename.split(".", 1)
            suffix = parts[1]
        if suffix:
            return f"download.{suffix}"
        return "download"

    def _rfc5987_encode(self, value: str) -> str:
        """
        Encode a string for use in an RFC 5987 HTTP header parameter value.
        
        Parameters:
            value (str): The header parameter value to encode (UTF-8 text).
        
        Returns:
            str: The percent-encoded UTF-8 string suitable for use in a `filename*` or other RFC 5987 header parameter.
        """
        from urllib.parse import quote

        return quote(value, safe="")

    def _strong_etag(self, mtime_ns: int, size: int) -> str:
        """
        Builds a strong HTTP ETag for a file from its modification time and size.
        
        The ETag is a quoted string containing the mtime and size encoded in lowercase hexadecimal separated by a hyphen.
        
        Parameters:
            mtime_ns (int): File modification time in nanoseconds since the epoch.
            size (int): File size in bytes.
        
        Returns:
            str: A quoted ETag in the form '"<mtime_hex>-<size_hex>"'.
        """
        return f'"{mtime_ns:x}-{size:x}"'

    def _check_not_modified(self, etag: str, last_modified: datetime) -> bool:
        """
        Determine whether the request's conditional headers indicate the resource has not been modified.
        
        Checks the `If-None-Match` header for a matching ETag or the wildcard `"*"`, and falls back to `If-Modified-Since` comparing the provided datetime to `last_modified`. If header parsing fails or no validation header matches, the resource is treated as modified.
        
        Parameters:
            etag (str): The current strong ETag for the resource (including surrounding quotes if used).
            last_modified (datetime): The resource's last-modified timestamp.
        
        Returns:
            bool: `True` if the request indicates the resource is not modified (suitable for a 304 response), `False` otherwise.
        """
        if_none_match = self._header_value("If-None-Match")
        if if_none_match:
            tags = {tag.strip() for tag in if_none_match.split(",") if tag.strip()}
            if "*" in tags or etag in tags:
                return True

        if_modified_since = self._header_value("If-Modified-Since")
        if if_modified_since:
            try:
                since = parsedate_to_datetime(if_modified_since)
                if since.tzinfo is None:
                    since = since.replace(tzinfo=timezone.utc)
                if last_modified <= since:
                    return True
            except (TypeError, ValueError, IndexError):
                pass
        return False

    def _digest_for(self, file_path: Path) -> str:
        """
        Compute the SHA-256 hex digest of the file at the given path.
        
        Returns:
            hex_digest (str): Lowercase hexadecimal SHA-256 digest of the file's contents.
        """
        hasher = hashlib.sha256()
        with open(file_path, "rb") as fp:
            for chunk in iter(lambda: fp.read(64 * 1024), b""):
                hasher.update(chunk)
        return hasher.hexdigest()

    def _http_datetime(self, timestamp: float) -> datetime:
        """
        Convert a POSIX timestamp to a UTC datetime with microseconds set to zero.
        
        Parameters:
            timestamp (float): Seconds since the Unix epoch.
        
        Returns:
            datetime: Timezone-aware UTC datetime corresponding to `timestamp`, with microseconds set to 0.
        """
        dt = datetime.fromtimestamp(timestamp, tz=timezone.utc)
        return dt.replace(microsecond=0)


__all__ = ["application"]