"""MOBIUS Gateway application.

Provides offline-capable HTTP endpoints for exporting ZIP artifacts,
observability (/metrics), rate limiting, audit logging, and registry listing.
"""

from __future__ import annotations

import asyncio
from typing import Awaitable, Callable, Dict

from .types import Request, Response

Handler = Callable[[Request], Awaitable[Response] | Response]


class GatewayApp:
    """Very small ASGI-like façade used by the embedded HTTP server."""

    def __init__(self, handler: Handler) -> None:
        self._handler = handler

    async def dispatch(self, request: Request) -> Response:
        """Dispatch the request to the configured handler."""

        result = self._handler(request)
        if asyncio.iscoroutine(result):
            return await result  # type: ignore[return-value]
        return result


def create_app(handler: Handler) -> GatewayApp:
    """Helper used by tests to instantiate the lightweight gateway."""

    return GatewayApp(handler)


SECURITY_HEADER_DEFAULTS: Dict[str, str] = {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Vary": "Accept-Encoding",
}


def apply_security_headers(response: Response) -> Response:
    """Ensure baseline security headers are applied to the response."""

    headers = {**SECURITY_HEADER_DEFAULTS, **response.headers}
    return Response(status_code=response.status_code, body=response.body, headers=headers)
