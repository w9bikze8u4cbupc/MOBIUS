"""Gateway service exposing artifact exports via FastAPI."""

from .app import create_app, app

__all__ = ["app", "create_app"]
