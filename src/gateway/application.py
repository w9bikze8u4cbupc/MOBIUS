"""WSGI export gateway: serves ZIP artifacts and SHA256 manifests with API-key auth and HTTP validators."""
from __future__ import annotations

import mimetypes
import os
from datetime import datetime, timezone
from email.utils import format_datetime, parsedate_to_datetime
from pathlib import Path
from typing import Callable, ClassVar, Iterable, Iterator
from urllib.parse import quote


StartResponse = Callable[[str, list[tuple[str, str]]], Callable[[bytes], object]]
ResponseIterable = Iterable[bytes]


class GatewayApplication:
    """WSGI app streaming artifacts with cache-control modes and conditional GET."""

    CACHE_DIRECTIVES: ClassVar[dict[str, str]] = {
        "immutable": "public, immutable, max-age=31536000",
        "revalidate": "public, max-age=0, must-revalidate",
        "no-store": "no-store",
    }

    def __init__(
        self,
        export_root: str | os.PathLike[str] | None = None,
        api_key: str | None = None,
        *,
        health_public: bool | None = None,
        version: str | None = None,
    ) -> None:
        env = os.environ
        root_value = export_root or env.get("MOBIUS_EXPORT_ROOT")
        if root_value is None:
            raise ValueError("MOBIUS_EXPORT_ROOT must be configured")
        self.export_root = Path(root_value).resolve()
        self.api_key = api_key or env.get("MOBIUS_API_KEY")
        public_flag = health_public
        if public_flag is None:
            public_env = env.get("MOBIUS_HEALTH_PUBLIC")
            if public_env is not None:
                public_flag = public_env.lower() in {"1", "true", "yes", "on"}
        self.health_public = bool(public_flag)
        self.version = version or env.get("MOBIUS_VERSION")

    def application(self, environ: dict[str, object], start_response: StartResponse) -> ResponseIterable:
        """PEP 3333 entrypoint: route GET/HEAD, enforce auth, and stream responses."""

        method = str(environ.get("REQUEST_METHOD", "GET")).upper()
        if method not in {"GET", "HEAD"}:
            return self._method_not_allowed(start_response)

        path = str(environ.get("PATH_INFO", "")) or "/"
        if path.startswith("/exports/"):
            return self._handle_export(path[len("/exports/") :], method, environ, start_response)
        if path == "/health":
            return self._handle_health(method, environ, start_response)
        return self._not_found(start_response)

    def _handle_health(
        self, method: str, environ: dict[str, object], start_response: StartResponse
    ) -> ResponseIterable:
        if not self.health_public and not self._is_authorized(environ):
            return self._unauthorized(start_response)

        headers = self._base_headers(cache_mode="no-store")
        body = b"ok" if method == "GET" else b""
        if method == "GET":
            headers.append(("Content-Type", "text/plain; charset=utf-8"))
            headers.append(("Content-Length", str(len(body))))
        else:
            headers.append(("Content-Length", "0"))
        self._attach_version(headers)
        start_response("200 OK", headers)
        return [body] if method == "GET" else []

    def _handle_export(
        self,
        relative_path: str,
        method: str,
        environ: dict[str, object],
        start_response: StartResponse,
    ) -> ResponseIterable:
        if not self._is_authorized(environ):
            return self._unauthorized(start_response)

        try:
            target_path = self._resolve_path(relative_path)
        except ValueError:
            return self._not_found(start_response)

        if not target_path.is_file():
            return self._not_found(start_response)

        cache_mode = self._cache_mode_for(target_path)
        headers = self._base_headers(cache_mode=cache_mode)
        stat_result = target_path.stat()
        etag = self._build_etag(stat_result.st_mtime_ns, stat_result.st_size)
        last_modified = self._last_modified_header(stat_result.st_mtime)
        headers.extend(
            [
                ("Content-Type", self._guess_content_type(target_path)),
                ("Content-Length", str(stat_result.st_size)),
                ("Content-Disposition", self._content_disposition(target_path.name)),
                ("ETag", etag),
                ("Last-Modified", last_modified),
                ("Vary", "Accept-Encoding"),
            ]
        )
        self._attach_version(headers)

        if self._is_not_modified(environ, etag, stat_result.st_mtime):
            start_response("304 Not Modified", headers)
            return []

        start_response("200 OK", headers)
        if method == "HEAD":
            return []
        return self._stream_file(target_path)

    def _stream_file(self, path: Path, chunk_size: int = 8192) -> Iterator[bytes]:
        with path.open("rb") as stream:
            while True:
                chunk = stream.read(chunk_size)
                if not chunk:
                    break
                yield chunk

    def _unauthorized(self, start_response: StartResponse) -> ResponseIterable:
        body = b"unauthorized"
        headers = self._base_headers(cache_mode="no-store")
        headers.extend([("Content-Type", "text/plain; charset=utf-8"), ("Content-Length", str(len(body)))])
        self._attach_version(headers)
        start_response("401 Unauthorized", headers)
        return [body]

    def _method_not_allowed(self, start_response: StartResponse) -> ResponseIterable:
        headers = self._base_headers(cache_mode="no-store")
        headers.append(("Content-Length", "0"))
        self._attach_version(headers)
        start_response("405 Method Not Allowed", headers)
        return []

    def _not_found(self, start_response: StartResponse) -> ResponseIterable:
        body = b"not found"
        headers = self._base_headers(cache_mode="no-store")
        headers.extend([("Content-Type", "text/plain; charset=utf-8"), ("Content-Length", str(len(body)))])
        self._attach_version(headers)
        start_response("404 Not Found", headers)
        return [body]

    def _is_authorized(self, environ: dict[str, object]) -> bool:
        if self.api_key is None:
            return False
        provided = environ.get("HTTP_X_MOBIUS_KEY")
        if provided is None:
            return False
        return str(provided) == self.api_key

    def _resolve_path(self, relative_path: str) -> Path:
        candidate = (self.export_root / relative_path.lstrip("/")).resolve(strict=False)
        try:
            candidate.relative_to(self.export_root)
        except ValueError:
            raise ValueError("path traversal detected") from None
        return candidate

    def _cache_mode_for(self, path: Path) -> str:
        if path.suffix == ".zip":
            return "immutable"
        if path.suffix == ".sha256":
            return "revalidate"
        return "no-store"

    def _base_headers(self, *, cache_mode: str) -> list[tuple[str, str]]:
        directive = self.CACHE_DIRECTIVES.get(cache_mode, self.CACHE_DIRECTIVES["no-store"])
        return [("Cache-Control", directive)]

    def _build_etag(self, mtime_ns: int, size: int) -> str:
        return f'"{mtime_ns:x}-{size:x}"'

    def _last_modified_header(self, mtime: float) -> str:
        timestamp = datetime.fromtimestamp(mtime, tz=timezone.utc).replace(microsecond=0)
        return format_datetime(timestamp, usegmt=True)

    def _guess_content_type(self, path: Path) -> str:
        if path.suffix == ".sha256":
            return "text/plain; charset=utf-8"
        mime = mimetypes.guess_type(path.name)[0]
        return mime or "application/octet-stream"

    def _content_disposition(self, filename: str) -> str:
        ascii_name = self._ascii_filename(filename)
        quoted_utf8 = quote(filename, safe="")
        return f"attachment; filename=\"{ascii_name}\"; filename*=UTF-8''{quoted_utf8}"

    def _ascii_filename(self, filename: str) -> str:
        sanitized = []
        for char in filename:
            code = ord(char)
            if 32 <= code < 127 and char not in {'"', "\\"}:
                sanitized.append(char)
        result = "".join(sanitized) or "download"
        return result

    def _is_not_modified(self, environ: dict[str, object], etag: str, mtime: float) -> bool:
        tag_header = environ.get("HTTP_IF_NONE_MATCH")
        if isinstance(tag_header, str) and self._etag_matches(tag_header, etag):
            return True

        ims = environ.get("HTTP_IF_MODIFIED_SINCE")
        if not isinstance(ims, str):
            return False
        parsed = parsedate_to_datetime(ims)
        if parsed is None:
            return False
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        parsed = parsed.astimezone(timezone.utc).replace(microsecond=0)
        resource_time = datetime.fromtimestamp(mtime, tz=timezone.utc).replace(microsecond=0)
        return resource_time <= parsed

    def _etag_matches(self, header_value: str, etag: str) -> bool:
        parts = [part.strip() for part in header_value.split(",")]
        return any(part == etag or part == "*" for part in parts)

    def _attach_version(self, headers: list[tuple[str, str]]) -> None:
        if self.version:
            headers.append(("X-Mobius-Version", self.version))

    def __call__(self, environ: dict[str, object], start_response: StartResponse) -> ResponseIterable:
        return self.application(environ, start_response)
