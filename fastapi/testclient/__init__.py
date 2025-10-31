"""Test client for the FastAPI stub."""

from __future__ import annotations

from typing import Dict, Optional

from ..responses import Response


class TestClient:
    __test__ = False
    def __init__(self, app) -> None:
        self.app = app

    def get(self, path: str, headers: Optional[Dict[str, str]] = None) -> Response:
        return self.app.handle_request("GET", path, headers=headers)
