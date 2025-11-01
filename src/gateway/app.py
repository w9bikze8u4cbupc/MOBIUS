"""Minimal gateway harness providing security middleware for Mobius services."""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from typing import Callable, Dict, Iterable, MutableMapping, Optional, Tuple

from mobius.observability.security import RateLimitExceeded, TokenBucketRateLimiter

Handler = Callable[["GatewayRequest"], "GatewayResponse"]


def _default_audit_logger() -> logging.Logger:
    return logging.getLogger("mobius.gateway.audit")


@dataclass
class GatewayRequest:
    """Simplified request object passed through the middleware chain."""

    method: str
    path: str
    headers: MutableMapping[str, str]
    body: Optional[object] = None
    origin: Optional[str] = None
    client_id: Optional[str] = None
    remote_addr: Optional[str] = None

    @property
    def key(self) -> str:
        return f"{self.method}:{self.path}:{self.client_id or self.remote_addr or 'anonymous'}"


@dataclass
class GatewayResponse:
    """Simplified HTTP response object."""

    status_code: int
    body: object
    headers: Dict[str, str] = field(default_factory=dict)

    def as_dict(self) -> Dict[str, object]:
        return {"status": self.status_code, "body": self.body, "headers": self.headers}


class AuditLoggerMiddleware:
    def __init__(self, logger: logging.Logger) -> None:
        self.logger = logger

    def wrap(self, handler: Handler) -> Handler:
        def wrapped(request: GatewayRequest) -> GatewayResponse:
            response = handler(request)
            self.logger.info(
                "gateway_request",
                extra={
                    "method": request.method,
                    "path": request.path,
                    "status": response.status_code,
                    "client_id": request.client_id,
                    "remote_addr": request.remote_addr,
                },
            )
            return response

        return wrapped


class CORSMiddleware:
    def __init__(self, allowed_origins: Optional[Iterable[str]] = None) -> None:
        self.allowed_origins = set(allowed_origins or [])

    def wrap(self, handler: Handler) -> Handler:
        def wrapped(request: GatewayRequest) -> GatewayResponse:
            response = handler(request)
            origin = request.origin or request.headers.get("Origin")
            if origin and (not self.allowed_origins or origin in self.allowed_origins):
                response.headers.setdefault("Access-Control-Allow-Origin", origin)
                response.headers.setdefault("Vary", "Origin")
                response.headers.setdefault("Access-Control-Allow-Credentials", "true")
                response.headers.setdefault(
                    "Access-Control-Expose-Headers",
                    "Content-Disposition,ETag,Last-Modified,X-Request-Id",
                )
            return response

        return wrapped


class RateLimitMiddleware:
    def __init__(self, limiter: TokenBucketRateLimiter) -> None:
        self.limiter = limiter

    def wrap(self, handler: Handler) -> Handler:
        def wrapped(request: GatewayRequest) -> GatewayResponse:
            self.limiter.allow(request.key)
            return handler(request)

        return wrapped


class SecurityHeadersMiddleware:
    def __init__(self, policies: Optional[Dict[str, str]] = None) -> None:
        if policies is None:
            policies = {
                "Strict-Transport-Security": "max-age=63072000; includeSubDomains",
                "X-Content-Type-Options": "nosniff",
                "X-Frame-Options": "DENY",
                "Referrer-Policy": "no-referrer",
                "Permissions-Policy": "geolocation=(), microphone=(), camera=()",
                "Cross-Origin-Opener-Policy": "same-origin",
                "Cross-Origin-Resource-Policy": "same-site",
                "Content-Security-Policy": "default-src 'none'",
            }
        self.policies = policies

    def wrap(self, handler: Handler) -> Handler:
        def wrapped(request: GatewayRequest) -> GatewayResponse:
            response = handler(request)
            for header, value in self.policies.items():
                response.headers.setdefault(header, value)
            return response

        return wrapped


class GatewayApp:
    """Composable gateway application that applies security middleware."""

    def __init__(
        self,
        *,
        rate_limiter: Optional[TokenBucketRateLimiter] = None,
        audit_logger: Optional[logging.Logger] = None,
        allowed_origins: Optional[Iterable[str]] = None,
        header_policies: Optional[Dict[str, str]] = None,
    ) -> None:
        self.routes: Dict[Tuple[str, str], Handler] = {}
        self.audit_logger = audit_logger or _default_audit_logger()
        self.rate_limiter = rate_limiter or TokenBucketRateLimiter(capacity=60, refill_rate=1.0)
        self.allowed_origins = allowed_origins
        self.header_policies = header_policies
        self._middlewares = [
            AuditLoggerMiddleware(self.audit_logger),
            CORSMiddleware(self.allowed_origins),
            RateLimitMiddleware(self.rate_limiter),
            SecurityHeadersMiddleware(self.header_policies),
        ]
        self._load_routes()

    def register_route(self, method: str, path: str, handler: Handler) -> None:
        self.routes[(method.upper(), path)] = handler

    def _load_routes(self) -> None:
        def health(_: GatewayRequest) -> GatewayResponse:
            return GatewayResponse(status_code=200, body={"status": "ok"})

        self.register_route("GET", "/health", health)

        def preflight(_: GatewayRequest) -> GatewayResponse:
            resp = GatewayResponse(status_code=204, body="")
            resp.headers.update(
                {
                    "Access-Control-Allow-Methods": "GET,POST,HEAD,OPTIONS",
                    "Access-Control-Allow-Headers": "Authorization,Content-Type,X-Mobius-Key",
                    "Access-Control-Max-Age": "600",
                }
            )
            return resp

        self.register_route("OPTIONS", "/health", preflight)

    def _build_middleware_chain(self, handler: Handler) -> Handler:
        wrapped = handler
        for middleware in reversed(self._middlewares):
            wrapped = middleware.wrap(wrapped)
        return wrapped

    def handle_request(self, request: GatewayRequest) -> GatewayResponse:
        key = (request.method.upper(), request.path)
        handler = self.routes.get(key)
        if handler is None:
            return GatewayResponse(status_code=404, body={"error": "Not found"})
        try:
            wrapped = self._build_middleware_chain(handler)
            response = wrapped(request)
        except RateLimitExceeded as exc:
            import math

            retry = int(math.ceil(exc.retry_after))
            return GatewayResponse(
                status_code=429,
                body={"error": "Rate limit exceeded", "retry_after": retry},
                headers={"Retry-After": f"{retry}"},
            )
        if isinstance(response.body, (dict, list)):
            response.headers.setdefault("Content-Type", "application/json")
            response.body = json.dumps(response.body)
        return response
