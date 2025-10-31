from __future__ import annotations

import asyncio
import json
from typing import Any, Dict, Optional

from . import Request


class _Headers:
    def __init__(self, data: Dict[str, str]) -> None:
        self._data = {k.lower(): v for k, v in data.items()}

    def __getitem__(self, key: str) -> str:
        return self._data[key.lower()]

    def get(self, key: str, default: Optional[str] = None) -> Optional[str]:
        return self._data.get(key.lower(), default)

    def items(self):
        return self._data.items()


class TestResponse:
    def __init__(self, response) -> None:
        self.status_code = response.status_code
        self.headers = _Headers(response.headers)
        self.content = response.body

    @property
    def text(self) -> str:
        return self.content.decode("utf-8", errors="replace")

    def json(self) -> Any:
        if not self.content:
            return None
        return json.loads(self.content.decode("utf-8"))


class TestClient:
    def __init__(self, app) -> None:
        self.app = app

    def _request(self, method: str, url: str, headers: Optional[Dict[str, str]] = None) -> TestResponse:
        req = Request(method, url, headers=headers, client=("testclient", 12345))
        response = asyncio.run(self.app.dispatch(req))
        return TestResponse(response)

    def get(self, url: str, headers: Optional[Dict[str, str]] = None) -> TestResponse:
        return self._request("GET", url, headers=headers)

    def head(self, url: str, headers: Optional[Dict[str, str]] = None) -> TestResponse:
        return self._request("HEAD", url, headers=headers)

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False
