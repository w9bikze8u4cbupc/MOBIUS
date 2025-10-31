from __future__ import annotations

import asyncio
import inspect
import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Awaitable, Callable, Dict, List, Optional, Pattern, Tuple

from . import status


class HTTPException(Exception):
    def __init__(self, status_code: int, detail: str | None = None) -> None:
        super().__init__(detail or "HTTPException")
        self.status_code = status_code
        self.detail = detail


@dataclass
class _URL:
    path: str


class _Headers:
    def __init__(self, data: Optional[Dict[str, str]] = None) -> None:
        self._data = {k.lower(): v for k, v in (data or {}).items()}

    def get(self, key: str, default: Optional[str] = None) -> Optional[str]:
        return self._data.get(key.lower(), default)

    def __getitem__(self, key: str) -> str:
        return self._data[key.lower()]

    def items(self):
        return self._data.items()


class Request:
    def __init__(self, method: str, path: str, headers: Optional[Dict[str, str]] = None, client: Optional[Tuple[str, int]] = None) -> None:
        self.method = method.upper()
        self._path = path
        self.headers = _Headers(headers)
        self.url = _URL(path=path)
        if client:
            self.client = type("Client", (), {"host": client[0], "port": client[1]})()
        else:
            self.client = None


class Response:
    def __init__(self, content: bytes = b"", status_code: int = status.HTTP_200_OK, headers: Optional[Dict[str, str]] = None, media_type: str = "application/octet-stream") -> None:
        self.body = content
        self.status_code = status_code
        self.headers: Dict[str, str] = headers.copy() if headers else {}
        if media_type:
            self.headers.setdefault("content-type", media_type)


class JSONResponse(Response):
    def __init__(self, data: Any, status_code: int = status.HTTP_200_OK, headers: Optional[Dict[str, str]] = None) -> None:
        payload = json.dumps(data).encode("utf-8")
        super().__init__(payload, status_code=status_code, headers=headers, media_type="application/json")


class FileResponse(Response):
    def __init__(self, path: str | Path, *, media_type: str = "application/octet-stream", headers: Optional[Dict[str, str]] = None, method: str = "GET") -> None:
        file_path = Path(path)
        content = b""
        if method.upper() != "HEAD":
            content = file_path.read_bytes()
        merged_headers = {"content-length": str(file_path.stat().st_size)}
        if headers:
            merged_headers.update(headers)
        super().__init__(content, status_code=status.HTTP_200_OK, headers=merged_headers, media_type=media_type)


class Depends:  # pragma: no cover - compatibility shim
    def __init__(self, dependency: Callable[..., Any]) -> None:
        self.dependency = dependency


@dataclass
class _Route:
    method: str
    pattern: Pattern[str]
    handler: Callable[..., Any]


def _compile_path(path: str) -> Pattern[str]:
    param_pattern = re.compile(r"{([a-zA-Z_][a-zA-Z0-9_]*)(?::([a-zA-Z_]+))?}")

    def replacer(match: re.Match[str]) -> str:
        name, converter = match.group(1), match.group(2)
        if converter == "path":
            return f"(?P<{name}>.+)"
        return f"(?P<{name}>[^/]+)"

    regex = "^" + param_pattern.sub(replacer, path) + "$/?"
    return re.compile(regex)


class FastAPI:
    def __init__(self) -> None:
        self._routes: List[_Route] = []
        self._middlewares: List[Callable[[Request, Callable[[Request], Awaitable[Response]]], Awaitable[Response]]] = []

    def add_middleware(self, middleware_cls: Callable[..., Any], **kwargs: Any) -> None:
        instance = middleware_cls(**kwargs)

        async def middleware(request: Request, call_next: Callable[[Request], Awaitable[Response]]) -> Response:
            result = instance(request, call_next)
            if inspect.isawaitable(result):
                return await result
            return result

        self._middlewares.append(middleware)

    def middleware(self, _type: str) -> Callable[[Callable[..., Any]], Callable[..., Any]]:
        if _type != "http":
            raise ValueError("Only 'http' middleware supported")

        def decorator(func: Callable[[Request, Callable[[Request], Awaitable[Response]]], Awaitable[Response]]):
            async def wrapper(request: Request, call_next: Callable[[Request], Awaitable[Response]]) -> Response:
                result = func(request, call_next)
                if inspect.isawaitable(result):
                    return await result
                return result

            self._middlewares.append(wrapper)
            return func

        return decorator

    def get(self, path: str) -> Callable[[Callable[..., Any]], Callable[..., Any]]:
        return self._add_route("GET", path)

    def head(self, path: str) -> Callable[[Callable[..., Any]], Callable[..., Any]]:
        return self._add_route("HEAD", path)

    def _add_route(self, method: str, path: str) -> Callable[[Callable[..., Any]], Callable[..., Any]]:
        pattern = _compile_path(path)

        def decorator(func: Callable[..., Any]) -> Callable[..., Any]:
            self._routes.append(_Route(method.upper(), pattern, func))
            return func

        return decorator

    async def _handle_request(self, request: Request) -> Response:
        route, params = self._match_route(request.method, request.url.path)
        if route is None:
            return Response(b"Not Found", status_code=status.HTTP_404_NOT_FOUND, media_type="text/plain")

        async def endpoint(req: Request) -> Response:
            kwargs = params.copy()
            if "request" in inspect.signature(route.handler).parameters:
                kwargs["request"] = req
            result = route.handler(**kwargs)
            if inspect.isawaitable(result):
                result = await result
            if isinstance(result, Response):
                return result
            return Response(str(result).encode("utf-8"))

        handler = endpoint
        for middleware in reversed(self._middlewares):
            previous = handler

            async def wrapped(req: Request, mw=middleware, nxt=previous):
                return await mw(req, nxt)

            handler = wrapped

        try:
            response = await handler(request)
        except HTTPException as exc:
            payload = exc.detail.encode("utf-8") if exc.detail else b""
            return Response(payload, status_code=exc.status_code, media_type="text/plain")
        except Exception:
            return Response(b"Internal Server Error", status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, media_type="text/plain")
        return response

    def _match_route(self, method: str, path: str) -> Tuple[Optional[_Route], Dict[str, str]]:
        for route in self._routes:
            if route.method != method.upper():
                continue
            match = route.pattern.match(path)
            if match:
                return route, match.groupdict()
        return None, {}

    async def dispatch(self, request: Request) -> Response:
        return await self._handle_request(request)

    def __call__(self, request: Request) -> Response:
        return asyncio.run(self.dispatch(request))


__all__ = [
    "Depends",
    "FastAPI",
    "FileResponse",
    "HTTPException",
    "JSONResponse",
    "Request",
    "Response",
    "status",
]
