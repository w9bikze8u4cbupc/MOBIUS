"""WSGI gateway for serving export artifacts."""
from __future__ import annotations

import hashlib
import os
import stat
from datetime import datetime, timezone
from email.utils import format_datetime, parsedate_to_datetime
from pathlib import Path
from typing import Callable, Iterable, Tuple
from urllib.parse import quote, unquote

StartResponse = Callable[[str, list[Tuple[str, str]], None | Tuple[type[BaseException], BaseException, object]], None]

HTTP_200 = "200 OK"
HTTP_304 = "304 Not Modified"
HTTP_400 = "400 Bad Request"
HTTP_401 = "401 Unauthorized"
HTTP_404 = "404 Not Found"
HTTP_405 = "405 Method Not Allowed"
HTTP_500 = "500 Internal Server Error"

_ALLOWED_METHODS = {"GET", "HEAD"}


class GatewayError(Exception):
    """Represents an expected application error."""

    status: str

    def __init__(self, status: str, message: str | None = None) -> None:
        """
        Initialize the GatewayError with an HTTP status and an optional message.
        
        Parameters:
            status (str): HTTP status string to associate with the error (for example "404 Not Found").
            message (str | None): Optional human-readable error message.
        
        Attributes:
            status (str): The HTTP status string provided.
        """
        super().__init__(message)
        self.status = status


class ConfigurationError(RuntimeError):
    """Raised when the gateway is mis-configured."""


def _get_env(name: str) -> str:
    """
    Retrieve a required environment variable's value.
    
    Parameters:
        name (str): The environment variable name to read.
    
    Returns:
        str: The variable's value.
    
    Raises:
        ConfigurationError: If the environment variable is not set or is empty.
    """
    value = os.getenv(name)
    if not value:
        raise ConfigurationError(f"Environment variable {name} must be set")
    return value


def _ensure_within(root: Path, candidate: Path) -> Path:
    """
    Resolve a candidate filesystem path and ensure it is located within the given root directory.
    
    Parameters:
        root (Path): Root directory that the candidate must reside within.
        candidate (Path): Path to resolve and validate.
    
    Returns:
        Path: The resolved (absolute) candidate path.
    
    Raises:
        GatewayError: With HTTP 400 if the candidate path is invalid.
        GatewayError: With HTTP 404 if the resolved path is not within `root`.
    """
    try:
        resolved = candidate.resolve(strict=False)
    except RuntimeError:
        raise GatewayError(HTTP_400, "Invalid path")
    try:
        resolved.relative_to(root)
    except ValueError:
        raise GatewayError(HTTP_404, "Not found")
    return resolved


def _cache_control(mode: str) -> str:
    """
    Map a cache mode name to an HTTP Cache-Control header value.
    
    Parameters:
        mode (str): Cache mode identifier; recognized values are "revalidate", "immutable", and "no-store".
                    If `mode` is unrecognized, "revalidate" is used.
    
    Returns:
        str: The corresponding Cache-Control header value.
    """
    table = {
        "revalidate": "public, max-age=0, must-revalidate",
        "immutable": "public, max-age=31536000, immutable",
        "no-store": "no-store",
    }
    return table.get(mode, table["revalidate"])


def _ascii_fallback(name: str) -> str:
    """
    Produce an ASCII-safe filename by replacing any non-ASCII characters with underscores; if the resulting name is empty, return "download".
    
    Parameters:
        name (str): Original filename to sanitize.
    
    Returns:
        str: Filename containing only ASCII characters (non-ASCII characters replaced with `_`), or "download" if the result is empty.
    """
    try:
        name.encode("ascii")
        return name
    except UnicodeEncodeError:
        return "".join(ch if ord(ch) < 128 else "_" for ch in name) or "download"


def _format_content_disposition(filename: str, disposition: str = "attachment") -> str:
    """
    Build a Content-Disposition header value that includes both an ASCII-safe filename and a UTF-8 encoded filename* parameter.
    
    Parameters:
    	filename (str): Original filename which may contain non-ASCII characters.
    	disposition (str): Disposition type (e.g., "attachment" or "inline").
    
    Returns:
    	content_disposition (str): A Content-Disposition header value containing `filename` with an ASCII fallback and `filename*` with the UTF-8 encoded filename.
    """
    ascii_name = _ascii_fallback(filename)
    quoted = quote(filename)
    return f"{disposition}; filename=\"{ascii_name}\"; filename*=UTF-8''{quoted}"


