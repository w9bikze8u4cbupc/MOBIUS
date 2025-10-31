"""Lightweight FastAPI-compatible testing framework."""
from __future__ import annotations

import inspect
import json
import re
from dataclasses import dataclass
from typing import Any, Callable, Dict, Iterable, Mapping, Optional
from urllib.parse import unquote


class Response:
    """Basic HTTP response container."""

    def __init__(
        self,
        content: bytes | str = b"",
        *,
        status_code: int = 200,
        headers: Optional[Mapping[str, str]] = None,
    ) -> None:
        if isinstance(content, str):
            content = content.encode("utf-8")
        self._content = content
        self.status_code = status_code
        self.headers: Dict[str, str] = {k: v for k, v in (headers or {}).items()}

    def render(self) -> bytes:
        return self._content

    @property
    def content(self) -> bytes:
        return self.render()


class JSONResponse(Response):
    """Response that serialises data as JSON."""

    def __init__(
        self,
        data: Any,
        *,
        status_code: int = 200,
        headers: Optional[Mapping[str, str]] = None,
    ) -> None:
        body = json.dumps(data, separators=(",", ":"), ensure_ascii=False)
        merged_headers = {"Content-Type": "application/json"}
        if headers:
            merged_headers.update(headers)
        super().__init__(body, status_code=status_code, headers=merged_headers)


class StreamingResponse(Response):
    """Response that streams content from an iterator."""

    def __init__(
        self,
        iterator: Iterable[bytes],
        *,
        status_code: int = 200,
        headers: Optional[Mapping[str, str]] = None,
        media_type: Optional[str] = None,
    ) -> None:
        super().__init__(b"", status_code=status_code, headers=headers)
        self._iterator = iterator
        if media_type:
            self.headers.setdefault("Content-Type", media_type)

    def render(self) -> bytes:
        if hasattr(self._iterator, "__iter__"):
            return b"".join(self._iterator)
        return b""


@dataclass
class Request:
    method: str
    path: str
    headers: Dict[str, str]

    def header(self, name: str) -> Optional[str]:
        for key, value in self.headers.items():
            if key.lower() == name.lower():
                return value
        return None


RouteHandler = Callable[..., Response]


@dataclass
class Route:
    method: str
    path: str
    handler: RouteHandler
    pattern: re.Pattern[str]
    param_names: tuple[str, ...]


class App:
    """Minimal routing container mimicking FastAPI."""

    def __init__(self) -> None:
        self._routes: list[Route] = []

    def get(self, path: str) -> Callable[[RouteHandler], RouteHandler]:
        return self._add_route("GET", path)

    def _add_route(self, method: str, path: str) -> Callable[[RouteHandler], RouteHandler]:
        def decorator(func: RouteHandler) -> RouteHandler:
            pattern, param_names = _compile_path(path)
            self._routes.append(Route(method, path, func, pattern, param_names))
            return func

        return decorator

    def handle_request(self, request: Request) -> Response:
        for route in self._routes:
            if request.method != route.method:
                continue
            match = route.pattern.match(request.path)
            if not match:
                continue
            kwargs = {
                name: unquote(match.group(name)) for name in route.param_names
            }
            # Inspect handler to see if it expects a request object.
            signature = inspect.signature(route.handler)
            call_kwargs = kwargs.copy()
            if "request" in signature.parameters:
                call_kwargs["request"] = request
            return route.handler(**call_kwargs)
        return Response(b"Not Found", status_code=404)


class ClientResponse:
    """Wrapper for responses returned by TestClient."""

    def __init__(self, response: Response) -> None:
        self.status_code = response.status_code
        self.headers = response.headers
        self._content = response.render()

    @property
    def content(self) -> bytes:
        return self._content

    @property
    def text(self) -> str:
        return self._content.decode("utf-8")

    def json(self) -> Any:
        return json.loads(self.text or "null")


class TestClient:
    """Synchronous test client similar to starlette.testclient."""

    def __init__(self, app: App) -> None:
        self._app = app

    def request(self, method: str, path: str, *, headers: Optional[Mapping[str, str]] = None) -> ClientResponse:
        req = Request(method=method.upper(), path=path, headers=dict(headers or {}))
        response = self._app.handle_request(req)
        return ClientResponse(response)

    def get(self, path: str, *, headers: Optional[Mapping[str, str]] = None) -> ClientResponse:
        return self.request("GET", path, headers=headers)


def _compile_path(path: str) -> tuple[re.Pattern[str], tuple[str, ...]]:
    param_names: list[str] = []

    def replacer(match: re.Match[str]) -> str:
        name = match.group(1)
        param_names.append(name)
        return rf"(?P<{name}>[^/]+)"

    pattern = re.sub(r"{([^{}]+)}", replacer, path)
    regex = re.compile(f"^{pattern}$")
    return regex, tuple(param_names)

