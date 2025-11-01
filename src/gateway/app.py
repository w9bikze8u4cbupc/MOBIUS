"""WSGI application exposing export artifacts with caching and auth."""

from __future__ import annotations

import hashlib
import mimetypes
import urllib.parse
from datetime import datetime, timezone
from email.utils import format_datetime, parsedate_to_datetime
from pathlib import Path
from typing import Callable, Iterable, Iterator

from .config import GatewayConfig

StartResponse = Callable[[str, list[tuple[str, str]]], Callable[[bytes], object]]


class GatewayApplication:
    """WSGI application responsible for serving export artifacts."""

    def __init__(self, config: GatewayConfig) -> None:
        self.config = config
        self._root = config.exports_root

    # ------------------------------------------------------------------
    # WSGI entry point
    # ------------------------------------------------------------------
    def __call__(self, environ: dict[str, str], start_response: StartResponse) -> Iterable[bytes]:
        try:
            method = environ.get("REQUEST_METHOD", "GET").upper()
            path_info = environ.get("PATH_INFO", "")
        except Exception:  # pragma: no cover - defensive
            return self._server_error(start_response, "Malformed request")

        if path_info == "/healthz":
            return self._handle_health(method, environ, start_response)

        if not path_info.startswith("/exports/"):
            return self._not_found(start_response)

        if not self._authorized(environ):
            return self._unauthorized(start_response)

        if method not in {"GET", "HEAD"}:
            return self._method_not_allowed(start_response)

        relative_path = urllib.parse.unquote(path_info[len("/exports/"):])
        if not relative_path:
            return self._not_found(start_response)

        want_digest = relative_path.endswith(".sha256")
        if want_digest:
            relative_path = relative_path[: -len(".sha256")]

        try:
            artifact_path = self._resolve_path(relative_path)
        except ValueError:
            return self._not_found(start_response)

        if not artifact_path.is_file():
            return self._not_found(start_response)

        if want_digest:
            return self._serve_digest(method, artifact_path, start_response)
        return self._serve_file(method, artifact_path, environ, start_response)

    # ------------------------------------------------------------------
    # Helpers for authentication and routing
    # ------------------------------------------------------------------
    def _authorized(self, environ: dict[str, str]) -> bool:
        provided = environ.get("HTTP_X_MOBIUS_KEY")
        return provided == self.config.gateway_key

    def _resolve_path(self, relative: str) -> Path:
        target = (self._root / relative).resolve(strict=False)
        try:
            target.relative_to(self._root)
        except ValueError as exc:  # pragma: no cover - ensures traversal protection
            raise ValueError("Traversal detected") from exc
        return target

    # ------------------------------------------------------------------
    # Health endpoint
    # ------------------------------------------------------------------
    def _handle_health(
        self, method: str, environ: dict[str, str], start_response: StartResponse
    ) -> Iterable[bytes]:
        if method not in {"GET", "HEAD"}:
            return self._method_not_allowed(start_response)

        if not self.config.health_public and not self._authorized(environ):
            return self._unauthorized(start_response)

        headers = [("Content-Type", "text/plain; charset=utf-8")]
        if self.config.version:
            headers.append(("X-Mobius-Version", self.config.version))
        headers.append(("Cache-Control", "no-store"))
        start_response("200 OK", headers)
        if method == "HEAD":
            return []
        return [b"ok"]

    # ------------------------------------------------------------------
    # Artifact serving
    # ------------------------------------------------------------------
    def _serve_digest(
        self, method: str, artifact_path: Path, start_response: StartResponse
    ) -> Iterable[bytes]:
        digest = self._sha256_file(artifact_path)
        body = f"{digest}  {artifact_path.name}\n".encode("utf-8")

        headers = self._base_headers()
        headers.extend(
            [
                ("Content-Type", "text/plain; charset=utf-8"),
                ("Content-Length", str(len(body))),
            ]
        )
        cache_control = self.config.cache_control_header()
        if cache_control:
            headers.append(("Cache-Control", cache_control))

        start_response("200 OK", headers)
        if method == "HEAD":
            return []
        return [body]

    def _serve_file(
        self,
        method: str,
        artifact_path: Path,
        environ: dict[str, str],
        start_response: StartResponse,
    ) -> Iterable[bytes]:
        stat = artifact_path.stat()
        etag = self._etag_for_path(artifact_path)
        last_modified = datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).replace(microsecond=0)

        # Conditional requests
        inm = environ.get("HTTP_IF_NONE_MATCH")
        if inm and self._etag_matches(etag, inm):
            return self._not_modified(etag, last_modified, start_response)

        ims_raw = environ.get("HTTP_IF_MODIFIED_SINCE")
        if ims_raw:
            parsed = self._parse_http_datetime(ims_raw)
            if parsed is not None and last_modified <= parsed:
                return self._not_modified(etag, last_modified, start_response)

        content_type = mimetypes.guess_type(str(artifact_path))[0] or "application/octet-stream"
        headers = self._base_headers()
        headers.extend(
            [
                ("Content-Type", content_type),
                ("Content-Length", str(stat.st_size)),
                ("Last-Modified", format_datetime(last_modified, usegmt=True)),
                ("ETag", etag),
                ("Content-Disposition", self._content_disposition(artifact_path.name)),
            ]
        )

        cache_control = self.config.cache_control_header()
        if cache_control:
            headers.append(("Cache-Control", cache_control))

        start_response("200 OK", headers)
        if method == "HEAD":
            return []
        return self._file_iterator(artifact_path)

    # ------------------------------------------------------------------
    # Response helpers
    # ------------------------------------------------------------------
    def _base_headers(self) -> list[tuple[str, str]]:
        return [
            ("Vary", "Accept-Encoding"),
            ("Accept-Ranges", "bytes"),
        ]

    def _not_found(self, start_response: StartResponse) -> Iterable[bytes]:
        headers = [("Content-Type", "text/plain; charset=utf-8"), ("Cache-Control", "no-store")]
        start_response("404 Not Found", headers)
        return [b"not found"]

    def _unauthorized(self, start_response: StartResponse) -> Iterable[bytes]:
        headers = [
            ("Content-Type", "text/plain; charset=utf-8"),
            ("Cache-Control", "no-store"),
        ]
        start_response("401 Unauthorized", headers)
        return [b"unauthorized"]

    def _method_not_allowed(self, start_response: StartResponse) -> Iterable[bytes]:
        headers = [
            ("Content-Type", "text/plain; charset=utf-8"),
            ("Allow", "GET, HEAD"),
            ("Cache-Control", "no-store"),
        ]
        start_response("405 Method Not Allowed", headers)
        return [b"method not allowed"]

    def _server_error(self, start_response: StartResponse, message: str) -> Iterable[bytes]:
        headers = [("Content-Type", "text/plain; charset=utf-8"), ("Cache-Control", "no-store")]
        start_response("500 Internal Server Error", headers)
        return [message.encode("utf-8", "replace")]

    def _not_modified(
        self, etag: str, last_modified: datetime, start_response: StartResponse
    ) -> Iterable[bytes]:
        headers = self._base_headers()
        headers.extend(
            [
                ("ETag", etag),
                ("Last-Modified", format_datetime(last_modified, usegmt=True)),
            ]
        )
        cache_control = self.config.cache_control_header()
        if cache_control:
            headers.append(("Cache-Control", cache_control))
        start_response("304 Not Modified", headers)
        return []

    # ------------------------------------------------------------------
    # Utility routines
    # ------------------------------------------------------------------
    def _content_disposition(self, filename: str) -> str:
        ascii_fallback = filename.encode("ascii", "ignore").decode("ascii")
        ascii_fallback = "".join(
            ch for ch in ascii_fallback if 32 <= ord(ch) <= 126 and ch != '"'
        )
        if not ascii_fallback:
            ascii_fallback = "download"
        encoded = urllib.parse.quote(filename, safe="")
        return f"attachment; filename=\"{ascii_fallback}\"; filename*=UTF-8''{encoded}"

    def _sha256_file(self, path: Path) -> str:
        digest = hashlib.sha256()
        with path.open("rb") as fh:
            for chunk in iter(lambda: fh.read(1024 * 1024), b""):
                digest.update(chunk)
        return digest.hexdigest()

    def _etag_for_path(self, path: Path) -> str:
        digest = hashlib.sha256()
        stat = path.stat()
        digest.update(str(stat.st_mtime_ns).encode("ascii"))
        digest.update(b"-")
        digest.update(str(stat.st_size).encode("ascii"))
        digest.update(b"-")
        digest.update(path.name.encode("utf-8"))
        return f'"{digest.hexdigest()}"'

    def _etag_matches(self, etag: str, header: str) -> bool:
        etags = [part.strip() for part in header.split(",")]
        return any(part == "*" or part == etag for part in etags)

    def _parse_http_datetime(self, value: str) -> datetime | None:
        try:
            parsed = parsedate_to_datetime(value)
        except (TypeError, ValueError, IndexError):
            return None
        if parsed is None:
            return None
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.replace(microsecond=0)

    def _file_iterator(self, path: Path) -> Iterator[bytes]:
        chunk_size = 64 * 1024
        with path.open("rb") as fh:
            while True:
                chunk = fh.read(chunk_size)
                if not chunk:
                    break
                yield chunk
