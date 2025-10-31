from __future__ import annotations

import inspect
import re
from dataclasses import dataclass
from typing import Any, Callable, Dict, List, Optional, Tuple

from .responses import JSONResponse, FileResponse, Headers, Response
from . import status as status


class HTTPException(Exception):
    def __init__(self, status_code: int, detail: Any = None, headers: Optional[Dict[str, str]] = None) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail
        self.headers = headers or {}


class Request:
    def __init__(
        self,
        *,
        method: str,
        url: str,
        headers: Optional[Dict[str, str]] = None,
        path_params: Optional[Dict[str, Any]] = None,
        client: Optional[Any] = None,
        app: Optional["FastAPI"] = None,
    ) -> None:
        self.method = method.upper()
        self.url = url
        self.headers = Headers(headers or {})
        self.path_params = path_params or {}
        self.client = client
        self.app = app


@dataclass
class _Route:
    method: str
    path: str
    handler: Callable[..., Any]
    pattern: re.Pattern[str]
    param_names: List[str]
    is_path: Dict[str, bool]


class FastAPI:
    def __init__(self) -> None:
        self._routes: List[_Route] = []
        self._middleware_classes: List[Tuple[Callable[..., Any], Dict[str, Any]]] = []
        self._middleware_funcs: List[Callable[..., Any]] = []

    def add_middleware(self, middleware_class: Callable[..., Any], **kwargs: Any) -> None:
        self._middleware_classes.append((middleware_class, kwargs))

    def middleware(self, kind: str) -> Callable[[Callable[..., Any]], Callable[..., Any]]:
        if kind != "http":  # pragma: no cover - only http supported
            raise ValueError("Only 'http' middleware is supported")

        def decorator(func: Callable[..., Any]) -> Callable[..., Any]:
            self._middleware_funcs.append(func)
            return func

        return decorator

    def get(self, path: str) -> Callable[[Callable[..., Any]], Callable[..., Any]]:
        return self._register_route("GET", path)

    def head(self, path: str) -> Callable[[Callable[..., Any]], Callable[..., Any]]:
        return self._register_route("HEAD", path)

    def _register_route(self, method: str, path: str) -> Callable[[Callable[..., Any]], Callable[..., Any]]:
        def decorator(func: Callable[..., Any]) -> Callable[..., Any]:
            pattern, param_names, is_path = self._compile_path(path)
            self._routes.append(_Route(method, path, func, pattern, param_names, is_path))
            return func

        return decorator

    @staticmethod
    def _compile_path(path: str) -> Tuple[re.Pattern[str], List[str], Dict[str, bool]]:
        if not path.startswith("/"):
            raise ValueError("Path must start with '/'")
        segments = path.strip("/").split("/") if path.strip("/") else []
        regex = "^"
        param_names: List[str] = []
        is_path: Dict[str, bool] = {}
        if not segments:
            regex += "/"
        for segment in segments:
            regex += "/"
            if segment.startswith("{") and segment.endswith("}"):
                inner = segment[1:-1]
                if ":" in inner:
                    name, conv = inner.split(":", 1)
                else:
                    name, conv = inner, "str"
                param_names.append(name)
                if conv == "path":
                    regex += f"(?P<{name}>.+)"
                    is_path[name] = True
                else:
                    regex += f"(?P<{name}>[^/]+)"
                    is_path[name] = False
            else:
                regex += re.escape(segment)
        regex += "/?$"
        return re.compile(regex), param_names, is_path

    def _match_route(self, method: str, path: str) -> Optional[Tuple[_Route, Dict[str, str]]]:
        for route in self._routes:
            if route.method != method:
                continue
            match = route.pattern.match(path)
            if match:
                return route, match.groupdict()
        return None

    async def _dispatch(self, request: Request) -> Response:
        match = self._match_route(request.method, request.url)
        if match is None:
            return Response(b"", status_code=status.HTTP_404_NOT_FOUND)
        route, path_params = match
        request.path_params = path_params
        request.app = self

        async def endpoint(req: Request) -> Response:
            result = await self._call_handler(route.handler, req, path_params)
            if isinstance(result, Response):
                return result
            if isinstance(result, tuple) and result:
                body = result[0]
                status_code = result[1] if len(result) > 1 else status.HTTP_200_OK
                headers = result[2] if len(result) > 2 else None
                return Response(body, status_code=status_code, headers=headers)
            if result is None:
                return Response(b"", status_code=status.HTTP_204_NO_CONTENT)
            raise TypeError("Unsupported response type")

        handler = endpoint
        for func in reversed(self._middleware_funcs):
            handler = self._wrap_function_middleware(func, handler)
        for cls, kwargs in reversed(self._middleware_classes):
            instance = cls(**kwargs)
            handler = self._wrap_class_middleware(instance, handler)
        try:
            response = await handler(request)
        except HTTPException as exc:
            return self._exception_to_response(exc)
        if not isinstance(response, Response):
            raise TypeError("Handler did not return Response")
        return response

    async def _call_handler(self, handler: Callable[..., Any], request: Request, path_params: Dict[str, str]) -> Any:
        kwargs = dict(path_params)
        signature = inspect.signature(handler)
        if "request" in signature.parameters:
            kwargs["request"] = request
        result = handler(**kwargs)
        if inspect.isawaitable(result):
            result = await result
        return result

    @staticmethod
    def _wrap_function_middleware(func: Callable[..., Any], next_handler: Callable[[Request], Any]) -> Callable[[Request], Any]:
        async def middleware(request: Request) -> Response:
            async def call_next(req: Request) -> Response:
                result = next_handler(req)
                if inspect.isawaitable(result):
                    result = await result
                return result

            result = func(request, call_next)
            if inspect.isawaitable(result):
                result = await result
            return result

        return middleware

    @staticmethod
    def _wrap_class_middleware(instance: Any, next_handler: Callable[[Request], Any]) -> Callable[[Request], Any]:
        async def middleware(request: Request) -> Response:
            async def call_next(req: Request) -> Response:
                result = next_handler(req)
                if inspect.isawaitable(result):
                    result = await result
                return result

            result = instance(request, call_next)
            if inspect.isawaitable(result):
                result = await result
            return result

        return middleware

    @staticmethod
    def _exception_to_response(exc: HTTPException) -> Response:
        body = {"detail": exc.detail}
        response = JSONResponse(body, status_code=exc.status_code, headers=exc.headers)
        return response


__all__ = [
    "FastAPI",
    "HTTPException",
    "Request",
    "Response",
    "JSONResponse",
    "FileResponse",
    "Headers",
    "status",
]
