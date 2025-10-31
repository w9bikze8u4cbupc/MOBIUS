"""Minimal FastAPI-compatible application implementation for tests."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Awaitable, Callable, Dict, List, Tuple

from .exceptions import HTTPException
from .requests import Request
from .responses import JSONResponse, Response


Handler = Callable[..., Awaitable[Response]]
Middleware = Callable[[Request, Callable[[Request], Awaitable[Response]]], Awaitable[Response]]


@dataclass
class Route:
    method: str
    template: str
    handler: Handler


class FastAPI:
    """Very small subset of FastAPI used for offline testing."""

    def __init__(self, title: str | None = None) -> None:
        self.title = title or "FastAPI"
        self._routes: List[Route] = []
        self._middlewares: List[Middleware] = []

    def get(self, template: str) -> Callable[[Handler], Handler]:
        def decorator(func: Handler) -> Handler:
            self._routes.append(Route("GET", template, func))
            return func

        return decorator

    def middleware(self, _: str) -> Callable[[Middleware], Middleware]:
        def decorator(func: Middleware) -> Middleware:
            self._middlewares.append(func)
            return func

        return decorator

    async def _dispatch(self, method: str, path: str, headers: Dict[str, str]) -> Response:
        route, params = self._find_route(method, path)
        if route is None:
            raise HTTPException(status_code=404, detail="Not found")

        request = Request(headers=headers)

        async def route_handler(req: Request) -> Response:
            kwargs = dict(params)
            kwargs["request"] = req
            return await route.handler(**kwargs)

        async def call_middleware(index: int, req: Request) -> Response:
            if index >= len(self._middlewares):
                return await route_handler(req)
            middleware = self._middlewares[index]
            return await middleware(req, lambda new_req: call_middleware(index + 1, new_req))

        try:
            return await call_middleware(0, request)
        except HTTPException as exc:
            return JSONResponse({"detail": exc.detail}, status_code=exc.status_code)

    def _find_route(self, method: str, path: str) -> Tuple[Route | None, Dict[str, str]]:
        for route in self._routes:
            if route.method != method:
                continue
            params = self._match(route.template, path)
            if params is not None:
                return route, params
        return None, {}

    @staticmethod
    def _match(template: str, actual: str) -> Dict[str, str] | None:
        if "{file_path:path}" in template:
            prefix, suffix = template.split("{file_path:path}")
            if not actual.startswith(prefix):
                return None
            if suffix and not actual.endswith(suffix):
                return None
            core = actual[len(prefix) : len(actual) - len(suffix) if suffix else None]
            return {"file_path": core}
        if template == actual:
            return {}
        return None

    def handle_request(self, method: str, path: str, headers: Dict[str, str] | None = None) -> Response:
        headers = {k.lower(): v for k, v in (headers or {}).items()}
        return asyncio.run(self._dispatch(method, path, headers))
