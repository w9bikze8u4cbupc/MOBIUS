"""Minimal WSGI export gateway for Mobius artifacts."""

from __future__ import annotations

import datetime as _dt
import email.utils
import hmac
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Iterator, MutableMapping, Optional
from urllib.parse import unquote


_STATUS_TEXT = {
    200: "OK",
    204: "No Content",
    301: "Moved Permanently",
    302: "Found",
    304: "Not Modified",
    400: "Bad Request",
    401: "Unauthorized",
    403: "Forbidden",
    404: "Not Found",
    405: "Method Not Allowed",
    500: "Internal Server Error",
}


@dataclass
class _Response:
    status: int
    headers: MutableMapping[str, str]
    body: Iterable[bytes]


class ExportGateway:
    """WSGI application that serves export artifacts from disk."""

    def __init__(
        self,
        root: os.PathLike[str] | str,
        api_key: str,
        *,
        health_public: bool = False,
        immutable_max_age: int = 31536000,
    ) -> None:
        self._root = Path(root).resolve()
        self._api_key = api_key
        self._health_public = health_public
        self._immutable_max_age = immutable_max_age

    # ------------------------------------------------------------------
    def __call__(self, environ, start_response):  # type: ignore[override]
        try:
            response = self._dispatch(environ)
        except Exception:  # pragma: no cover - defensively convert to 500
            response = self._internal_error()

        status_line = f"{response.status} {_STATUS_TEXT.get(response.status, '')}".strip()
        header_list = [(key, value) for key, value in response.headers.items()]
        start_response(status_line, header_list)
        return response.body

    # ------------------------------------------------------------------
    def _dispatch(self, environ) -> _Response:
        method = environ.get("REQUEST_METHOD", "GET").upper()
        if method not in {"GET", "HEAD"}:
            return self._method_not_allowed()

        raw_path = environ.get("PATH_INFO", "")
        try:
            path = unquote(raw_path)
        except Exception:
            return self._not_found()

        if not path:
            return self._not_found()

        if path.startswith("//"):
            return self._not_found()

        if path == "/health":
            return self._health(environ, method)

        if not path.startswith("/"):
            return self._not_found()

        relative = path.lstrip("/")
        if _is_suspicious(relative):
            return self._not_found()

        if relative.endswith(".zip"):
            return self._serve_zip(environ, relative, method)

        if relative.endswith(".sha256"):
            return self._serve_manifest(environ, relative, method)

        return self._not_found()

    # ------------------------------------------------------------------
    def _health(self, environ, method: str) -> _Response:
        if not self._health_public and not self._authorized(environ):
            return self._unauthorized()

        if method == "HEAD":
            body: Iterable[bytes] = ()
        else:
            body = [b"{\"status\": \"ok\"}\n"]

        headers = {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store",
        }
        return _Response(200, headers, body)

    # ------------------------------------------------------------------
    def _serve_zip(self, environ, relative: str, method: str) -> _Response:
        if not self._authorized(environ):
            return self._unauthorized()

        try:
            file_path = self._resolve(self._root / relative)
        except ValueError:
            return self._not_found()

        if not file_path.is_file():
            return self._not_found()

        stat = file_path.stat()
        etag = _build_etag(stat.st_mtime_ns, stat.st_size)
        last_modified = _http_datetime(stat.st_mtime)

        if _is_not_modified(environ, etag, stat.st_mtime):
            headers = self._zip_headers(relative, etag, last_modified, stat.st_size)
            return _Response(304, headers, ())

        headers = self._zip_headers(relative, etag, last_modified, stat.st_size)

        if method == "HEAD":
            return _Response(200, headers, ())

        fileobj = file_path.open("rb")
        wrapper = environ.get("wsgi.file_wrapper")
        if wrapper is not None:
            body_iter = _closing_iter(wrapper(fileobj, 64 * 1024), fileobj)
        else:
            body_iter = _file_iterator(fileobj)

        return _Response(200, headers, body_iter)

    # ------------------------------------------------------------------
    def _serve_manifest(self, environ, relative: str, method: str) -> _Response:
        if not self._authorized(environ):
            return self._unauthorized()

        manifest_path = self._resolve(self._root / relative)
        base_zip = manifest_path.with_suffix(".zip")

        if base_zip.suffix != ".zip":
            # Suffix conversion failed somehow, fall back to explicit name
            base_zip = self._root / (relative[:-7] + ".zip")

        try:
            zip_path = self._resolve(base_zip)
        except ValueError:
            return self._not_found()

        if not zip_path.is_file():
            return self._not_found()

        stat = zip_path.stat()
        etag = _build_etag(stat.st_mtime_ns, stat.st_size)
        if _is_not_modified(environ, etag, stat.st_mtime):
            headers = self._manifest_headers(relative, etag, stat.st_mtime)
            return _Response(304, headers, ())

        digest = _sha256_file(zip_path)
        filename = Path(relative).with_suffix('.zip').name
        body_bytes = _manifest_payload(filename, digest)
        headers = self._manifest_headers(relative, etag, stat.st_mtime)
        headers["Content-Length"] = str(len(body_bytes))

        if method == "HEAD":
            body: Iterable[bytes] = ()
        else:
            body = [body_bytes]

        return _Response(200, headers, body)

    # ------------------------------------------------------------------
    def _authorized(self, environ) -> bool:
        provided = environ.get("HTTP_X_MOBIUS_KEY")
        if not provided or not self._api_key:
            return False
        return hmac.compare_digest(provided, self._api_key)

    # ------------------------------------------------------------------
    def _resolve(self, candidate: Path) -> Path:
        resolved = candidate.resolve(strict=False)
        if self._root == resolved:
            return resolved
        try:
            resolved.relative_to(self._root)
        except ValueError as exc:  # pragma: no cover - defensive
            raise ValueError("attempted path escape") from exc
        return resolved

    # ------------------------------------------------------------------
    def _zip_headers(self, relative: str, etag: str, last_modified: str, size: int):
        filename = Path(relative).name
        headers = {
            "Content-Type": "application/zip",
            "Content-Length": str(size),
            "ETag": etag,
            "Last-Modified": last_modified,
            "Cache-Control": f"public, max-age={self._immutable_max_age}, immutable",
            "Vary": "Accept-Encoding",
            "Content-Disposition": _content_disposition(filename),
        }
        return headers

    # ------------------------------------------------------------------
    def _manifest_headers(self, relative: str, etag: str, mtime: float):
        filename = Path(relative).name
        headers = {
            "Content-Type": "text/plain; charset=utf-8",
            "ETag": etag,
            "Last-Modified": _http_datetime(mtime),
            "Cache-Control": "public, max-age=0, must-revalidate",
            "Vary": "Accept-Encoding",
            "Content-Disposition": _content_disposition(filename),
        }
        return headers

    # ------------------------------------------------------------------
    def _unauthorized(self) -> _Response:
        headers = {
            "Cache-Control": "no-store",
            "WWW-Authenticate": 'X-Mobius-Key realm="mobius-export"',
            "Content-Type": "text/plain; charset=utf-8",
        }
        return _Response(401, headers, [b"authentication required\n"])

    # ------------------------------------------------------------------
    def _not_found(self) -> _Response:
        headers = {
            "Cache-Control": "no-store",
            "Content-Type": "text/plain; charset=utf-8",
        }
        return _Response(404, headers, [b"not found\n"])

    # ------------------------------------------------------------------
    def _method_not_allowed(self) -> _Response:
        headers = {
            "Cache-Control": "no-store",
            "Allow": "GET, HEAD",
            "Content-Type": "text/plain; charset=utf-8",
        }
        return _Response(405, headers, [b"method not allowed\n"])

    # ------------------------------------------------------------------
    def _internal_error(self) -> _Response:
        headers = {
            "Cache-Control": "no-store",
            "Content-Type": "text/plain; charset=utf-8",
        }
        return _Response(500, headers, [b"internal error\n"])


