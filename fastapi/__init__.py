"""Lightweight FastAPI-compatible shim for offline testing and CI."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, Dict, Iterable, Optional, TYPE_CHECKING

if TYPE_CHECKING:  # pragma: no cover - imported only for typing
    from .testclient import TestClient


@dataclass
class Response:
    """Simplified response object returned by endpoints."""

    status_code: int
    content: Any


class FastAPI:
    """Extremely small subset of FastAPI used for testing."""

    def __init__(self) -> None:
        self._routes: Dict[str, Callable[..., Response]] = {}
        self._middleware: Iterable[Callable[[Callable[..., Response]], Callable[..., Response]]] = []

    def get(self, path: str) -> Callable[[Callable[..., Response]], Callable[..., Response]]:
        """Register a GET route for the in-memory router."""

        def decorator(func: Callable[..., Response]) -> Callable[..., Response]:
            self._routes[path] = func
            return func

        return decorator

    def middleware(self, name: str) -> Callable[[Callable[..., Response]], Callable[..., Response]]:
        """Register a no-op middleware factory for compatibility."""

        def decorator(func: Callable[..., Response]) -> Callable[..., Response]:
            return func

        return decorator

    def __call__(self, path: str) -> Optional[Callable[..., Response]]:
        return self._routes.get(path)


__all__ = ["FastAPI", "Response", "TestClient"]
