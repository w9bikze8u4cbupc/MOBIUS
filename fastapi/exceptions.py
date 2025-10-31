"""Exception classes for the FastAPI stub."""

from __future__ import annotations


class HTTPException(Exception):
    def __init__(self, *, status_code: int, detail: str | None = None) -> None:
        super().__init__(detail or "HTTP error")
        self.status_code = status_code
        self.detail = detail or ""
