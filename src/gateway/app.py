"""Gateway application wiring with layered security middleware."""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, Mapping, MutableMapping, Optional

from mobius.observability.security import (
    RateLimitExceeded,
    RateLimitMiddleware,
    build_rate_limit_config,
)

logger = logging.getLogger(__name__)

audit_logger = logging.getLogger("mobius.audit")


@dataclass
class GatewayRequest:
    """Lightweight request object used by the gateway pipeline."""

    method: str
    path: str
    headers: Mapping[str, str]
    payload: Any = None
    client_id: Optional[str] = None
    endpoint_key: Optional[str] = None

    @property
    def origin(self) -> Optional[str]:
        value = self.headers.get("Origin") if self.headers else None
        return value


@dataclass
class GatewayResponse:
    status_code: int
    body: Any
    headers: MutableMapping[str, str] = field(default_factory=dict)


class Middleware:
    def wrap(self, handler: Callable[[GatewayRequest], GatewayResponse]) -> Callable[[GatewayRequest], GatewayResponse]:
        return handler


class AuditLoggingMiddleware(Middleware):
    def __init__(self, audit_logger: logging.Logger) -> None:
        self._audit_logger = audit_logger

    def wrap(
        self, handler: Callable[[GatewayRequest], GatewayResponse]
    ) -> Callable[[GatewayRequest], GatewayResponse]:
        def wrapped(request: GatewayRequest) -> GatewayResponse:
            self._audit_logger.info(
                "gateway.request",
                extra={"method": request.method, "path": request.path, "client_id": request.client_id},
            )
            try:
                response = handler(request)
            except Exception as exc:  # pragma: no cover - safety net
                self._audit_logger.exception(
                    "gateway.error",
                    extra={"method": request.method, "path": request.path, "client_id": request.client_id},
                )
                raise exc
            self._audit_logger.info(
                "gateway.response",
                extra={
                    "method": request.method,
                    "path": request.path,
                    "client_id": request.client_id,
                    "status_code": response.status_code,
                },
            )
            return response

        return wrapped


class CORSMiddleware(Middleware):
    def __init__(self, allowed_origins: Optional[list[str]] = None) -> None:
        self.allowed_origins = allowed_origins or []

    def wrap(
        self, handler: Callable[[GatewayRequest], GatewayResponse]
    ) -> Callable[[GatewayRequest], GatewayResponse]:
        def wrapped(request: GatewayRequest) -> GatewayResponse:
            origin = request.origin
            if origin and self.allowed_origins and origin not in self.allowed_origins:
                logger.warning("Rejected disallowed origin", extra={"origin": origin})
                response = GatewayResponse(
                    status_code=403,
                    body={"error": "Origin not allowed"},
                )
            else:
                response = handler(request)
            if origin and (not self.allowed_origins or origin in self.allowed_origins):
                response.headers.setdefault("Access-Control-Allow-Origin", origin)
                response.headers.setdefault("Vary", "Origin")
                response.headers.setdefault("Access-Control-Allow-Credentials", "true")
            return response

        return wrapped


class SecurityHeadersMiddleware(Middleware):
    def __init__(self, policies: Mapping[str, str]) -> None:
        self.policies = dict(policies)

    def apply(self, response: GatewayResponse) -> GatewayResponse:
        for header, value in self.policies.items():
            response.headers.setdefault(header, value)
        return response

    def wrap(
        self, handler: Callable[[GatewayRequest], GatewayResponse]
    ) -> Callable[[GatewayRequest], GatewayResponse]:
        def wrapped(request: GatewayRequest) -> GatewayResponse:
            response = handler(request)
            return self.apply(response)

        return wrapped


class GatewayApp:
    """Application wrapper that layers security middleware before business logic."""

    def __init__(self) -> None:
        self._routes: Dict[str, Callable[[GatewayRequest], GatewayResponse]] = {}
        self._security_headers = SecurityHeadersMiddleware({})
        self._load_routes()
        self._middleware_chain = self._build_middleware_chain()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def register_route(
        self, method: str, path: str, handler: Callable[[GatewayRequest], GatewayResponse]
    ) -> None:
        key = f"{method.upper()}:{path}"
        self._routes[key] = handler

    def handle_request(self, request: GatewayRequest) -> GatewayResponse:
        key = request.endpoint_key or f"{request.method.upper()}:{request.path}"
        handler = self._routes.get(key)
        if handler is None:
            def handler(_: GatewayRequest) -> GatewayResponse:
                return GatewayResponse(status_code=404, body={"error": "Not found"})
        request.endpoint_key = key
        secured_handler = self._middleware_chain(handler)
        try:
            response = secured_handler(request)
        except RateLimitExceeded as exc:
            response = GatewayResponse(
                status_code=429,
                body={"error": "Rate limit exceeded", "retry_after": exc.retry_after},
                headers={"Retry-After": f"{int(exc.retry_after)}"},
            )
        return self._security_headers.apply(response)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _load_routes(self) -> None:
        def health(_: GatewayRequest) -> GatewayResponse:
            return GatewayResponse(status_code=200, body={"status": "ok"})

        self.register_route("GET", "/health", health)

    def _build_middleware_chain(
        self,
    ) -> Callable[[Callable[[GatewayRequest], GatewayResponse]], Callable[[GatewayRequest], GatewayResponse]]:
        cors_allowed = _parse_csv(os.getenv("MOBIUS_CORS_ALLOWED_ORIGINS", ""))
        if not cors_allowed:
            cors_allowed = ["https://mobius.example.com"]

        header_policies = _parse_header_policies(os.getenv("MOBIUS_SECURITY_HEADERS", ""))
        if not header_policies:
            header_policies = {
                "Strict-Transport-Security": "max-age=63072000; includeSubDomains",
                "X-Content-Type-Options": "nosniff",
                "X-Frame-Options": "DENY",
                "Referrer-Policy": "no-referrer",
            }

        rate_limit_rules = build_rate_limit_config(os.getenv("MOBIUS_RATE_LIMITS"))
        rate_limiter = RateLimitMiddleware(rate_limit_rules, identifier_getter=_client_identifier)
        audit = AuditLoggingMiddleware(audit_logger)
        cors = CORSMiddleware(cors_allowed)
        self._security_headers = SecurityHeadersMiddleware(header_policies)

        def chain(
            handler: Callable[[GatewayRequest], GatewayResponse]
        ) -> Callable[[GatewayRequest], GatewayResponse]:
            wrapped = handler
            wrapped = rate_limiter.wrap(wrapped)
            wrapped = cors.wrap(wrapped)
            wrapped = audit.wrap(wrapped)
            return wrapped

        return chain


# ---------------------------------------------------------------------------
# Helper utilities
# ---------------------------------------------------------------------------


def _client_identifier(request: GatewayRequest) -> str:
    if request.client_id:
        return request.client_id
    return request.headers.get("X-Forwarded-For") or request.headers.get("Remote-Addr") or "global"


def _parse_csv(raw: str) -> list[str]:
    return [item.strip() for item in raw.split(",") if item.strip()]


def _parse_header_policies(raw: str) -> Dict[str, str]:
    policies: Dict[str, str] = {}
    if not raw:
        return policies
    for chunk in raw.split(","):
        chunk = chunk.strip()
        if not chunk:
            continue
        if ":" not in chunk:
            continue
        header, value = chunk.split(":", 1)
        policies[header.strip()] = value.strip()
    return policies


__all__ = [
    "GatewayApp",
    "GatewayRequest",
    "GatewayResponse",
]
