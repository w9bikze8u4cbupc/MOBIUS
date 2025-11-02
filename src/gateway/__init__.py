"""Gateway package providing a minimal WSGI application."""

from .config import GatewayConfig
from .app import GatewayApplication

__all__ = ["GatewayApplication", "GatewayConfig"]
