from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Any, Dict, Optional

from . import FastAPI, Request
from .responses import Response


@dataclass
class _ClientState:
    host: str = "testclient"


class TestClientResponse:
    def __init__(self, response: Response) -> None:
        self._response = response
        self.status_code = response.status_code
        self.headers = response.headers
        self.content = response.body

    @property
    def text(self) -> str:
        return self._response.text

    def json(self) -> Any:
        return self._response.json()


class TestClient:
    def __init__(self, app: FastAPI) -> None:
        self.app = app

    def _request(self, method: str, path: str, headers: Optional[Dict[str, str]] = None, data: Optional[bytes] = None) -> TestClientResponse:
        request = Request(
            method=method,
            url=path,
            headers=headers or {},
            path_params={},
            client=_ClientState(),
            app=self.app,
        )
        response = asyncio.run(self.app._dispatch(request))
        return TestClientResponse(response)

    def request(self, method: str, path: str, headers: Optional[Dict[str, str]] = None, data: Optional[bytes] = None) -> TestClientResponse:
        return self._request(method.upper(), path, headers=headers, data=data)

    def get(self, path: str, headers: Optional[Dict[str, str]] = None) -> TestClientResponse:
        return self.request("GET", path, headers=headers)

    def head(self, path: str, headers: Optional[Dict[str, str]] = None) -> TestClientResponse:
        return self.request("HEAD", path, headers=headers)

TestClient.__test__ = False
