"""WSGI gateway package exposing the application entry point."""
from __future__ import annotations

from typing import Callable, Iterable

from .application import GatewayApplication

ResponseIterable = Iterable[bytes]
StartResponse = Callable[[str, list[tuple[str, str]]], Callable[[bytes], object]]


_cached_handler: Callable[[dict[str, object], StartResponse], ResponseIterable] | None = None


def _lazy_application() -> Callable[[dict[str, object], StartResponse], ResponseIterable]:
    global _cached_handler
    if _cached_handler is None:
        gateway = GatewayApplication()
        _cached_handler = gateway.application
    return _cached_handler


def application(environ: dict[str, object], start_response: StartResponse) -> ResponseIterable:
    """Lazy wrapper that defers instantiation until the first request."""
    handler = _lazy_application()
    return handler(environ, start_response)


__all__ = ["GatewayApplication", "application"]
