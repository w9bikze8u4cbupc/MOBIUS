"""Minimal WSGI gateway used for serving exported assets."""

from __future__ import annotations

from pathlib import Path
from typing import Iterable, Iterator, Optional, Protocol

from .config import GatewayConfig

try:  # pragma: no cover - optional dependency
    from prometheus_client import (
        CONTENT_TYPE_LATEST,
        CollectorRegistry,
        generate_latest,
    )

    _PROM_REG: Optional[CollectorRegistry] = CollectorRegistry()
except Exception:  # pragma: no cover - optional dependency missing
    CONTENT_TYPE_LATEST = "text/plain; version=0.0.4; charset=utf-8"
    generate_latest = lambda *_args, **_kwargs: b""  # type: ignore
    _PROM_REG = None

class StartResponse(Protocol):  # pragma: no cover - typing helper
    def __call__(
        self,
        status: str,
        response_headers: list[tuple[str, str]],
        exc_info: Optional[tuple[type[BaseException], BaseException, Optional[object]]] = None,
    ) -> None:
        ...


class GatewayApplication:
    """WSGI application responsible for serving exports and health endpoints."""

    def __init__(self, config: GatewayConfig):
        self.config = config
        self._root = config.export_root

    # -- WSGI entrypoint -------------------------------------------------
    def __call__(
        self, environ: dict[str, str], start_response: StartResponse
    ) -> Iterable[bytes]:  # pragma: no cover - exercised via tests
        method = environ.get("REQUEST_METHOD", "GET").upper()
        path_info = environ.get("PATH_INFO", "")

        if path_info in {"/healthz", "/livez", "/readyz"}:
            return self._handle_health(method, environ, start_response)

        if path_info == "/metrics" and _PROM_REG is not None:
            return self._serve_metrics(start_response)

        if not path_info.startswith("/exports/"):
            return self._not_found(start_response)

        return self._serve_export(method, path_info[len("/exports/") :], environ, start_response)

    # -- Endpoint handlers ----------------------------------------------
    def _handle_health(
        self, method: str, environ: dict[str, str], start_response: StartResponse
    ) -> Iterable[bytes]:
        if method not in {"GET", "HEAD"}:
            return self._method_not_allowed(start_response)

        path = environ.get("PATH_INFO", "")
        # /livez is always public; the other endpoints honour `health_public`.
        if path != "/livez" and (not self.config.health_public and not self._authorized(environ)):
            return self._unauthorized(start_response)

        headers = [("Content-Type", "text/plain; charset=utf-8"), ("Cache-Control", "no-store")]
        if self.config.version:
            headers.append(("X-Mobius-Version", self.config.version))

        status_text = "ok"
        if path == "/readyz":
            if not self._check_ready():
                status_text = "degraded"

        status_line = "200 OK" if status_text == "ok" else "503 Service Unavailable"
        start_response(status_line, headers)
        if method == "HEAD":
            return []
        return [status_text.encode("utf-8")]

    def _serve_export(
        self,
        method: str,
        rel_path: str,
        environ: dict[str, str],
        start_response: StartResponse,
    ) -> Iterable[bytes]:
        if method not in {"GET", "HEAD"}:
            return self._method_not_allowed(start_response)

        if self.config.gateway_key and not self._authorized(environ):
            return self._unauthorized(start_response)

        target = (self._root / rel_path).resolve()
        try:
            target.relative_to(self._root)
        except ValueError:
            return self._not_found(start_response)

        if not target.exists() or not target.is_file():
            return self._not_found(start_response)

        headers = [
            ("Content-Type", "application/octet-stream"),
            ("Cache-Control", "private, max-age=0, must-revalidate"),
        ]

        start_response("200 OK", headers)
        if method == "HEAD":
            return []
        return self._file_iterator(target)

    def _serve_metrics(self, start_response: StartResponse) -> Iterable[bytes]:
        payload = generate_latest() if _PROM_REG else b""
        start_response(
            "200 OK",
            [("Content-Type", CONTENT_TYPE_LATEST), ("Cache-Control", "no-store")],
        )
        return [payload]

    # -- Helpers ---------------------------------------------------------
    def _check_ready(self) -> bool:
        try:
            if not self._root.exists() or not self._root.is_dir():
                return False
            # Touch the iterator to ensure we can read the directory.
            next(iter(self._root.iterdir()), None)
        except Exception:
            return False

        key_store = self.config.key_store_path
        if key_store is not None:
            try:
                if not key_store.exists() or not key_store.is_file():
                    return False
                with key_store.open("rb"):
                    pass
            except Exception:
                return False
        return True

    def _authorized(self, environ: dict[str, str]) -> bool:
        if not self.config.gateway_key:
            return True
        header = environ.get("HTTP_AUTHORIZATION", "")
        if not header.startswith("Bearer "):
            return False
        token = header.split(" ", 1)[1]
        return token.strip() == self.config.gateway_key

    def _file_iterator(self, path: Path) -> Iterator[bytes]:  # pragma: no cover - trivial
        with path.open("rb") as handle:
            while True:
                chunk = handle.read(8192)
                if not chunk:
                    break
                yield chunk

    def _method_not_allowed(self, start_response: StartResponse) -> Iterable[bytes]:
        start_response("405 Method Not Allowed", [("Content-Type", "text/plain; charset=utf-8")])
        return [b"method not allowed"]

    def _unauthorized(self, start_response: StartResponse) -> Iterable[bytes]:
        start_response("401 Unauthorized", [("Content-Type", "text/plain; charset=utf-8")])
        return [b"unauthorized"]

    def _not_found(self, start_response: StartResponse) -> Iterable[bytes]:
        start_response("404 Not Found", [("Content-Type", "text/plain; charset=utf-8")])
        return [b"not found"]
