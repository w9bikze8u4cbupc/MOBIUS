"""Gateway service package exposing the FastAPI application factory."""

from .app import SAFE_ZIP_RE, app, create_app

__all__ = ["SAFE_ZIP_RE", "app", "create_app"]