def create_app() -> ExportGateway:
    """Factory that builds the gateway using environment variables."""

    root = os.environ.get("MOBIUS_EXPORT_ROOT", ".")
    api_key = os.environ.get("MOBIUS_API_KEY", "")
    health_public = _as_bool(os.environ.get("MOBIUS_HEALTH_PUBLIC", "false"))
    return ExportGateway(root, api_key, health_public=health_public)


# ---------------------------------------------------------------------------
def _closing_iter(iterable, handle) -> Iterator[bytes]:
    try:
        for chunk in iterable:
            yield chunk
    finally:
        close = getattr(iterable, "close", None)
        if callable(close):
            close()
        handle.close()


def _file_iterator(handle) -> Iterator[bytes]:
    try:
        while True:
            chunk = handle.read(64 * 1024)
            if not chunk:
                break
            yield chunk
    finally:
        handle.close()


def _build_etag(mtime_ns: int, size: int) -> str:
    return f'"{mtime_ns:x}-{size:x}"'


def _http_datetime(timestamp: float) -> str:
    dt = _dt.datetime.fromtimestamp(timestamp, tz=_dt.timezone.utc)
    return email.utils.format_datetime(dt, usegmt=True)


def _is_not_modified(environ, etag: str, mtime: float) -> bool:
    inm = environ.get("HTTP_IF_NONE_MATCH")
    if inm:
        tags = [tag.strip() for tag in inm.split(",")]
        if "*" in tags or etag in tags:
            return True

    ims = environ.get("HTTP_IF_MODIFIED_SINCE")
    if ims:
        try:
            dt = email.utils.parsedate_to_datetime(ims)
        except (TypeError, ValueError):
            dt = None
        if dt is not None:
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=_dt.timezone.utc)
            resource_dt = _dt.datetime.fromtimestamp(mtime, tz=_dt.timezone.utc)
            if resource_dt <= dt:
                return True
    return False


def _manifest_payload(filename: str, digest: str) -> bytes:
    return f"SHA256 ({filename}) = {digest}\n".encode("utf-8")


def _sha256_file(path: Path) -> str:
    import hashlib

    hasher = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(64 * 1024), b""):
            hasher.update(chunk)
    return hasher.hexdigest()


def _content_disposition(filename: str) -> str:
    safe = filename.replace("\r", "").replace("\n", "")
    ascii_only = safe.encode("ascii", "ignore").decode("ascii")
    if not ascii_only:
        ascii_only = "download"
    encoded = safe.encode("utf-8")
    quoted = _quote_http(ascii_only)
    try:
        utf8_value = encoded.decode("utf-8")
    except UnicodeDecodeError:
        utf8_value = ascii_only
    return f"attachment; filename={quoted}; filename*=UTF-8''{_rfc5987_quote(utf8_value)}"


def _quote_http(value: str) -> str:
    escaped = value.replace("\\", "\\\\").replace("\"", "\\\"")
    return f'"{escaped}"'


def _rfc5987_quote(value: str) -> str:
    # Use urllib.parse.quote but keep it lightweight to avoid importing percent encoding tables
    from urllib.parse import quote

    return quote(value, safe="")


def _is_suspicious(path: str) -> bool:
    if path.startswith("/"):
        return True
    parts = path.split("/")
    if any(part in {"", ".", ".."} for part in parts):
        return True
    if "\\" in path or "\x00" in path:
        return True
    return False


def _as_bool(value: Optional[str]) -> bool:
    if value is None:
        return False
    return value.strip().lower() in {"1", "true", "yes", "on"}
