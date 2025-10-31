"""WSGI application implementing the export gateway."""
from __future__ import annotations

from pathlib import Path
from typing import Optional
from urllib.parse import unquote

from .config import GatewayConfig
from .utils import (
    GatewayError,
    compute_sha256,
    content_disposition,
    ensure_within_root,
    file_iterator,
    http_date,
    sanitize_relative_path,
)

class GatewayApplication:
    """Minimal WSGI application serving export artifacts."""

    def __init__(self, config: Optional[GatewayConfig] = None) -> None:
        self.config = config or GatewayConfig.from_env()
        self.export_root = self.config.export_root.resolve()

    # -- WSGI entrypoint -------------------------------------------------
    def __call__(self, environ, start_response):  # type: ignore[override]
        try:
            return self._dispatch(environ, start_response)
        except GatewayError as exc:
            start_response(exc.status, self._augment_headers(exc.headers), None)
            return [exc.body]

    # -- Request handling ------------------------------------------------
    def _dispatch(self, environ, start_response):
        method = environ.get("REQUEST_METHOD", "GET").upper()
        path_info = environ.get("PATH_INFO", "")

        if method not in {"GET", "HEAD"}:
            raise GatewayError(
                "405 Method Not Allowed",
                headers=[("Allow", "GET, HEAD")],
                body=b"Method not allowed\n",
            )

        if not self._has_valid_key(environ) and not self._health_is_public(path_info):
            raise GatewayError(
                "401 Unauthorized",
                headers=[("WWW-Authenticate", 'Mobius realm="gateway"')],
                body=b"Unauthorized\n",
            )

        if path_info.startswith("/exports/"):
            return self._handle_exports(method, path_info, environ, start_response)
        if path_info == "/healthz":
            return self._handle_health(method, start_response)

        raise GatewayError("404 Not Found", body=b"Not Found\n")

    # -- Route handlers --------------------------------------------------
    def _handle_health(self, method: str, start_response):
        status = "200 OK"
        headers = self._augment_headers(
            [
                ("Content-Type", "application/json; charset=utf-8"),
            ]
        )
        start_response(status, headers, None)
        if method == "HEAD":
            return [b""]
        payload = b'{"status":"ok"}'
        return [payload]

    def _handle_exports(self, method: str, path_info: str, environ, start_response):
        raw_fragment = path_info.removeprefix("/exports/")
        fragment = unquote(raw_fragment)

        if fragment.endswith(".zip.sha256"):
            target, suffix = fragment[: -len(".sha256")], ".sha256"
        elif fragment.endswith(".zip"):
            target, suffix = fragment, ""
        else:
            raise GatewayError("404 Not Found", body=b"Not Found\n")

        relative_path = sanitize_relative_path(target)
        export_path = ensure_within_root(self.export_root, relative_path)

        if not export_path.exists() or not export_path.is_file():
            raise GatewayError("404 Not Found", body=b"Not Found\n")

        if suffix == ".sha256":
            return self._respond_signature(method, export_path, start_response, environ)
        return self._respond_export(method, export_path, start_response, environ)

    # -- Response helpers ------------------------------------------------
    def _respond_signature(self, method: str, path: Path, start_response, environ):
        chunk_size = self.config.sha256_chunk_size
        digest = compute_sha256(path, chunk_size=chunk_size)
        etag = f'"{digest}"'
        last_modified = http_date(path.stat().st_mtime)

        if self._is_not_modified(environ, etag, last_modified):
            headers = self._augment_headers(
                [
                    ("ETag", etag),
                    ("Last-Modified", last_modified),
                    ("Cache-Control", self._cache_header()),
                    ("Content-Type", "text/plain; charset=utf-8"),
                ]
            )
            start_response("304 Not Modified", headers, None)
            return [b""]

        body = f"{digest}  {path.name}\n".encode("utf-8")
        headers = self._augment_headers(
            [
                ("Content-Type", "text/plain; charset=utf-8"),
                ("Content-Length", str(len(body))),
                ("ETag", etag),
                ("Last-Modified", last_modified),
                ("Cache-Control", self._cache_header()),
            ]
        )
        start_response("200 OK", headers, None)
        if method == "HEAD":
            return [b""]
        return [body]

    def _respond_export(self, method: str, path: Path, start_response, environ):
        chunk_size = self.config.sha256_chunk_size
        digest = compute_sha256(path, chunk_size=chunk_size)
        etag = f'"{digest}"'
        stat = path.stat()
        last_modified = http_date(stat.st_mtime)

        if self._is_not_modified(environ, etag, last_modified):
            headers = self._augment_headers(
                [
                    ("ETag", etag),
                    ("Last-Modified", last_modified),
                    ("Cache-Control", self._cache_header()),
                    ("Accept-Ranges", "bytes"),
                    ("Content-Disposition", content_disposition(path.name)),
                    ("Content-Type", "application/zip"),
                ]
            )
            start_response("304 Not Modified", headers, None)
            return [b""]

        headers = self._augment_headers(
            [
                ("Content-Type", "application/zip"),
                ("Content-Length", str(stat.st_size)),
                ("ETag", etag),
                ("Last-Modified", last_modified),
                ("Cache-Control", self._cache_header()),
                ("Accept-Ranges", "bytes"),
                ("Content-Disposition", content_disposition(path.name)),
            ]
        )
        start_response("200 OK", headers, None)
        if method == "HEAD":
            return [b""]
        handle = path.open("rb")
        file_wrapper = environ.get("wsgi.file_wrapper")
        if callable(file_wrapper):
            return file_wrapper(handle, chunk_size)
        return file_iterator(handle, chunk_size)

    # -- Auth helpers ----------------------------------------------------
    def _has_valid_key(self, environ) -> bool:
        configured = self.config.gateway_key
        if configured is None:
            return True
        provided = environ.get("HTTP_X_MOBIUS_KEY")
        return provided == configured

    def _health_is_public(self, path_info: str) -> bool:
        return self.config.health_public and path_info == "/healthz"

    # -- Misc helpers ----------------------------------------------------
    def _is_not_modified(self, environ, etag: str, last_modified: str) -> bool:
        if_none_match = environ.get("HTTP_IF_NONE_MATCH")
        if if_none_match:
            tags = [tag.strip() for tag in if_none_match.split(",")]
            if "*" in tags or etag in tags:
                return True
        if_modified_since = environ.get("HTTP_IF_MODIFIED_SINCE")
        if if_modified_since:
            try:
                from datetime import timezone
                from email.utils import parsedate_to_datetime

                request_time = parsedate_to_datetime(if_modified_since)
                resource_time = parsedate_to_datetime(last_modified)
                if request_time and resource_time:
                    if request_time.tzinfo is None:
                        request_time = request_time.replace(tzinfo=timezone.utc)
                    else:
                        request_time = request_time.astimezone(timezone.utc)
                    if resource_time.tzinfo is None:
                        resource_time = resource_time.replace(tzinfo=timezone.utc)
                    else:
                        resource_time = resource_time.astimezone(timezone.utc)
                    if resource_time <= request_time:
                        return True
            except (TypeError, ValueError):  # pragma: no cover - defensive
                pass
        return False

    def _cache_header(self) -> str:
        if self.config.cache_mode == "immutable":
            return "public, max-age=31536000, immutable"
        return "public, max-age=0, must-revalidate"

    def _augment_headers(self, headers: list[tuple[str, str]]) -> list[tuple[str, str]]:
        augmented = list(headers)
        if self.config.version:
            augmented.append(("X-Mobius-Version", self.config.version))
        return augmented


def create_app(config: Optional[GatewayConfig] = None) -> GatewayApplication:
    """Factory returning a :class:`GatewayApplication`."""
    return GatewayApplication(config=config)


__all__ = ["GatewayApplication", "create_app"]
