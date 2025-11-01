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
    dt = _dt.datetime.utcfromtimestamp(ts).replace(tzinfo=_dt.timezone.utc)
    return email.utils.format_datetime(dt, usegmt=True)


def _parse_http_datetime(value: str) -> Optional[_dt.datetime]:
    try:
        parsed = email.utils.parsedate_to_datetime(value)
    except (TypeError, ValueError):
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=_dt.timezone.utc)
    return parsed.astimezone(_dt.timezone.utc)


def _etag_matches(header_value: str, etag: str) -> bool:
    for token in header_value.split(','):
        token = token.strip()
        if token == "*" or token == etag:
            return True
    return False


def _cache_control_for_mode(mode: str) -> str:
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
        self.config = config
        self._exports_root = Path(config.exports_root).resolve()

    def __call__(self, environ: dict, start_response: StartResponse) -> WSGIAppResult:
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
        start_response("405 Method Not Allowed", [("Allow", "GET, HEAD")])
        return [b""]

    def _not_found(self, start_response: StartResponse) -> WSGIAppResult:
        start_response("404 Not Found", [("Content-Length", "0")])
        return [b""]

    def _unauthorized(self, start_response: StartResponse) -> WSGIAppResult:
        headers = [("Content-Length", "0"), ("WWW-Authenticate", "X-Mobius-Key")]
        start_response("401 Unauthorized", headers)
        return [b""]

    def _handle_health(self, environ: dict, start_response: StartResponse) -> WSGIAppResult:
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
        with file_path.open("rb") as fh:
            while True:
                chunk = fh.read(_CHUNK_SIZE)
                if not chunk:
                    break
                yield chunk

    def _calculate_digest(self, file_path: Path) -> str:
        hasher = hashlib.sha256()
        with file_path.open("rb") as fh:
            for chunk in iter(lambda: fh.read(_CHUNK_SIZE), b""):
                hasher.update(chunk)
        return hasher.hexdigest()

    def _cache_headers(self, etag: str, last_modified: str) -> List[Tuple[str, str]]:
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
        ascii_fallback = filename.encode("ascii", "ignore").decode("ascii")
        if not ascii_fallback:
            ascii_fallback = "download"
        ascii_fallback = ascii_fallback.replace("\"", "")
        encoded = urllib.parse.quote(filename, safe="")
        return f"attachment; filename=\"{ascii_fallback}\"; filename*=UTF-8''{encoded}"

    def _is_not_modified(self, environ: dict, etag: str, mtime: float) -> bool:
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
