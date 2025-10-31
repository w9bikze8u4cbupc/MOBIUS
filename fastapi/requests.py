"""Simple request object."""

from __future__ import annotations

from typing import Dict


class Request:
    """Represents an inbound HTTP request."""

    def __init__(self, headers: Dict[str, str] | None = None) -> None:
        self.headers = {k.lower(): v for k, v in (headers or {}).items()}

    def header(self, name: str) -> str | None:
        return self.headers.get(name.lower())
