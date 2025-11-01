"""WSGI application that streams export artifacts and checksum metadata."""

from __future__ import annotations

import hashlib
import os
from datetime import datetime, timezone
from email.utils import format_datetime, parsedate_to_datetime
from pathlib import Path
from typing import Callable, Iterable, List, Mapping, MutableMapping, Optional, Tuple
from urllib.parse import quote
from wsgiref.util import FileWrapper

StartResponse = Callable[[str, List[Tuple[str, str]]], Callable[[bytes], None]]
HeaderList = List[Tuple[str, str]]


def _http_date_from_timestamp(timestamp: float) -> str:
    """Return an RFC 7231 HTTP-date string for ``timestamp``."""

    dt = datetime.fromtimestamp(timestamp, tz=timezone.utc)
    return format_datetime(dt, usegmt=True)


def _parse_if_modified_since(value: str) -> Optional[datetime]:
    """
    Parse an HTTP `If-Modified-Since` header value into a UTC-aware datetime.
    
    Parameters:
        value (str): The raw `If-Modified-Since` header value to parse.
    
    Returns:
        datetime | None: A timezone-aware `datetime` in UTC when parsing succeeds;
        `None` if the value cannot be parsed. Naive datetimes are treated as UTC.
    """
    try:
        dt = parsedate_to_datetime(value)
    except (TypeError, ValueError, IndexError):
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _sanitise_ascii_filename(filename: str) -> str:
    """
    Create an ASCII-safe filename suitable for HTTP headers and filesystems.
    
    Replaces double-quote characters with apostrophes; preserves visible ASCII characters (code points 32–126);
    replaces all other characters with underscores. If the result is empty, returns "download".
    
    Parameters:
        filename (str): Original filename to sanitise.
    
    Returns:
        str: The sanitised ASCII filename, or "download" if the result would be empty.
    """
    ascii_safe = []
    for char in filename:
        if char == '"':
            ascii_safe.append("'")
        elif 32 <= ord(char) <= 126:
            ascii_safe.append(char)
        else:
            ascii_safe.append("_")
    candidate = "".join(ascii_safe)
    return candidate or "download"


def _build_content_disposition(filename: str, disposition: str) -> str:
    """
    Builds a Content-Disposition header value containing both an ASCII-safe filename and a UTF-8 encoded filename parameter.
    
    Parameters:
        filename (str): The original filename to include in the header.
        disposition (str): The disposition type, for example "attachment" or "inline".
    
    Returns:
        content_disposition (str): A Content-Disposition header value with an ASCII `filename` and a UTF-8 `filename*` parameter, e.g. `attachment; filename="file.txt"; filename*=UTF-8''file.txt`.
    """
    ascii_name = _sanitise_ascii_filename(filename)
    encoded = quote(filename, safe="")
    return f"{disposition}; filename=\"{ascii_name}\"; filename*=UTF-8''{encoded}"


