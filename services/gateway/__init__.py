"""Gateway service exposing artifact exports via FastAPI."""

from .app import create_app, app

__all__ = ["create_app", "app"]
