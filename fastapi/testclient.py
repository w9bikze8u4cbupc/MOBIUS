"""Synchronous test client compatible with the offline FastAPI shim."""

from __future__ import annotations

from . import FastAPI, Response


class TestClient:
    """A very small HTTP client adapter for unit tests."""

    def __init__(self, app: FastAPI) -> None:
        self._app = app

    def get(self, path: str) -> Response:
        """Invoke a registered GET route and return its response."""

        handler = self._app(path)
        if not handler:
            return Response(status_code=404, content={"detail": "Not Found"})
        return handler()


__all__ = ["TestClient"]
