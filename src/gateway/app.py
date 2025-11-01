from __future__ import annotations

import datetime as _dt
import email.utils
import hashlib
import mimetypes
from pathlib import Path, PurePosixPath
from typing import Callable, Iterable, Iterator, List, Optional, Tuple
import urllib.parse

from .config import GatewayConfig

StartResponse = Callable[[str, List[Tuple[str, str]]], None]
WSGIAppResult = Iterable[bytes]


_CHUNK_SIZE = 8192


def _format_http_datetime(ts: float) -> str:
    """
    Format a POSIX timestamp as an HTTP-date string in GMT suitable for HTTP headers.
    
    Parameters:
    	ts (float): POSIX timestamp in seconds since the Unix epoch.
    
    Returns:
    	http_date (str): An RFC-compliant HTTP-date string (e.g., "Tue, 15 Nov 1994 08:12:31 GMT").
    """
    dt = _dt.datetime.utcfromtimestamp(ts).replace(tzinfo=_dt.timezone.utc)
    return email.utils.format_datetime(dt, usegmt=True)


def _parse_http_datetime(value: str) -> Optional[_dt.datetime]:
    """
    Parse an HTTP-date string into a UTC datetime.
    
    Parameters:
        value (str): HTTP-date string as defined by RFC 7231 (e.g., 'Tue, 15 Nov 1994 08:12:31 GMT').
    
    Returns:
        datetime or None: A timezone-aware `datetime` converted to UTC if parsing succeeds, `None` if the input cannot be parsed.
    """
    try:
        parsed = email.utils.parsedate_to_datetime(value)
    except (TypeError, ValueError):
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=_dt.timezone.utc)
    return parsed.astimezone(_dt.timezone.utc)


def _etag_matches(header_value: str, etag: str) -> bool:
    """
    Check whether a comma-separated ETag header contains a match for the given ETag or the wildcard `*`.
    
    Parameters:
        header_value (str): Raw comma-separated ETag header value (e.g., from `If-None-Match`). Tokens are compared after trimming surrounding whitespace.
        etag (str): The ETag to match against (must match a token exactly, including quotes if present).
    
    Returns:
        `true` if any token equals `*` or exactly equals `etag`, `false` otherwise.
    """
    for token in header_value.split(','):
        token = token.strip()
        if token == "*" or token == etag:
            return True
    return False


def _cache_control_for_mode(mode: str) -> str:
    """
    Map a cache mode name to its corresponding Cache-Control header value.
    
    Parameters:
        mode (str): Cache mode identifier. Supported values: "revalidate", "immutable", "no-store", "bypass".
    
    Returns:
        str: The value to use for the HTTP `Cache-Control` header.
    
    Raises:
        ValueError: If `mode` is not one of the supported cache modes.
    """
    if mode == "revalidate":
        return "public, must-revalidate"
    if mode == "immutable":
        return "public, max-age=31536000, immutable"
    if mode == "no-store":
        return "no-store"
    if mode == "bypass":
        return "private, max-age=0, no-store"
    raise ValueError(f"Unsupported cache mode: {mode}")


