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
        super().__init__(message)
        self.status = status


class ConfigurationError(RuntimeError):
    """Raised when the gateway is mis-configured."""


def _get_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise ConfigurationError(f"Environment variable {name} must be set")
    return value


def _ensure_within(root: Path, candidate: Path) -> Path:
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
    table = {
        "revalidate": "public, max-age=0, must-revalidate",
        "immutable": "public, max-age=31536000, immutable",
        "no-store": "no-store",
    }
    return table.get(mode, table["revalidate"])


def _ascii_fallback(name: str) -> str:
    try:
        name.encode("ascii")
        return name
    except UnicodeEncodeError:
        return "".join(ch if ord(ch) < 128 else "_" for ch in name) or "download"


def _format_content_disposition(filename: str, disposition: str = "attachment") -> str:
    ascii_name = _ascii_fallback(filename)
    quoted = quote(filename)
    return f"{disposition}; filename=\"{ascii_name}\"; filename*=UTF-8''{quoted}"


def _httpdate(ts: float) -> str:
    return format_datetime(datetime.fromtimestamp(ts, tz=timezone.utc), usegmt=True)


def _parse_http_date(value: str) -> datetime | None:
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
    try:
        stat_result = path.stat()
    except FileNotFoundError as exc:
        raise GatewayError(HTTP_404, "Not found") from exc
    if not stat.S_ISREG(stat_result.st_mode):
        raise GatewayError(HTTP_404, "Not found")
    return str(path.name), stat_result.st_size, stat_result.st_mtime


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file_obj:
        for chunk in iter(lambda: file_obj.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _iter_file(path: Path, chunk_size: int = 1024 * 64) -> Iterable[bytes]:
    with path.open("rb") as file_obj:
        while True:
            chunk = file_obj.read(chunk_size)
            if not chunk:
                break
            yield chunk


def _needs_revalidation(environ: dict[str, str], etag: str, mtime: float) -> bool:
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
    provided = environ.get("HTTP_X_MOBIUS_KEY")
    if not expected or not provided or provided != expected:
        raise GatewayError(HTTP_401, "Unauthorized")


def _maybe_require_api_key(environ: dict[str, str], expected: str, *, public: bool) -> None:
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

