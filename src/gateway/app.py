from __future__ import annotations

import datetime as _dt
import hashlib
import os
from email.utils import format_datetime, formatdate, parsedate_to_datetime
from pathlib import Path, PurePosixPath
from typing import Callable, Dict, Iterable, Iterator, Optional, Tuple

WSGIStartResponse = Callable[[str, Iterable[Tuple[str, str]], Optional[Tuple]], None]


class GatewayApplication:
    """Minimal WSGI gateway for exporting build artifacts.

    Parameters mirror the MOBIUS_* environment variables so the application can be
    instantiated either directly or via :meth:`from_environ`.
    """

    def __init__(
        self,
        export_root: Path | str,
        gateway_key: Optional[str],
        *,
        health_public: bool = False,
        version: Optional[str] = None,
        cache_mode: str = "revalidate",
        sha256_chunk: int = 65536,
    ) -> None:
        """
        Initialize the GatewayApplication with export root, authorization, health, version, cache, and digest settings.
        
        Parameters:
            export_root (Path | str): Root directory for exported artifacts; stored as a resolved Path.
            gateway_key (Optional[str]): Gateway authorization key; if None, requests are not restricted by key.
            health_public (bool): If True, the health endpoint does not require authorization.
            version (Optional[str]): Optional public version string included in responses when provided.
            cache_mode (str): Cache mode string (normalized to lowercase) that controls Cache-Control header behavior.
            sha256_chunk (int): Chunk size (bytes) used when computing/streaming file SHA256; coerced to at least 1024.
        
        Side effects:
            - Normalizes and stores inputs on the instance.
            - Initializes an internal digest cache mapping Path -> (mtime_ns, size, sha256).
        """
        self.export_root = Path(export_root).resolve()
        self.gateway_key = gateway_key
        self.health_public = health_public
        self.version = version
        self.cache_mode = cache_mode.lower()
        self.sha256_chunk = max(int(sha256_chunk), 1024)
        self._digest_cache: Dict[Path, Tuple[int, int, str]] = {}

    # ------------------------------------------------------------------
    # Application construction helpers
    # ------------------------------------------------------------------
    @classmethod
    def from_environ(cls, environ: Optional[Dict[str, str]] = None) -> "GatewayApplication":
        """
        Create a GatewayApplication configured from environment variables.
        
        Reads MOBIUS_* environment variables to populate constructor parameters and returns a new GatewayApplication instance. Required variables and parsing rules:
        - MOBIUS_EXPORT_ROOT (required): filesystem path used as export_root; raises RuntimeError if missing.
        - MOBIUS_GATEWAY_KEY: optional gateway key string.
        - MOBIUS_HEALTH_PUBLIC: parsed as boolean; accepted truthy values are "1", "true", or "yes" (case-insensitive); defaults to False.
        - MOBIUS_VERSION: optional version string.
        - MOBIUS_CACHE_MODE: cache mode string; defaults to "revalidate".
        - MOBIUS_SHA256_CHUNK: integer chunk size for SHA256 reads; defaults to 65536.
        
        Parameters:
            environ (Optional[Dict[str, str]]): Mapping of environment variables to use; defaults to os.environ when None.
        
        Returns:
            GatewayApplication: A new instance configured from the provided environment.
        """
        environ = environ or os.environ
        export_root = environ.get("MOBIUS_EXPORT_ROOT")
        if not export_root:
            raise RuntimeError("MOBIUS_EXPORT_ROOT is required")
        gateway_key = environ.get("MOBIUS_GATEWAY_KEY")
        health_public = environ.get("MOBIUS_HEALTH_PUBLIC", "false").lower() in {"1", "true", "yes"}
        version = environ.get("MOBIUS_VERSION")
        cache_mode = environ.get("MOBIUS_CACHE_MODE", "revalidate")
        sha_chunk = int(environ.get("MOBIUS_SHA256_CHUNK", "65536"))
        return cls(
            export_root=export_root,
            gateway_key=gateway_key,
            health_public=health_public,
            version=version,
            cache_mode=cache_mode,
            sha256_chunk=sha_chunk,
        )

    # ------------------------------------------------------------------
    # WSGI entry point
    # ------------------------------------------------------------------
    def __call__(self, environ: Dict[str, object], start_response: WSGIStartResponse) -> Iterator[bytes]:
        """
        WSGI entry point that routes GET and HEAD requests to the health or export handlers and returns the resulting response iterable.
        
        Parameters:
            environ (Dict[str, object]): WSGI environment mapping for the request.
            start_response (callable): WSGI start_response callable used to begin the response.
        
        Returns:
            Iterator[bytes]: Iterable yielding the response body bytes (may be empty for HEAD or 304 responses).
            
        Behavior:
            - Only accepts GET and HEAD; other methods produce a 405 Method Not Allowed with an Allow header.
            - PATH_INFO "/healthz" is handled by the health handler.
            - Paths beginning with "/exports/" are handled by the export handler.
            - Any other path results in a 404 Not Found response.
        """
        method = str(environ.get("REQUEST_METHOD", "GET")).upper()
        if method not in {"GET", "HEAD"}:
            return self._respond(start_response, "405 Method Not Allowed", [("Allow", "GET, HEAD")], b"", method)

        path = str(environ.get("PATH_INFO", "")) or "/"
        if path == "/healthz":
            return self._handle_health(environ, start_response, method)

        if path.startswith("/exports/"):
            return self._handle_export(environ, start_response, method, path)

        return self._respond(start_response, "404 Not Found", [], b"", method)

    # ------------------------------------------------------------------
    # Route handlers
    # ------------------------------------------------------------------
    def _handle_health(
        self, environ: Dict[str, object], start_response: WSGIStartResponse, method: str
    ) -> Iterator[bytes]:
        """
        Handle the /healthz health-check endpoint and produce the appropriate WSGI response.
        
        If health checks are not public the request must be authorized; otherwise a 401 response is returned.
        For authorized requests, responds 200 with a plain-text body "ok" for GET and an empty body for HEAD.
        
        Parameters:
            environ (Dict[str, object]): WSGI environment dictionary for the request.
            start_response (callable): WSGI start_response callable.
            method (str): HTTP method of the request (expected "GET" or "HEAD").
        
        Returns:
            Iterator[bytes]: WSGI response iterable containing the response body bytes.
        """
        if not self.health_public and not self._is_authorized(environ):
            return self._unauthorized(start_response, method)

        headers = self._standard_headers()
        headers.extend(
            [
                ("Content-Type", "text/plain; charset=utf-8"),
                ("Cache-Control", "no-store"),
            ]
        )
        body = b"ok" if method == "GET" else b""
        return self._respond(start_response, "200 OK", headers, body, method)

    def _handle_export(
        self,
        environ: Dict[str, object],
        start_response: WSGIStartResponse,
        method: str,
        path: str,
    ) -> Iterator[bytes]:
        """
        Handle a request under the /exports/ path by validating authorization and serving either a ZIP file or its SHA256 digest.
        
        This validates that the PATH_INFO resource (the portion after "/exports/") is present, a safe relative POSIX path (not absolute and not containing ".."), and ends with either ".zip" or ".zip.sha256". If the request is for a ".zip.sha256" resource the corresponding ".zip" file is located, checked to be within the configured export_root and a regular file, and then served as a digest; otherwise the ZIP file is similarly validated and served. If authorization fails, the request is turned into an unauthorized response; invalid, missing, or out-of-root resources produce a 404 response. Delegates actual content delivery to _serve_file or _serve_sha256 and returns the WSGI response iterable.
        
        Parameters:
            environ: WSGI environment dictionary (used for authorization and conditional checks).
            start_response: WSGI start_response callable.
            method: HTTP method (e.g., "GET" or "HEAD").
            path: PATH_INFO string; must start with "/exports/".
        
        Returns:
            An iterator of bytes representing the WSGI response body (empty for HEAD or error responses).
        """
        if not self._is_authorized(environ):
            return self._unauthorized(start_response, method)

        resource = path[len("/exports/") :]
        if not resource:
            return self._respond(start_response, "404 Not Found", [], b"", method)

        relative = PurePosixPath(resource)
        if relative.is_absolute() or ".." in relative.parts:
            return self._respond(start_response, "404 Not Found", [], b"", method)

        is_sha_request = resource.endswith(".zip.sha256")
        if not (resource.endswith(".zip") or is_sha_request):
            return self._respond(start_response, "404 Not Found", [], b"", method)

        if is_sha_request:
            zip_relative = PurePosixPath(resource[: -len(".sha256")])
            target_path = (self.export_root / zip_relative).resolve()
            if not self._is_within_root(target_path):
                return self._respond(start_response, "404 Not Found", [], b"", method)
            if not target_path.exists() or not target_path.is_file():
                return self._respond(start_response, "404 Not Found", [], b"", method)
            return self._serve_sha256(environ, zip_relative.name, target_path, start_response, method)

        target_path = (self.export_root / relative).resolve()
        if not self._is_within_root(target_path):
            return self._respond(start_response, "404 Not Found", [], b"", method)
        if not target_path.exists() or not target_path.is_file():
            return self._respond(start_response, "404 Not Found", [], b"", method)

        return self._serve_file(environ, relative.name, target_path, start_response, method)

    # ------------------------------------------------------------------
    # Authorization helpers
    # ------------------------------------------------------------------
    def _is_authorized(self, environ: Dict[str, object]) -> bool:
        """
        Determine whether the incoming request is authorized to access the gateway.
        
        Parameters:
            environ (Dict[str, object]): WSGI environment mapping; the function checks the "HTTP_X_MOBIUS_KEY" header value if present.
        
        Returns:
            bool: `True` if authorization succeeds — authorization always succeeds when no gateway key is configured; otherwise `True` only if the "HTTP_X_MOBIUS_KEY" header exactly matches the configured gateway key, `False` otherwise.
        """
        if not self.gateway_key:
            return True
        provided = environ.get("HTTP_X_MOBIUS_KEY")
        return isinstance(provided, str) and provided == self.gateway_key

    def _unauthorized(self, start_response: WSGIStartResponse, method: str) -> Iterator[bytes]:
        """
        Builds and returns a 401 Unauthorized response with standard headers.
        
        Parameters:
            method (str): HTTP request method (e.g., "GET" or "HEAD"); used to decide whether the response includes a body.
        
        Returns:
            Iterator[bytes]: Iterable yielding the response body for a 401 Unauthorized. Yields b"unauthorized" for methods that allow a body, or an empty iterable for HEAD.
        """
        headers = self._standard_headers()
        headers.extend([
            ("Content-Type", "text/plain; charset=utf-8"),
            ("Cache-Control", "no-store"),
            ("WWW-Authenticate", 'X-Mobius-Key realm="exports"'),
        ])
        return self._respond(start_response, "401 Unauthorized", headers, b"unauthorized", method)

    # ------------------------------------------------------------------
    # File serving helpers
    # ------------------------------------------------------------------
    def _serve_file(
        self,
        environ: Dict[str, object],
        display_name: str,
        path: Path,
        start_response: WSGIStartResponse,
        method: str,
    ) -> Iterator[bytes]:
        """
        Serve a ZIP file from the given path, honoring conditional requests (If-None-Match / If-Modified-Since) and HEAD semantics.
        
        Determines ETag and Last-Modified from the target file, returns a 304 Not Modified when the request indicates the resource is fresh, and otherwise returns a 200 response with appropriate headers for a ZIP download. For HEAD requests the headers are sent but the body is empty.
        
        Parameters:
            environ (Dict[str, object]): WSGI environment used for conditional request evaluation.
            display_name (str): Filename used in the Content-Disposition header presented to clients.
            path (Path): Filesystem path to the ZIP file to serve; must exist and be readable.
            start_response (Callable): WSGI start_response callable used to begin the HTTP response.
            method (str): HTTP method of the request (expected "GET" or "HEAD").
        
        Returns:
            Iterator[bytes]: An iterator yielding the response body bytes; empty for HEAD requests or 304 responses.
        """
        stat = path.stat()
        etag = self._etag_for(path)
        last_modified = _dt.datetime.fromtimestamp(stat.st_mtime, _dt.timezone.utc).replace(microsecond=0)

        if self._is_not_modified(environ, method=method, etag=etag, last_modified=last_modified):
            # The helper requires headers; respond accordingly.
            headers = self._common_file_headers(etag, last_modified, cacheable=True)
            return self._respond(start_response, "304 Not Modified", headers, b"", method)

        headers = self._common_file_headers(etag, last_modified, cacheable=True)
        headers.extend(
            [
                ("Content-Type", "application/zip"),
                ("Content-Length", str(stat.st_size)),
                ("Content-Disposition", self._build_content_disposition(display_name)),
            ]
        )

        if method == "HEAD":
            return self._respond(start_response, "200 OK", headers, b"", method)

        body_iter = self._stream_file(path)
        return self._respond(start_response, "200 OK", headers, body_iter, method)

    def _serve_sha256(
        self,
        environ: Dict[str, object],
        display_name: str,
        path: Path,
        start_response: WSGIStartResponse,
        method: str,
    ) -> Iterator[bytes]:
        """
        Serve a text/plain SHA256 digest for the specified file, honoring conditional requests.
        
        Parameters:
            environ (Dict[str, object]): WSGI environment for the request.
            display_name (str): Filename to include in the response payload after the digest.
            path (Path): Path to the target file whose SHA256 digest will be served.
            start_response (Callable): WSGI start_response callable used to begin the response.
            method (str): HTTP method of the request (expects "GET" or "HEAD").
        
        Returns:
            Iterator[bytes]: WSGI iterable yielding the response body bytes. For a GET this is the UTF-8 payload
            "<sha256>  <display_name>\\n"; for HEAD or a 304 Not Modified response the iterable is empty.
        """
        digest = self._sha256(path)
        payload = f"{digest}  {display_name}\n".encode("utf-8")
        etag = '"' + hashlib.sha256(payload).hexdigest() + '"'
        stat = path.stat()
        last_modified = _dt.datetime.fromtimestamp(stat.st_mtime, _dt.timezone.utc).replace(microsecond=0)

        if self._is_not_modified(environ, method=method, etag=etag, last_modified=last_modified):
            headers = self._common_file_headers(etag, last_modified, cacheable=True)
            return self._respond(start_response, "304 Not Modified", headers, b"", method)

        headers = self._common_file_headers(etag, last_modified, cacheable=True)
        headers.extend(
            [
                ("Content-Type", "text/plain; charset=utf-8"),
                ("Content-Length", str(len(payload))),
            ]
        )

        if method == "HEAD":
            return self._respond(start_response, "200 OK", headers, b"", method)

        return self._respond(start_response, "200 OK", headers, payload, method)

    # ------------------------------------------------------------------
    # Header helpers
    # ------------------------------------------------------------------
    def _standard_headers(self) -> list[Tuple[str, str]]:
        """
        Builds the base HTTP headers included on every response.
        
        Includes a Date header set to the current time in GMT and, if the application version is configured, an X-Mobius-Version header.
        
        Returns:
            list[tuple[str, str]]: Ordered list of header (name, value) pairs to include on the response.
        """
        headers: list[Tuple[str, str]] = [("Date", formatdate(usegmt=True))]
        if self.version:
            headers.append(("X-Mobius-Version", self.version))
        return headers

    def _cache_control_value(self) -> str:
        """
        Return the Cache-Control header value that corresponds to the application's configured cache_mode.
        
        Maps the `cache_mode` to the outgoing Cache-Control value:
        - "immutable" → "public, max-age=31536000, immutable"
        - "no-store" → "no-store"
        - any other value → "public, max-age=0, must-revalidate"
        
        Returns:
            str: The Cache-Control header value to use for responses.
        """
        mode = self.cache_mode
        if mode == "immutable":
            return "public, max-age=31536000, immutable"
        if mode == "no-store":
            return "no-store"
        return "public, max-age=0, must-revalidate"

    def _common_file_headers(
        self, etag: str, last_modified: _dt.datetime, *, cacheable: bool
    ) -> list[Tuple[str, str]]:
        """
        Builds the common HTTP response headers used when serving file resources.
        
        Parameters:
            etag (str): The ETag header value to include.
            last_modified (datetime): The resource's last-modified timestamp.
            cacheable (bool): If true, include a Cache-Control header based on the application's cache mode.
        
        Returns:
            list[tuple[str, str]]: A list of (header-name, header-value) pairs including ETag, Last-Modified (GMT-formatted), Accept-Ranges, Vary, and optionally Cache-Control plus any standard headers.
        """
        headers = self._standard_headers()
        if cacheable:
            headers.append(("Cache-Control", self._cache_control_value()))
        headers.extend(
            [
                ("ETag", etag),
                ("Last-Modified", format_datetime(last_modified, usegmt=True)),
                ("Accept-Ranges", "bytes"),
                ("Vary", "Accept-Encoding"),
            ]
        )
        return headers

    def _build_content_disposition(self, filename: str) -> str:
        """
        Builds a Content-Disposition header for an attachment with both an ASCII-safe filename fallback and an RFC 5987 UTF-8 encoded filename.
        
        Parameters:
            filename (str): The original filename to encode in the header.
        
        Returns:
            str: A Content-Disposition header value including `filename` (ASCII-safe fallback) and `filename*` (UTF-8 RFC 5987 encoded value).
        """
        ascii_fallback = self._ascii_filename(filename)
        quoted_fallback = ascii_fallback.replace("\\", "_").replace('"', "_")
        rfc5987 = self._rfc5987_value(filename)
        return f"attachment; filename=\"{quoted_fallback}\"; filename*=UTF-8''{rfc5987}"

    @staticmethod
    def _ascii_filename(filename: str) -> str:
        """
        Produce an ASCII-safe filename suitable for use as a fallback in Content-Disposition headers.
        
        Parameters:
            filename (str): Original filename which may contain non-ASCII characters.
        
        Returns:
            ascii_filename (str): The input filename unchanged if all characters are ASCII; otherwise a copy where each non-ASCII character is replaced with '_' . If that produces an empty string, returns "download.zip".
        """
        if filename.isascii():
            return filename
        return "".join(ch if ch.isascii() else "_" for ch in filename) or "download.zip"

    @staticmethod
    def _rfc5987_value(filename: str) -> str:
        """
        Encode a filename for use in HTTP header parameter values according to RFC 5987.
        
        Parameters:
            filename (str): The filename to encode.
        
        Returns:
            encoded (str): The RFC 5987 percent-encoded representation of the filename suitable for header parameter usage.
        """
        from urllib.parse import quote

        return quote(filename, safe="")

    # ------------------------------------------------------------------
    # Conditional request helpers
    # ------------------------------------------------------------------
    def _is_not_modified(
        self,
        environ: Optional[Dict[str, object]],
        *,
        method: str,
        etag: str,
        last_modified: _dt.datetime,
    ) -> bool:
        """
        Determine whether a GET or HEAD request can be answered with 304 Not Modified based on conditional headers.
        
        Parameters:
        	environ (Optional[Dict[str, object]]): WSGI environ containing HTTP headers (e.g., `HTTP_IF_NONE_MATCH`, `HTTP_IF_MODIFIED_SINCE`).
        	method (str): The HTTP method of the request; only `"GET"` and `"HEAD"` are considered.
        	etag (str): The current resource ETag (quoted or raw as used elsewhere).
        	last_modified (datetime.datetime): The resource's last-modified timestamp (timezone-aware or naive UTC).
        
        Returns:
        	bool: `true` if the request is not modified (either `If-None-Match` matches the `etag` or `"*"` or `If-Modified-Since` is equal to or after `last_modified`), `false` otherwise.
        """
        if method not in {"GET", "HEAD"}:
            return False

        if environ is None:
            return False

        if_none_match = environ.get("HTTP_IF_NONE_MATCH") if environ else None
        if if_none_match:
            candidates = {tag.strip() for tag in str(if_none_match).split(",")}
            if etag in candidates or "*" in candidates:
                return True

        if_modified_since = environ.get("HTTP_IF_MODIFIED_SINCE") if environ else None
        if if_modified_since:
            try:
                ims_dt = parsedate_to_datetime(str(if_modified_since))
                if ims_dt and ims_dt.tzinfo is None:
                    ims_dt = ims_dt.replace(tzinfo=_dt.timezone.utc)
            except (TypeError, ValueError):
                ims_dt = None
            if ims_dt and last_modified <= ims_dt:
                return True
        return False

    # ------------------------------------------------------------------
    # Digest helpers
    # ------------------------------------------------------------------
    def _sha256(self, path: Path) -> str:
        """
        Compute the SHA-256 checksum for the given file and cache the result.
        
        Computes the hex-encoded SHA-256 digest of the file at `path`. The computed digest is cached in `self._digest_cache` and a cached value is reused when the file's modification timestamp (mtime_ns) and size match the cached marker. The file is read in chunks using `self.sha256_chunk`.
        
        Returns:
            Hex-encoded SHA-256 digest of the file.
        """
        stat = path.stat()
        cached = self._digest_cache.get(path)
        marker = (stat.st_mtime_ns, stat.st_size)
        if cached and cached[:2] == marker:
            return cached[2]

        digest = hashlib.sha256()
        with path.open("rb") as handle:
            while True:
                chunk = handle.read(self.sha256_chunk)
                if not chunk:
                    break
                digest.update(chunk)
        hex_digest = digest.hexdigest()
        self._digest_cache[path] = (marker[0], marker[1], hex_digest)
        return hex_digest

    def _etag_for(self, path: Path) -> str:
        """
        Produce the HTTP ETag for the file at the given path.
        
        Returns:
            etag (str): The file's SHA-256 hex digest wrapped in double quotes (e.g. "\"abc...\"").
        """
        digest = self._sha256(path)
        return '"' + digest + '"'

    def _stream_file(self, path: Path) -> Iterator[bytes]:
        """
        Yield the file's contents as successive bytes chunks.
        
        Parameters:
            path (Path): Path to the file to read; the file is opened in binary mode and streamed.
        
        Returns:
            Iterator[bytes]: An iterator that yields successive byte chunks of size self.sha256_chunk (final chunk may be smaller) until end-of-file.
        """
        chunk_size = self.sha256_chunk
        with path.open("rb") as handle:
            while True:
                chunk = handle.read(chunk_size)
                if not chunk:
                    break
                yield chunk

    # ------------------------------------------------------------------
    # Response helpers
    # ------------------------------------------------------------------
    def _respond(
        self,
        start_response: WSGIStartResponse,
        status: str,
        headers: Iterable[Tuple[str, str]],
        body: Iterable[bytes] | bytes,
        method: str,
    ) -> Iterator[bytes]:
        """
        Compose and send the HTTP response headers, then return an iterator for the response body bytes.
        
        Merges the provided headers with the application's standard headers (without overwriting any explicitly provided header), ensures a Date header is present, calls the WSGI start_response with the final header list, and returns an iterator yielding the response body bytes. If the request method is "HEAD" or the status indicates "304" (Not Modified), an empty iterator is returned. If `body` is a bytes-like object it is emitted as a single chunk; otherwise the function returns an iterator over `body`.
        
        Parameters:
            start_response (callable): WSGI start_response callable.
            status (str): HTTP status line (e.g. "200 OK").
            headers (Iterable[Tuple[str, str]]): Iterable of (header-name, header-value) pairs to include in the response.
            body (Iterable[bytes] | bytes): Response body as an iterable of bytes or a single bytes-like object.
            method (str): HTTP request method (e.g. "GET", "HEAD").
        
        Returns:
            Iterator[bytes]: An iterator that yields the response body as bytes; yields no bytes for HEAD requests or 304 responses.
        """
        response_headers = list(headers)
        existing_keys = {k.lower() for k, _ in response_headers}
        for key, value in self._standard_headers():
            if key.lower() not in existing_keys:
                response_headers.append((key, value))
                existing_keys.add(key.lower())
        if "date" not in existing_keys:
            response_headers.append(("Date", formatdate(usegmt=True)))
            existing_keys.add("date")
        start_response(status, response_headers)
        if method == "HEAD" or status.startswith("304"):
            return iter(())
        if isinstance(body, (bytes, bytearray)):
            return iter([bytes(body)])
        return iter(body)

    # ------------------------------------------------------------------
    # Misc helpers
    # ------------------------------------------------------------------
    def _is_within_root(self, target: Path) -> bool:
        """
        Check whether a given path is located inside the application's export root.
        
        Parameters:
            target (Path): The path to test; may be absolute or relative.
        
        Returns:
            `True` if `target` is a descendant of `self.export_root`, `False` otherwise.
        """
        try:
            target.relative_to(self.export_root)
            return True
        except ValueError:
            return False