class GatewayApplication:
    """Serve export artifacts and checksum files over WSGI."""

    DEFAULT_CACHE_MODE = "revalidate"
    CACHE_CONTROL_POLICIES = {
        "revalidate": "public, max-age=0, must-revalidate",
        "immutable": "public, max-age=31536000, immutable",
        "no-store": "no-store",
    }

    def __init__(
        self,
        export_root: Path | str,
        *,
        api_key: Optional[str] = None,
        cache_mode: Optional[str] = None,
        version: Optional[str] = None,
        health_public: bool = False,
    ) -> None:
        """
        Initialize the GatewayApplication with configuration for export storage, authorization, caching, and health visibility.
        
        Parameters:
            export_root (Path | str): Root filesystem path containing export artifacts; stored as a resolved Path.
            api_key (Optional[str]): API key required for requests when set.
            cache_mode (Optional[str]): Cache policy key; normalized to lowercase and must be one of GatewayApplication.CACHE_CONTROL_POLICIES.
            version (Optional[str]): Optional version string exposed in responses when present.
            health_public (bool): If True, the /healthz endpoint is accessible without API key.
        
        Raises:
            ValueError: If `cache_mode` (after normalization) is not a supported key in GatewayApplication.CACHE_CONTROL_POLICIES.
        """
        self.export_root = Path(export_root).resolve()
        self.api_key = api_key
        self.cache_mode = (cache_mode or self.DEFAULT_CACHE_MODE).lower()
        if self.cache_mode not in self.CACHE_CONTROL_POLICIES:
            raise ValueError(f"Unsupported cache mode: {self.cache_mode}")
        self.version = version
        self.health_public = health_public

    @classmethod
    def from_environ(cls, environ: Optional[Mapping[str, str]] = None) -> "GatewayApplication":
        """
        Constructs a GatewayApplication from environment variables.
        
        Parameters:
            environ (Optional[Mapping[str, str]]): Optional mapping of environment variables to read; if omitted, os.environ is used. Recognized variables: MOBIUS_EXPORT_ROOT (required), MOBIUS_API_KEY, MOBIUS_CACHE_MODE, MOBIUS_VERSION, MOBIUS_HEALTH_PUBLIC.
        
        Returns:
            GatewayApplication: A configured GatewayApplication instance based on the provided environment.
        
        Raises:
            RuntimeError: If MOBIUS_EXPORT_ROOT is not set in the environment.
        """
        env = environ or os.environ
        root = env.get("MOBIUS_EXPORT_ROOT")
        if not root:
            raise RuntimeError("MOBIUS_EXPORT_ROOT is required")
        api_key = env.get("MOBIUS_API_KEY")
        cache_mode = env.get("MOBIUS_CACHE_MODE")
        version = env.get("MOBIUS_VERSION")
        health_public = env.get("MOBIUS_HEALTH_PUBLIC", "0").lower() in {"1", "true", "yes"}
        return cls(
            root,
            api_key=api_key,
            cache_mode=cache_mode,
            version=version,
            health_public=health_public,
        )

    def __call__(self, environ: MutableMapping[str, object], start_response: StartResponse) -> Iterable[bytes]:
        """
        WSGI application entry point that enforces allowed methods, checks authorization, and dispatches requests to health or export handlers.
        
        Parameters:
            environ (MutableMapping[str, object]): WSGI environment mapping for the request.
            start_response (StartResponse): WSGI start_response callable used to begin the HTTP response.
        
        Returns:
            Iterable[bytes]: An iterable of byte chunks for the response body; may be empty for HEAD requests or when no body is required.
        """
        method = environ.get("REQUEST_METHOD", "GET")
        if method not in {"GET", "HEAD"}:
            start_response("405 Method Not Allowed", [("Allow", "GET, HEAD")])
            return []

        path = environ.get("PATH_INFO", "")
        if not isinstance(path, str):
            path = str(path)

        if not self._is_authorised(path, environ):
            return self._unauthorised(start_response)

        if path == "/healthz":
            return self._serve_health(method, start_response)

        if path.startswith("/exports/"):
            return self._serve_export(method, path, environ, start_response)

        start_response("404 Not Found", [("Content-Type", "text/plain; charset=utf-8")])
        return [b"Not Found"] if method == "GET" else []

    def _is_authorised(self, path: str, environ: Mapping[str, object]) -> bool:
        """
        Determine whether a request is authorized to access the given path.
        
        Checks the public-health override, allows access when no API key is configured, and otherwise compares the `HTTP_X_MOBIUS_KEY` value from the WSGI `environ` (decoded if bytes) to the configured API key.
        
        Parameters:
            path (str): Request path (e.g., "/healthz" or "/exports/...").
            environ (Mapping[str, object]): WSGI environment; may contain the `HTTP_X_MOBIUS_KEY` header value.
        
        Returns:
            bool: `True` if the request is authorized, `False` otherwise.
        """
        if path == "/healthz" and self.health_public:
            return True
        if self.api_key is None:
            return True
        provided = environ.get("HTTP_X_MOBIUS_KEY")
        if isinstance(provided, bytes):
            provided = provided.decode()
        return provided == self.api_key

    def _unauthorised(self, start_response: StartResponse) -> Iterable[bytes]:
        """
        Responds with a 401 Unauthorized status and appropriate authentication and cache-control headers.
        
        Sets headers: Content-Type "text/plain; charset=utf-8", WWW-Authenticate "Mobius", and Cache-Control "no-store".
        
        Returns:
            A single-item iterable containing the UTF-8 bytes for "Unauthorized".
        """
        start_response(
            "401 Unauthorized",
            [
                ("Content-Type", "text/plain; charset=utf-8"),
                ("WWW-Authenticate", "Mobius"),
                ("Cache-Control", "no-store"),
            ],
        )
        return [b"Unauthorized"]

    def _serve_health(self, method: str, start_response: StartResponse) -> Iterable[bytes]:
        """
        Serve the health check endpoint and emit appropriate HTTP headers.
        
        Sets Content-Type to "text/plain; charset=utf-8" and Cache-Control to "no-store". If the application has a version configured, adds an X-Mobius-Version header. For GET requests returns a single-line body "ok\n"; for HEAD requests returns an empty iterable.
        
        Parameters:
            method (str): The HTTP method of the request (expected "GET" or "HEAD").
        
        Returns:
            Iterable[bytes]: A body iterator containing b"ok\n" for GET, or an empty iterable for HEAD.
        """
        headers = [
            ("Content-Type", "text/plain; charset=utf-8"),
            ("Cache-Control", "no-store"),
        ]
        if self.version:
            headers.append(("X-Mobius-Version", self.version))

        start_response("200 OK", headers)
        return [b"ok\n"] if method == "GET" else []

    def _serve_export(
        self,
        method: str,
        path: str,
        environ: Mapping[str, object],
        start_response: StartResponse,
    ) -> Iterable[bytes]:
        """
        Route requests under the /exports/ prefix to the appropriate resource handler or respond with 404 when the requested export is missing or unsupported.
        
        Parameters:
        	method: The HTTP method for the request (e.g., "GET" or "HEAD").
        	path: The full request path; must start with "/exports/" to be routed here.
        	environ: The WSGI environment mapping for the request.
        	start_response: The WSGI start_response callable used to begin the HTTP response.
        
        Returns:
        	An iterable of response body bytes. For GET requests this contains the response payload when a resource is served; for HEAD or responses with no body (such as 404) the iterable will be empty.
        """
        requested = path[len("/exports/") :]
        if not requested:
            start_response("404 Not Found", [("Content-Type", "text/plain; charset=utf-8")])
            return [b"Not Found"] if method == "GET" else []

        if requested.endswith(".zip"):
            return self._serve_zip(method, requested, environ, start_response)
        if requested.endswith(".zip.sha256"):
            return self._serve_sha256(method, requested, environ, start_response)

        start_response("404 Not Found", [("Content-Type", "text/plain; charset=utf-8")])
        return [b"Not Found"] if method == "GET" else []

    def _resolve_path(self, relative: str) -> Optional[Path]:
        """
        Resolve a requested filesystem path against the configured export root and ensure it stays inside that root.
        
        Parameters:
            relative (str): The requested path segment to resolve against the export root.
        
        Returns:
            Path | None: A resolved Path within the export root if the resolved location is inside the export root; `None` if the resolved location lies outside the export root (directory traversal or escape).
        """
        unsafe = Path(relative)
        candidate = (self.export_root / unsafe).resolve()
        try:
            candidate.relative_to(self.export_root)
        except ValueError:
            return None
        return candidate

    def _serve_zip(
        self,
        method: str,
        requested: str,
        environ: Mapping[str, object],
        start_response: StartResponse,
    ) -> Iterable[bytes]:
        """
        Serve a ZIP file from the configured export root with appropriate HTTP headers, caching, and support for GET and HEAD.
        
        Computes the file's SHA-256 digest to produce an ETag, sets Last-Modified, Cache-Control, Content-Type (application/zip), Accept-Ranges, and a Content-Disposition attachment with a safe filename. If the request matches conditional headers (If-None-Match or If-Modified-Since) the function responds with 304 and no body. If the file is missing responds 404; for HEAD requests responses contain the same headers but no body. For successful GET requests returns a streaming wrapper for the file.
        
        Parameters:
            method (str): The HTTP method of the request, expected to be "GET" or "HEAD".
            requested (str): The export-relative path being requested (the portion after "/exports/").
            environ (Mapping[str, object]): The WSGI environment used to read conditional request headers.
            start_response (StartResponse): The WSGI start_response callable.
        
        Returns:
            Iterable[bytes]: The response body iterable — an empty iterable for HEAD or for 304/404 (when method is HEAD), a bytes singleton for 404 GET ("Not Found"), or a FileWrapper streaming the ZIP file for a successful GET.
        """
        file_path = self._resolve_path(requested)
        if file_path is None or not file_path.is_file():
            start_response("404 Not Found", [("Content-Type", "text/plain; charset=utf-8")])
            return [b"Not Found"] if method == "GET" else []

        digest = self._digest_for_path(file_path)
        stat = file_path.stat()
        last_modified = _http_date_from_timestamp(stat.st_mtime)
        etag = f'"{digest}"'

        base_headers = self._common_headers(last_modified, etag)
        base_headers.append(("Vary", "Accept-Encoding"))
        base_headers.append(("Accept-Ranges", "bytes"))
        base_headers.append(("Content-Type", "application/zip"))
        base_headers.append(
            ("Content-Disposition", _build_content_disposition(file_path.name, "attachment"))
        )
        if self.version:
            base_headers.append(("X-Mobius-Version", self.version))

        if self._is_not_modified(etag, stat.st_mtime, environ):
            start_response("304 Not Modified", base_headers)
            return []

        headers = list(base_headers)
        headers.append(("Content-Length", str(stat.st_size)))

        start_response("200 OK", headers)
        if method == "HEAD":
            return []

        return FileWrapper(open(file_path, "rb"))

    def _serve_sha256(
        self,
        method: str,
        requested: str,
        environ: Mapping[str, object],
        start_response: StartResponse,
    ) -> Iterable[bytes]:
        """
        Serve the SHA-256 checksum file corresponding to a requested ZIP export.
        
        Responds with a plain-text line "<digest>  <zip_name>\n" for GET requests and an empty body for HEAD. If the underlying ZIP is missing, responds 404; if the resource is unmodified according to request headers, responds 304 with no body.
        
        Parameters:
        	method (str): HTTP method, expected "GET" or "HEAD".
        	requested (str): Requested path component ending with ".sha256".
        	environ (Mapping[str, object]): WSGI environment used to inspect conditional request headers.
        	start_response (StartResponse): WSGI start_response callable to begin the response.
        
        Returns:
        	Iterable[bytes]: For GET, a single-item iterable containing the UTF-8 encoded checksum line; for HEAD or 304/404 responses, an empty iterable.
        """
        zip_name = requested[: -len(".sha256")]
        zip_path = self._resolve_path(zip_name)
        if zip_path is None or not zip_path.is_file():
            start_response("404 Not Found", [("Content-Type", "text/plain; charset=utf-8")])
            return [b"Not Found"] if method == "GET" else []

        digest = self._digest_for_path(zip_path)
        stat = zip_path.stat()
        last_modified = _http_date_from_timestamp(stat.st_mtime)
        etag = f'"{digest}-sha"'

        base_headers = self._common_headers(last_modified, etag)
        base_headers.append(("Vary", "Accept-Encoding"))
        base_headers.append(("Accept-Ranges", "bytes"))
        base_headers.append(("Content-Type", "text/plain; charset=utf-8"))
        base_headers.append(
            (
                "Content-Disposition",
                _build_content_disposition(zip_path.name + ".sha256", "inline"),
            )
        )
        if self.version:
            base_headers.append(("X-Mobius-Version", self.version))

        if self._is_not_modified(etag, stat.st_mtime, environ):
            start_response("304 Not Modified", base_headers)
            return []

        body = f"{digest}  {zip_path.name}\n".encode("utf-8")
        headers = list(base_headers)
        headers.append(("Content-Length", str(len(body))))

        start_response("200 OK", headers)
        return [] if method == "HEAD" else [body]

    def _common_headers(self, last_modified: str, etag: str) -> HeaderList:
        """
        Builds the common HTTP response headers for a resource.
        
        Parameters:
            last_modified (str): HTTP-date string for the Last-Modified header (RFC 7231, GMT).
            etag (str): Entity tag value for the ETag header.
        
        Returns:
            HeaderList: List of header tuples including Last-Modified, ETag, and Cache-Control (derived from the application's configured cache_mode).
        """
        headers = [
            ("Last-Modified", last_modified),
            ("ETag", etag),
            ("Cache-Control", self.CACHE_CONTROL_POLICIES[self.cache_mode]),
        ]
        return headers

    def _is_not_modified(
        self,
        etag: str,
        mtime: float,
        environ: Mapping[str, object],
    ) -> bool:
        """
        Determine whether a resource identified by ETag and modification time should be treated as not modified
        according to the request's conditional headers.
        
        Parameters:
            etag (str): The current ETag value for the resource.
            mtime (float): The resource's last-modified time as a POSIX timestamp (seconds since epoch).
            environ (Mapping[str, object]): WSGI environment containing request headers (e.g., `HTTP_IF_NONE_MATCH`,
                `HTTP_IF_MODIFIED_SINCE`).
        
        Returns:
            bool: `True` if the request's conditional headers indicate the resource has not been modified,
            `False` otherwise.
        """
        if_none_match = environ.get("HTTP_IF_NONE_MATCH")
        if isinstance(if_none_match, bytes):
            if_none_match = if_none_match.decode()
        if if_none_match:
            etag_values = [tag.strip() for tag in if_none_match.split(",") if tag.strip()]
            if etag in etag_values or "*" in etag_values:
                return True

        ims = environ.get("HTTP_IF_MODIFIED_SINCE")
        if isinstance(ims, bytes):
            ims = ims.decode()
        if ims:
            parsed = _parse_if_modified_since(ims)
            if parsed is not None:
                resource_time = datetime.fromtimestamp(mtime, tz=timezone.utc)
                if resource_time <= parsed:
                    return True
        return False

    def _digest_for_path(self, path: Path) -> str:
        """
        Compute the SHA-256 hash of the file at path and return its hexadecimal digest.
        
        Returns:
            hex_digest (str): Lowercase hexadecimal SHA-256 digest of the file contents.
        """
        with open(path, "rb") as fh:
            digest = hashlib.file_digest(fh, "sha256")
        return digest.hexdigest()