"""WSGI gateway application for artifact streaming."""
from __future__ import annotations

import hashlib
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from email.utils import format_datetime, parsedate_to_datetime
from pathlib import Path, PurePosixPath
from typing import Callable, Iterator, List, Mapping, Optional, Tuple
from urllib.parse import quote

StartResponse = Callable[[str, List[Tuple[str, str]], Optional[Tuple]], None]
Headers = List[Tuple[str, str]]


def _http_date(dt: datetime) -> str:
    """Return an HTTP date string for *dt*."""
    return format_datetime(dt, usegmt=True)


def _parse_http_date(value: str) -> Optional[datetime]:
    try:
        parsed = parsedate_to_datetime(value)
    except (TypeError, ValueError):
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _build_content_disposition(filename: str) -> str:
    safe_ascii = filename.encode("ascii", "ignore").decode("ascii")
    suffix = Path(filename).suffix
    safe_ascii = safe_ascii.replace("\"", "_")
    if not safe_ascii or safe_ascii.strip(".") == "":
        safe_ascii = f"download{suffix}"
    encoded = quote(filename, safe="")
    return f'attachment; filename="{safe_ascii}"; filename*=UTF-8\'\'{encoded}'


def _hash_file(path: Path, chunk_size: int = 65536) -> str:
    hasher = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(chunk_size), b""):
            hasher.update(chunk)
    return hasher.hexdigest()


@dataclass(frozen=True)
class GatewayConfig:
    """Configuration for :class:`GatewayApplication`."""

    exports_root: Path
    api_key: str
    version: Optional[str] = None
    cache_mode: str = "revalidate"
    health_public: bool = False
    chunk_size: int = 65536

    @classmethod
    def from_environ(cls, environ: Optional[Mapping[str, str]] = None) -> "GatewayConfig":
        env = os.environ if environ is None else environ
        exports_root = Path(env.get("MOBIUS_EXPORTS_ROOT", "exports")).resolve()
        api_key = env.get("MOBIUS_GATEWAY_KEY")
        if not api_key:
            raise RuntimeError("MOBIUS_GATEWAY_KEY must be configured")
        version = env.get("MOBIUS_VERSION")
        cache_mode = env.get("MOBIUS_CACHE_MODE", "revalidate").lower()
        health_public = env.get("MOBIUS_HEALTH_PUBLIC") == "1"
        return cls(
            exports_root=exports_root,
            api_key=api_key,
            version=version,
            cache_mode=cache_mode,
            health_public=health_public,
        )


