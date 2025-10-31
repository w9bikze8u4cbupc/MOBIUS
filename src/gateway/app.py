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
        self._file = fileobj
        self._chunk_size = chunk_size

    def __iter__(self) -> Iterator[bytes]:
        try:
            while True:
                chunk = self._file.read(self._chunk_size)
                if not chunk:
                    break
                yield chunk
        finally:
            self._file.close()


def application(environ: Dict[str, object], start_response) -> Iterable[bytes]:
    """WSGI entry-point compatible with Gunicorn/uWSGI."""

    response = Gateway(environ).dispatch()
    start_response(response.status, response.headers)
    return response.body


class Gateway:
    """Handles routing and response generation."""

    def __init__(self, environ: Dict[str, object]) -> None:
        self.environ = environ
        self.now = datetime.now(timezone.utc)

    # ------------------------------------------------------------------
    # Routing
    # ------------------------------------------------------------------
    def dispatch(self) -> Response:
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
        if not self._is_health_public() and not self._check_api_key():
            return self._unauthorized()

        headers = self._base_headers(cache_control=CACHE_MODE_NO_STORE)
        body = [b"OK\n"] if method == "GET" else []
        return Response("200 OK", headers, body)

    # ------------------------------------------------------------------
    # Exports
    # ------------------------------------------------------------------
    def _handle_exports(self, method: str, raw_subpath: str) -> Response:
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
        headers = self._base_headers()
        headers.append(("Allow", "GET, HEAD"))
        return Response("405 Method Not Allowed", headers, [b""])

    def _not_found(self) -> Response:
        return Response("404 Not Found", self._base_headers(cache_control=CACHE_MODE_NO_STORE), [b""])

    def _unauthorized(self) -> Response:
        headers = self._base_headers(cache_control=CACHE_MODE_NO_STORE)
        headers.append(("WWW-Authenticate", f'{_AUTH_HEADER} realm="{_API_REALM}"'))
        return Response("401 Unauthorized", headers, [b""])

    def _server_error(self, message: str) -> Response:
        headers = self._base_headers(cache_control=CACHE_MODE_NO_STORE)
        return Response("500 Internal Server Error", headers, [message.encode("utf-8")])

    # ------------------------------------------------------------------
    # Header building helpers
    # ------------------------------------------------------------------
    def _base_headers(self, *, cache_control: Optional[str] = None) -> List[Tuple[str, str]]:
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
        expected = os.environ.get("MOBIUS_API_KEY")
        if not expected:
            return True
        provided = self._header_value(_AUTH_HEADER)
        return provided == expected

    def _header_value(self, name: str) -> Optional[str]:
        environ_key = "HTTP_" + name.upper().replace("-", "_")
        value = self.environ.get(environ_key)
        if isinstance(value, str):
            return value
        return None

    def _is_health_public(self) -> bool:
        return os.environ.get("MOBIUS_HEALTH_PUBLIC") in {"1", "true", "TRUE", "True"}

    def _get_export_root(self) -> Optional[Path]:
        root_value = os.environ.get("MOBIUS_EXPORT_ROOT")
        if not root_value:
            return None
        return Path(root_value).resolve()

    def _cache_control_mode(self) -> str:
        mode = os.environ.get("MOBIUS_CACHE_MODE", _DEFAULT_CACHE_MODE)
        if mode not in {CACHE_MODE_REVALIDATE, CACHE_MODE_IMMUTABLE, CACHE_MODE_NO_STORE}:
            return _DEFAULT_CACHE_MODE
        return mode

    def _percent_decode(self, value: str) -> str:
        try:
            from urllib.parse import unquote

            return unquote(value)
        except Exception:
            return ""

    def _resolve_export_path(self, root: Path, subpath: str) -> Tuple[Path, PurePosixPath]:
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
        safe_fallback = self._ascii_fallback(filename)
        utf8_encoded = self._rfc5987_encode(filename)
        return f"attachment; filename=\"{safe_fallback}\"; filename*=UTF-8''{utf8_encoded}"

    def _ascii_fallback(self, filename: str) -> str:
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
        from urllib.parse import quote

        return quote(value, safe="")

    def _strong_etag(self, mtime_ns: int, size: int) -> str:
        return f'"{mtime_ns:x}-{size:x}"'

    def _check_not_modified(self, etag: str, last_modified: datetime) -> bool:
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
        hasher = hashlib.sha256()
        with open(file_path, "rb") as fp:
            for chunk in iter(lambda: fp.read(64 * 1024), b""):
                hasher.update(chunk)
        return hasher.hexdigest()

    def _http_datetime(self, timestamp: float) -> datetime:
        dt = datetime.fromtimestamp(timestamp, tz=timezone.utc)
        return dt.replace(microsecond=0)


__all__ = ["application"]