class GatewayApplication:
    """WSGI application serving build exports with cache-safe semantics."""

    def __init__(self, config: GatewayConfig):
        """
        Initialize the GatewayApplication with the provided configuration and resolve the exports root directory.
        
        Stores the given `config` on the instance and sets `_exports_root` to the absolute, resolved Path of `config.exports_root`.
        
        Parameters:
            config (GatewayConfig): Gateway configuration that provides at minimum the `exports_root` filesystem path and other runtime settings used by the application.
        """
        self.config = config
        self._exports_root = Path(config.exports_root).resolve()

    def __call__(self, environ: dict, start_response: StartResponse) -> WSGIAppResult:
        """
        WSGI application entry point that routes GET and HEAD requests for exports and health endpoints, and rejects unsupported methods or unknown paths.
        
        Inspects the WSGI environ to determine the request method and PATH_INFO (URL-decoded). Only GET and HEAD are allowed (other methods produce a 405 response). Requests whose path begins with "/exports/" are handled by the exports handler; requests to "/healthz" are handled by the health handler; all other paths produce a 404 response.
        
        Parameters:
            environ (dict): WSGI environment dictionary for the incoming request.
        
        Returns:
            WSGI response iterable of bytes to be sent to the server.
        """
        method = environ.get("REQUEST_METHOD", "GET").upper()
        if method not in {"GET", "HEAD"}:
            return self._method_not_allowed(start_response)

        path_info = environ.get("PATH_INFO", "")
        decoded_path = urllib.parse.unquote(path_info or "/")

        if decoded_path.startswith("/exports/"):
            return self._handle_exports(method, decoded_path, environ, start_response)
        if decoded_path == "/healthz":
            return self._handle_health(environ, start_response)

        return self._not_found(start_response)

    def _method_not_allowed(self, start_response: StartResponse) -> WSGIAppResult:
        """
        Responds with HTTP 405 Method Not Allowed and an Allow header advertising supported methods.
        
        Returns:
        	An iterable of bytes representing an empty response body.
        """
        start_response("405 Method Not Allowed", [("Allow", "GET, HEAD")])
        return [b""]

    def _not_found(self, start_response: StartResponse) -> WSGIAppResult:
        """
        Send a 404 Not Found response with an empty body and Content-Length set to 0.
        
        Returns:
            An iterable containing a single empty bytes object to be used as the response body.
        """
        start_response("404 Not Found", [("Content-Length", "0")])
        return [b""]

    def _unauthorized(self, start_response: StartResponse) -> WSGIAppResult:
        """
        Send a 401 Unauthorized response requiring the X-Mobius-Key authentication header.
        
        Parameters:
        	start_response (StartResponse): WSGI start_response callable used to begin the response.
        
        Returns:
        	WARNING: WSGI body iterable containing an empty byte string (no response body).
        """
        headers = [("Content-Length", "0"), ("WWW-Authenticate", "X-Mobius-Key")]
        start_response("401 Unauthorized", headers)
        return [b""]

    def _handle_health(self, environ: dict, start_response: StartResponse) -> WSGIAppResult:
        """
        Serve the health check endpoint and return a short OK response when permitted.
        
        If the application is not configured to expose health publicly, requires the HTTP header `X-Mobius-Key` to match the configured gateway key; if the header is missing or does not match, the request is rejected with a 401 Unauthorized response. Successful responses include headers: Cache-Control: no-store, Content-Type: text/plain; charset=utf-8, Content-Length: 3, and an `X-Mobius-Version` header when a version is configured.
        
        Returns:
            An iterable yielding the bytes `b"ok\n"` for a successful 200 response; unauthorized requests produce a 401 response with an empty body.
        """
        if not self.config.health_public:
            if environ.get("HTTP_X_MOBIUS_KEY") != self.config.gateway_key:
                return self._unauthorized(start_response)

        headers = [
            ("Cache-Control", "no-store"),
            ("Content-Type", "text/plain; charset=utf-8"),
            ("Content-Length", "3"),
        ]
        if self.config.version:
            headers.append(("X-Mobius-Version", self.config.version))
        start_response("200 OK", headers)
        return [b"ok\n"]

    def _handle_exports(
        self,
        method: str,
        decoded_path: str,
        environ: dict,
        start_response: StartResponse,
    ) -> WSGIAppResult:
        """
        Handle requests under the "/exports/" path, serving files or their SHA-256 digest virtual files with appropriate cache headers and conditional responses.
        
        Parameters:
            method (str): HTTP method, expected to be "GET" or "HEAD".
            decoded_path (str): URL-decoded PATH_INFO beginning with "/exports/".
            environ (dict): WSGI environment for the request (used for conditional headers and auth).
            start_response (StartResponse): WSGI start_response callable.
        
        Returns:
            WSGIAppResult: An iterable yielding the response body bytes (empty for HEAD), or a single empty byte sequence for responses with no body.
        """
        if environ.get("HTTP_X_MOBIUS_KEY") != self.config.gateway_key:
            return self._unauthorized(start_response)

        relative = decoded_path[len("/exports/") :]
        if not relative:
            return self._not_found(start_response)

        normalized = PurePosixPath(relative)
        if normalized.is_absolute() or any(part == ".." for part in normalized.parts):
            return self._not_found(start_response)

        target_path = (self._exports_root / Path(*normalized.parts)).resolve()
        try:
            target_path.relative_to(self._exports_root)
        except ValueError:
            return self._not_found(start_response)

        is_digest = False
        if target_path.suffix == ".sha256":
            base_path = target_path.with_suffix("")
            is_digest = True
        else:
            base_path = target_path

        if is_digest:
            # The digest virtual file should map to the base artifact.
            if not base_path.exists() or not base_path.is_file():
                return self._not_found(start_response)
        else:
            if not target_path.exists() or not target_path.is_file():
                return self._not_found(start_response)

        if is_digest:
            file_path = base_path
        else:
            file_path = target_path

        stat = file_path.stat()
        last_modified = _format_http_datetime(stat.st_mtime)
        digest = self._calculate_digest(file_path)
        etag = f'"{digest}"'

        cache_headers = self._cache_headers(etag, last_modified)

        if self._is_not_modified(environ, etag, stat.st_mtime):
            start_response("304 Not Modified", cache_headers)
            return [b""]

        if is_digest:
            body = f"{digest}  {file_path.name}\n".encode("utf-8")
            headers = cache_headers + [
                ("Content-Type", "text/plain; charset=utf-8"),
                ("Content-Length", str(len(body))),
                (
                    "Content-Disposition",
                    self._content_disposition(f"{file_path.name}.sha256"),
                ),
            ]
            start_response("200 OK", headers)
            return [body] if method == "GET" else [b""]

        mime_type, _ = mimetypes.guess_type(file_path.name)
        content_type = mime_type or "application/octet-stream"
        headers = cache_headers + [
            ("Content-Type", content_type),
            ("Content-Length", str(stat.st_size)),
            ("Content-Disposition", self._content_disposition(file_path.name)),
        ]

        start_response("200 OK", headers)
        if method == "HEAD":
            return [b""]
        return self._stream_file(file_path)

    def _stream_file(self, file_path: Path) -> Iterator[bytes]:
        """
        Yield the contents of a file as fixed-size binary chunks.
        
        Reads the file at `file_path` in binary mode and yields successive byte chunks of size `_CHUNK_SIZE`
        until end-of-file is reached.
        
        Parameters:
            file_path (Path): Path to the file to stream.
        
        Returns:
            Iterator[bytes]: An iterator that yields bytes objects for each chunk read from the file.
        """
        with file_path.open("rb") as fh:
            while True:
                chunk = fh.read(_CHUNK_SIZE)
                if not chunk:
                    break
                yield chunk

    def _calculate_digest(self, file_path: Path) -> str:
        """
        Compute the SHA-256 hex digest of the given file's contents.
        
        Returns:
            str: Hexadecimal SHA-256 digest of the file contents.
        """
        hasher = hashlib.sha256()
        with file_path.open("rb") as fh:
            for chunk in iter(lambda: fh.read(_CHUNK_SIZE), b""):
                hasher.update(chunk)
        return hasher.hexdigest()

    def _cache_headers(self, etag: str, last_modified: str) -> List[Tuple[str, str]]:
        """
        Build common HTTP response headers used for caching, validation, and content negotiation.
        
        Parameters:
            etag (str): The ETag value to send (quoted string identifying the resource version).
            last_modified (str): The Last-Modified value as an HTTP-date string (GMT/UTC).
        
        Returns:
            List[Tuple[str, str]]: A list of (header-name, header-value) pairs including ETag, Last-Modified, Cache-Control (derived from the configured cache mode), Vary, Accept-Ranges, and optionally X-Mobius-Version when a version is configured.
        """
        headers = [
            ("ETag", etag),
            ("Last-Modified", last_modified),
            ("Cache-Control", _cache_control_for_mode(self.config.cache_mode)),
            ("Vary", "Accept-Encoding"),
            ("Accept-Ranges", "bytes"),
        ]
        if self.config.version:
            headers.append(("X-Mobius-Version", self.config.version))
        return headers

    def _content_disposition(self, filename: str) -> str:
        """
        Builds a Content-Disposition header for serving a file attachment with an ASCII fallback and a UTF-8 encoded filename parameter.
        
        Parameters:
            filename (str): The original filename; may contain non-ASCII characters.
        
        Returns:
            str: A Content-Disposition header value, e.g. 'attachment; filename="fallback"; filename*=UTF-8''<percent-encoded-filename>'.
        """
        ascii_fallback = filename.encode("ascii", "ignore").decode("ascii")
        if not ascii_fallback:
            ascii_fallback = "download"
        ascii_fallback = ascii_fallback.replace("\"", "")
        encoded = urllib.parse.quote(filename, safe="")
        return f"attachment; filename=\"{ascii_fallback}\"; filename*=UTF-8''{encoded}"

    def _is_not_modified(self, environ: dict, etag: str, mtime: float) -> bool:
        """
        Determine whether the resource can be considered not modified based on the request's conditional headers.
        
        Parameters:
            environ (dict): WSGI environ mapping; checks `HTTP_IF_NONE_MATCH` and `HTTP_IF_MODIFIED_SINCE` headers.
            etag (str): Current resource ETag (including surrounding quotes if present).
            mtime (float): Resource modification time as a POSIX timestamp.
        
        Returns:
            `true` if the request's conditional headers indicate the resource is not modified, `false` otherwise.
        """
        if_none_match = environ.get("HTTP_IF_NONE_MATCH")
        if if_none_match and _etag_matches(if_none_match, etag):
            return True

        if_modified_since = environ.get("HTTP_IF_MODIFIED_SINCE")
        if if_modified_since and not if_none_match:
            parsed = _parse_http_datetime(if_modified_since)
            if parsed is not None:
                resource_time = _dt.datetime.utcfromtimestamp(mtime).replace(tzinfo=_dt.timezone.utc)
                if resource_time <= parsed:
                    return True
        return False