class GatewayApplication:
    """WSGI application responsible for serving export artifacts."""

    def __init__(self, config: GatewayConfig):
        self._exports_root = config.exports_root
        self._api_key = config.api_key
        self._version = config.version
        self._cache_mode = config.cache_mode
        self._health_public = config.health_public
        self._chunk_size = config.chunk_size

    def __call__(self, environ, start_response: StartResponse):  # type: ignore[override]
        method = environ.get("REQUEST_METHOD", "GET").upper()
        path = environ.get("PATH_INFO", "")

        if method not in {"GET", "HEAD"}:
            return self._method_not_allowed(start_response)

        if path == "/healthz":
            return self._handle_health(method, environ, start_response)

        if path.startswith("/exports/"):
            return self._handle_exports(method, path, environ, start_response)

        return self._not_found(start_response)

    # ------------------------------------------------------------------
    # Helpers
    def _method_not_allowed(self, start_response: StartResponse):
        headers = [("Allow", "GET, HEAD"), ("Cache-Control", "no-store"), ("Content-Type", "text/plain; charset=utf-8")]
        start_response("405 Method Not Allowed", headers)
        return [b"method not allowed\n"]

    def _not_found(self, start_response: StartResponse):
        headers = [("Cache-Control", "no-store"), ("Content-Type", "text/plain; charset=utf-8")]
        start_response("404 Not Found", headers)
        return [b"not found\n"]

    def _unauthorized(self, start_response: StartResponse):
        headers = [
            ("WWW-Authenticate", "X-Mobius-Key"),
            ("Cache-Control", "no-store"),
            ("Content-Type", "text/plain; charset=utf-8"),
        ]
        start_response("401 Unauthorized", headers)
        return [b"unauthorized\n"]

    def _check_api_key(self, environ) -> bool:
        provided = environ.get("HTTP_X_MOBIUS_KEY")
        return provided is not None and provided == self._api_key

    # ------------------------------------------------------------------
    # /healthz
    def _handle_health(self, method: str, environ, start_response: StartResponse):
        if not self._health_public and not self._check_api_key(environ):
            return self._unauthorized(start_response)

        headers = [("Cache-Control", "no-store"), ("Content-Type", "text/plain; charset=utf-8")]
        if self._version:
            headers.append(("X-Mobius-Version", self._version))
        start_response("200 OK", headers)
        if method == "HEAD":
            return []
        return [b"ok\n"]

    # ------------------------------------------------------------------
    # /exports
    def _handle_exports(self, method: str, path: str, environ, start_response: StartResponse):
        if not self._check_api_key(environ):
            return self._unauthorized(start_response)

        relative = path[len("/exports/"):]
        safe = PurePosixPath(relative)
        if safe.is_absolute() or ".." in safe.parts or safe == PurePosixPath(""):
            return self._not_found(start_response)

        root_resolved = self._exports_root.resolve()
        relative_str = safe.as_posix()

        if relative_str.endswith(".zip"):
            target = self._exports_root.joinpath(Path(*safe.parts))
            try:
                target_resolved = target.resolve()
            except FileNotFoundError:
                return self._not_found(start_response)
            if not target_resolved.is_file():
                return self._not_found(start_response)
            if not target_resolved.is_relative_to(root_resolved):
                return self._not_found(start_response)
            return self._serve_zip(method, target_resolved, environ, start_response)

        if relative_str.endswith(".zip.sha256"):
            zip_relative = PurePosixPath(relative_str[:-len(".sha256")])
            zip_target = self._exports_root.joinpath(Path(*zip_relative.parts))
            try:
                zip_resolved = zip_target.resolve()
            except FileNotFoundError:
                return self._not_found(start_response)
            if not zip_resolved.is_file():
                return self._not_found(start_response)
            if not zip_resolved.is_relative_to(root_resolved):
                return self._not_found(start_response)
            return self._serve_sha256(method, zip_resolved, start_response, environ)

        return self._not_found(start_response)

    def _cache_control_header(self) -> str:
        mode = self._cache_mode
        if mode == "immutable":
            return "public, max-age=31536000, immutable"
        if mode == "bypass":
            return "no-store"
        return "public, max-age=0, must-revalidate"

    def _common_headers(self, etag: str, last_modified: datetime, content_type: str, disposition: str, content_length: Optional[int]) -> Headers:
        headers: Headers = [
            ("Content-Type", content_type),
            ("Content-Disposition", disposition),
            ("ETag", etag),
            ("Last-Modified", _http_date(last_modified)),
            ("Cache-Control", self._cache_control_header()),
            ("Vary", "Accept-Encoding"),
            ("Accept-Ranges", "bytes"),
        ]
        if content_length is not None:
            headers.append(("Content-Length", str(content_length)))
        if self._version:
            headers.append(("X-Mobius-Version", self._version))
        return headers

    def _not_modified(self, start_response: StartResponse, etag: str, last_modified: datetime):
        headers: Headers = [
            ("ETag", etag),
            ("Last-Modified", _http_date(last_modified)),
            ("Cache-Control", self._cache_control_header()),
            ("Vary", "Accept-Encoding"),
            ("Accept-Ranges", "bytes"),
            ("Content-Length", "0"),
        ]
        if self._version:
            headers.append(("X-Mobius-Version", self._version))
        start_response("304 Not Modified", headers)
        return []

    def _should_return_not_modified(self, environ, etag: str, last_modified: datetime) -> bool:
        if_none_match = environ.get("HTTP_IF_NONE_MATCH")
        if if_none_match:
            tags = [tag.strip() for tag in if_none_match.split(",")]
            if "*" in tags or etag in tags:
                return True
        if_modified_since = environ.get("HTTP_IF_MODIFIED_SINCE")
        if if_modified_since:
            parsed = _parse_http_date(if_modified_since)
            if parsed and parsed >= last_modified.replace(microsecond=0):
                return True
        return False

    def _serve_zip(self, method: str, path: Path, environ, start_response: StartResponse):
        stat = path.stat()
        etag = f'"{stat.st_mtime_ns:x}-{stat.st_size:x}"'
        last_modified = datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc)
        disposition = _build_content_disposition(path.name)
        content_type = "application/zip"
        content_length = stat.st_size

        if self._should_return_not_modified(environ, etag, last_modified):
            return self._not_modified(start_response, etag, last_modified)

        headers = self._common_headers(etag, last_modified, content_type, disposition, content_length)
        start_response("200 OK", headers)
        if method == "HEAD":
            return []
        return self._iter_file(path)

    def _serve_sha256(self, method: str, zip_path: Path, start_response: StartResponse, environ):
        digest = _hash_file(zip_path, chunk_size=self._chunk_size)
        payload_name = f"{zip_path.name}.sha256"
        etag = f'"sha256-{digest}"'
        stat = zip_path.stat()
        last_modified = datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc)
        disposition = _build_content_disposition(payload_name)
        content_type = "text/plain; charset=utf-8"
        body = f"{digest}  {zip_path.name}\n".encode("utf-8")

        if self._should_return_not_modified(environ, etag, last_modified):
            return self._not_modified(start_response, etag, last_modified)

        headers = self._common_headers(etag, last_modified, content_type, disposition, len(body))
        start_response("200 OK", headers)
        if method == "HEAD":
            return []
        return [body]

    def _iter_file(self, path: Path) -> Iterator[bytes]:
        with path.open("rb") as handle:
            while True:
                chunk = handle.read(self._chunk_size)
                if not chunk:
                    break
                yield chunk


__all__ = ["GatewayApplication", "GatewayConfig"]