def _httpdate(ts: float) -> str:
    """
    Format a POSIX timestamp as an RFC 1123 HTTP-date string.
    
    Parameters:
        ts (float): Seconds since the Unix epoch (UTC).
    
    Returns:
        str: Date/time formatted as an HTTP-date (e.g., "Tue, 15 Nov 1994 08:12:31 GMT") compliant with RFC 1123.
    """
    return format_datetime(datetime.fromtimestamp(ts, tz=timezone.utc), usegmt=True)


def _parse_http_date(value: str) -> datetime | None:
    """
    Parse an HTTP-date string (RFC 7231) into a UTC-aware datetime.
    
    Parameters:
        value (str): HTTP-date string to parse (e.g. IMF-fixdate, RFC850, or asctime formats).
    
    Returns:
        datetime | None: A timezone-aware datetime in UTC if parsing succeeds, None otherwise.
    """
    try:
        parsed = parsedate_to_datetime(value)
    except (TypeError, ValueError):
        return None
    if parsed is None:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _load_file_info(path: Path) -> tuple[str, int, float]:
    """
    Retrieve the filename, size, and modification time for a regular file.
    
    Parameters:
        path (Path): Path to the target file.
    
    Returns:
        tuple[str, int, float]: A tuple containing the file's base name, size in bytes, and modification time as a POSIX timestamp.
    
    Raises:
        GatewayError: With HTTP 404 if the path does not exist or is not a regular file.
    """
    try:
        stat_result = path.stat()
    except FileNotFoundError as exc:
        raise GatewayError(HTTP_404, "Not found") from exc
    if not stat.S_ISREG(stat_result.st_mode):
        raise GatewayError(HTTP_404, "Not found")
    return str(path.name), stat_result.st_size, stat_result.st_mtime


