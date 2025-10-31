"""Security helpers for gateway routes."""
from __future__ import annotations

from typing import Optional

from .config import SETTINGS
from .framework import Request, Response


class Unauthorized(Response):
    def __init__(self) -> None:
        super().__init__("Forbidden", status_code=403, headers={"Content-Type": "text/plain"})


def validate_api_key(request: Request) -> Optional[Response]:
    required = SETTINGS.api_key
    if not required:
        return None
    provided = request.header("X-Mobius-Key")
    if provided == required:
        return None
    return Unauthorized()


def health_access_allowed(request: Request) -> bool:
    if SETTINGS.health_public:
        return True
    return validate_api_key(request) is None