def _sha256(path: Path) -> str:
    """
    Compute the SHA-256 digest of a file and return it as a hexadecimal string.
    
    Parameters:
        path (Path): Path to the file whose SHA-256 digest will be computed.
    
    Returns:
        str: Lowercase hexadecimal SHA-256 digest of the file contents.
    """
    digest = hashlib.sha256()
    with path.open("rb") as file_obj:
        for chunk in iter(lambda: file_obj.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _iter_file(path: Path, chunk_size: int = 1024 * 64) -> Iterable[bytes]:
    """
    Yield the file's contents as successive binary chunks suitable for streaming.
    
    Reads the file at `path` in binary mode and yields consecutive byte strings up to `chunk_size` bytes each, until EOF.
    
    Parameters:
        path (Path): Path to the file to read.
        chunk_size (int): Maximum number of bytes per yielded chunk. Default is 65536.
    
    Returns:
        Iterable[bytes]: An iterable that yields byte strings, each containing up to `chunk_size` bytes from the file.
    """
    with path.open("rb") as file_obj:
        while True:
            chunk = file_obj.read(chunk_size)
            if not chunk:
                break
            yield chunk


def _needs_revalidation(environ: dict[str, str], etag: str, mtime: float) -> bool:
    """
    Determines whether the request's conditional headers indicate the resource is not modified.
    
    Checks If-None-Match and If-Modified-Since in the provided WSGI environ to decide if the stored `etag` or modification time `mtime` satisfies the client's caching conditions.
    
    Parameters:
        environ (dict[str, str]): WSGI environment; may contain `HTTP_IF_NONE_MATCH` and `HTTP_IF_MODIFIED_SINCE`.
        etag (str): Entity tag for the resource.
        mtime (float): Resource modification time as a Unix timestamp (seconds since epoch).
    
    Returns:
        `true` if the request conditions indicate the resource is still fresh (not modified), `false` otherwise.
    """
    if_none_match = environ.get("HTTP_IF_NONE_MATCH")
    if if_none_match:
        candidates = {tag.strip() for tag in if_none_match.split(",")}
        if etag in candidates or "*" in candidates:
            return True
    if_modified_since = environ.get("HTTP_IF_MODIFIED_SINCE")
    if if_modified_since:
        parsed = _parse_http_date(if_modified_since)
        if parsed and mtime <= parsed.timestamp() + 1:
            return True
    return False


def _require_api_key(environ: dict[str, str], expected: str | None) -> None:
    """
    Enforces that the request contains the expected API key.
    
    Parameters:
        environ (dict[str, str]): WSGI environment; the function reads the `HTTP_X_MOBIUS_KEY` header from this mapping.
        expected (str | None): The expected API key value. If `None`, authentication is considered missing/disabled and will fail.
    
    Raises:
        GatewayError: Raised with HTTP 401 status when the provided API key is missing or does not match `expected`.
    """
    provided = environ.get("HTTP_X_MOBIUS_KEY")
    if not expected or not provided or provided != expected:
        raise GatewayError(HTTP_401, "Unauthorized")


def _maybe_require_api_key(environ: dict[str, str], expected: str, *, public: bool) -> None:
    """
    Require the configured API key for non-public endpoints.
    
    When `public` is True this is a no-op; otherwise it validates the API key present in
    the WSGI `environ` against `expected` and delegates to the underlying validator.
    
    Parameters:
        environ (dict[str, str]): WSGI environment mapping containing request headers.
        expected (str): Expected API key value.
        public (bool): If True, skip API key validation.
    """
    if public:
        return
    _require_api_key(environ, expected)


def _response_headers(
    *,
    cache_control: str,
    content_type: str,
    content_length: int | None,
    content_disposition: str,
    etag: str | None,
    last_modified: str | None,
    version: str | None,
) -> list[Tuple[str, str]]:
    """
    Builds the standard HTTP response headers for serving an export artifact.
    
    Parameters:
        cache_control (str): Value for the Cache-Control header.
        content_type (str): Value for the Content-Type header.
        content_length (int | None): Value for the Content-Length header; omitted if None.
        content_disposition (str): Value for the Content-Disposition header.
        etag (str | None): Value for the ETag header; omitted if None or empty.
        last_modified (str | None): Value for the Last-Modified header; omitted if None or empty.
        version (str | None): Value for the X-Mobius-Version header; omitted if None or empty.
    
    Returns:
        list[Tuple[str, str]]: Ordered list of (header-name, header-value) tuples including
        Content-Type, Cache-Control, Content-Disposition, Vary, Accept-Ranges and any provided
        Content-Length, ETag, Last-Modified, and X-Mobius-Version headers.
    """
    headers = [
        ("Content-Type", content_type),
        ("Cache-Control", cache_control),
        ("Content-Disposition", content_disposition),
        ("Vary", "Accept-Encoding"),
        ("Accept-Ranges", "bytes"),
    ]
    if content_length is not None:
        headers.append(("Content-Length", str(content_length)))
    if etag:
        headers.append(("ETag", etag))
    if last_modified:
        headers.append(("Last-Modified", last_modified))
    if version:
        headers.append(("X-Mobius-Version", version))
    return headers


def _handle_health(
    environ: dict[str, str],
    start_response: StartResponse,
    *,
    api_key: str,
    version: str | None,
    public: bool,
) -> list[bytes]:
    """
    Handle the /healthz health check endpoint, enforcing API-key access as configured and returning a short plain-text health response.
    
    If access is permitted, responds with status 200, Cache-Control: no-store, Content-Type: text/plain; charset=utf-8, and an optional X-Mobius-Version header. For GET requests the body is `b"OK"`; for HEAD requests the body is empty. If access is denied by API-key validation, the function starts the appropriate error response and returns an empty body.
    
    Parameters:
        api_key (str): Expected API key used for validation when the endpoint is not public.
        version (str | None): Optional version string to include as `X-Mobius-Version` in the response headers.
        public (bool): Whether the health endpoint is accessible without an API key.
    
    Returns:
        list[bytes]: Response body as a list of byte chunks (`[b"OK"]` for a successful GET, `[]` for HEAD or when access is denied).
    """
    try:
        _maybe_require_api_key(environ, api_key, public=public)
    except GatewayError as exc:
        start_response(exc.status, [("Cache-Control", "no-store"), ("Content-Length", "0")])
        return []
    headers = [("Cache-Control", "no-store"), ("Content-Type", "text/plain; charset=utf-8"), ("Content-Length", "2")]
    if version:
        headers.append(("X-Mobius-Version", version))
    start_response(HTTP_200, headers)
    if environ.get("REQUEST_METHOD") == "HEAD":
        return []
    return [b"OK"]


def _handle_checksum(
    *,
    environ: dict[str, str],
    path: Path,
    filename: str,
    cache_control: str,
    start_response: StartResponse,
    version: str | None,
) -> list[bytes]:
    """
    Serve the SHA-256 checksum for the given file as a `.sha256` text response, honoring conditional requests and cache headers.
    
    Parameters:
        environ (dict): WSGI environment for the request; used to inspect method and conditional headers.
        path (Path): Path to the target file whose checksum is served.
        filename (str): Base filename to use in the response body and Content-Disposition (without the `.sha256` suffix).
        cache_control (str): Value for the Cache-Control response header.
        start_response (StartResponse): WSGI start_response callable used to send status and headers.
        version (str | None): Optional version string included as an X-Mobius-Version header when present.
    
    Returns:
        list[bytes]: Iterable of response body chunks. Returns an empty list for HEAD requests or when a 304 Not Modified response is sent; otherwise returns a single-element list containing the checksum text bytes.
    """
    etag = f'"{_sha256(path)}"'
    mtime = path.stat().st_mtime
    if _needs_revalidation(environ, etag, mtime):
        headers = _response_headers(
            cache_control=cache_control,
            content_type="text/plain; charset=utf-8",
            content_length=None,
            content_disposition=_format_content_disposition(f"{filename}.sha256", disposition="inline"),
            etag=etag,
            last_modified=_httpdate(mtime),
            version=version,
        )
        start_response(HTTP_304, headers)
        return []

    checksum = etag.strip('"')
    body_text = f"{checksum}  {filename}\n"
    body = body_text.encode("utf-8")
    headers = _response_headers(
        cache_control=cache_control,
        content_type="text/plain; charset=utf-8",
        content_length=len(body),
        content_disposition=_format_content_disposition(f"{filename}.sha256", disposition="inline"),
        etag=etag,
        last_modified=_httpdate(mtime),
        version=version,
    )
    start_response(HTTP_200, headers)
    if environ["REQUEST_METHOD"] == "HEAD":
        return []
    return [body]


def _handle_export(
    *,
    environ: dict[str, str],
    path: Path,
    cache_control: str,
    start_response: StartResponse,
    version: str | None,
) -> Iterable[bytes]:
    """
    Serve a ZIP export file or a `304 Not Modified` response based on conditional request headers.
    
    Builds and sends the appropriate HTTP response headers (status 200 or 304) via the WSGI start_response callback and returns the response body as an iterable of bytes. For GET requests this yields the file contents; for HEAD requests or when the request is revalidated it returns an empty iterable.
    
    Parameters:
        path (Path): Filesystem path to the ZIP file to serve.
        cache_control (str): Value for the Cache-Control response header.
        version (str | None): Optional version string to include in the X-Mobius-Version response header.
    
    Returns:
        Iterable[bytes]: The response body — the ZIP file bytes for GET, or an empty iterable for HEAD or 304 responses.
    """
    filename, size, mtime = _load_file_info(path)
    etag = f'"{_sha256(path)}"'

    if _needs_revalidation(environ, etag, mtime):
        headers = _response_headers(
            cache_control=cache_control,
            content_type="application/zip",
            content_length=None,
            content_disposition=_format_content_disposition(filename),
            etag=etag,
            last_modified=_httpdate(mtime),
            version=version,
        )
        start_response(HTTP_304, headers)
        return []

    headers = _response_headers(
        cache_control=cache_control,
        content_type="application/zip",
        content_length=size,
        content_disposition=_format_content_disposition(filename),
        etag=etag,
        last_modified=_httpdate(mtime),
        version=version,
    )
    start_response(HTTP_200, headers)
    if environ["REQUEST_METHOD"] == "HEAD":
        return []
    return _iter_file(path)


def application(environ: dict[str, str], start_response: StartResponse) -> Iterable[bytes]:
    """
    WSGI application entry point that serves export ZIP files and their SHA-256 checksums, provides a health endpoint, enforces API-key access, and applies cache and HTTP semantics.
    
    Reads configuration from the environment: MOBIUS_EXPORT_ROOT (filesystem root for exports), MOBIUS_API_KEY (expected API key), MOBIUS_CACHE_MODE (cache behavior), MOBIUS_VERSION (optional version header), and MOBIUS_HEALTH_PUBLIC (makes /healthz public when set to "1"). Routes requests as follows: responds to /healthz, requires the API key for other endpoints, validates and normalizes paths under /exports/, serves .zip files with proper Content-Type, Content-Disposition, ETag and Last-Modified, and serves .zip.sha256 checksum responses. Returns appropriate HTTP status codes (200, 304, 400, 401, 404, 405, 500) and honors GET and HEAD semantics.
    
    Parameters:
        environ (dict[str, str]): WSGI environment mapping for the request.
        start_response (StartResponse): WSGI start_response callable used to set the response status and headers.
    
    Returns:
        Iterable[bytes]: An iterable yielding the response body bytes; may be empty for HEAD requests or responses with no body.
    """
    try:
        root = Path(_get_env("MOBIUS_EXPORT_ROOT")).resolve()
        api_key = _get_env("MOBIUS_API_KEY")
        cache_mode = os.getenv("MOBIUS_CACHE_MODE", "revalidate")
        version = os.getenv("MOBIUS_VERSION")
        health_public = os.getenv("MOBIUS_HEALTH_PUBLIC") == "1"
    except ConfigurationError as exc:
        start_response(HTTP_500, [("Content-Type", "text/plain; charset=utf-8"), ("Content-Length", str(len(str(exc))))])
        return [str(exc).encode("utf-8")]

    method = environ.get("REQUEST_METHOD", "GET")
    if method not in _ALLOWED_METHODS:
        start_response(HTTP_405, [("Allow", ", ".join(sorted(_ALLOWED_METHODS))), ("Content-Length", "0")])
        return []

    path_info = environ.get("PATH_INFO", "")
    if not path_info:
        start_response(HTTP_404, [("Content-Length", "0")])
        return []

    if path_info == "/healthz":
        return _handle_health(
            environ,
            start_response,
            api_key=api_key,
            version=version,
            public=health_public,
        )

    try:
        _require_api_key(environ, api_key)
    except GatewayError as exc:
        start_response(exc.status, [("Content-Length", "0"), ("WWW-Authenticate", "Mobius realm=\"exports\"")])
        return []

    if not path_info.startswith("/exports/"):
        start_response(HTTP_404, [("Content-Length", "0")])
        return []

    decoded = unquote(path_info[len("/exports"):])
    if decoded.startswith("/"):
        decoded = decoded[1:]
    if not decoded or decoded.endswith("/"):
        start_response(HTTP_404, [("Content-Length", "0")])
        return []

    relative = Path(decoded)
    if any(part in {"", ".", ".."} for part in relative.parts):
        start_response(HTTP_404, [("Content-Length", "0")])
        return []

    candidate = root / relative
    try:
        safe_path = _ensure_within(root, candidate)
    except GatewayError as exc:
        start_response(exc.status, [("Content-Length", "0")])
        return []

    cache_control = _cache_control(cache_mode)

    if safe_path.name.endswith(".zip.sha256"):
        base = safe_path.with_suffix("")
        if base.suffix != ".zip":
            start_response(HTTP_404, [("Content-Length", "0")])
            return []
        if not base.exists():
            start_response(HTTP_404, [("Content-Length", "0")])
            return []
        return _handle_checksum(
            environ=environ,
            path=base,
            filename=base.name,
            cache_control=cache_control,
            start_response=start_response,
            version=version,
        )

    if safe_path.suffix != ".zip":
        start_response(HTTP_404, [("Content-Length", "0")])
        return []

    return _handle_export(
        environ=environ,
        path=safe_path,
        cache_control=cache_control,
        start_response=start_response,
        version=version,
    )
