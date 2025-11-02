"""Minimal gateway wrapper providing audit logging, CORS and rate limiting."""

from __future__ import annotations

import json
import logging
import math
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Callable, Iterable, Mapping, MutableMapping, Optional

from mobius.observability.security import RateLimitExceeded, TokenBucketRateLimiter

LOGGER = logging.getLogger(__name__)


@dataclass(slots=True)
class GatewayRequest:
    """Lightweight representation of an incoming gateway request."""

    method: str
    path: str
    headers: Mapping[str, str] = field(default_factory=dict)
    body: Optional[Mapping[str, object]] = None

    @property
    def origin(self) -> Optional[str]:
        return self.headers.get("Origin")


@dataclass(slots=True)
class GatewayResponse:
    """Outgoing response from the gateway."""

    status_code: int
    body: Mapping[str, object] | str
    headers: MutableMapping[str, str] = field(default_factory=dict)

    def json(self) -> str:
        if isinstance(self.body, str):
            return self.body
        return json.dumps(self.body)


class AuditLoggingMiddleware:
    """Middleware that emits structured audit logs for gateway activity."""

    def __init__(self, logger: logging.Logger | None = None) -> None:
        self._logger = logger or LOGGER

    def wrap(self, handler: Callable[[GatewayRequest], GatewayResponse]) -> Callable[[GatewayRequest], GatewayResponse]:
        def wrapper(request: GatewayRequest) -> GatewayResponse:
            start = datetime.now(timezone.utc)
            self._logger.info(
                "gateway.request",
                extra={
                    "method": request.method,
                    "path": request.path,
                    "origin": request.origin,
                },
            )
            try:
                response = handler(request)
            except Exception as exc:  # pragma: no cover
                self._logger.exception(
                    "gateway.error",
                    extra={
                        "method": request.method,
                        "path": request.path,
                        "origin": request.origin,
                    },
                )
                raise
            duration_ms = int((datetime.now(timezone.utc) - start).total_seconds() * 1000)
            self._logger.info(
                "gateway.response",
                extra={
                    "method": request.method,
                    "path": request.path,
                    "status_code": getattr(response, "status_code", "n/a"),
                    "duration_ms": duration_ms,
                },
            )
            return response

        return wrapper


class CORSMiddleware:
    """Simple CORS helper that mirrors allowed origins."""

    def __init__(self, allowed_origins: Iterable[str] | None = None) -> None:
        self.allowed_origins = {origin.strip() for origin in allowed_origins or [] if origin.strip()}

    def apply(self, response: GatewayResponse, origin: Optional[str]) -> GatewayResponse:
        if origin and (not self.allowed_origins or origin in self.allowed_origins):
            response.headers.setdefault("Access-Control-Allow-Origin", origin)
            response.headers.setdefault("Vary", "Origin")
            response.headers.setdefault("Access-Control-Allow-Credentials", "true")
        return response

    def handle_preflight(self, request: GatewayRequest) -> Optional[GatewayResponse]:
        if request.method.upper() != "OPTIONS":
            return None
        response = GatewayResponse(status_code=204, body="", headers={})
        origin = request.origin
        self.apply(response, origin)
        response.headers.setdefault("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
        response.headers.setdefault("Access-Control-Allow-Headers", "Authorization,Content-Type")
        response.headers.setdefault("Access-Control-Max-Age", "600")
        return response


class SecurityHeadersMiddleware:
    """Attach a fixed set of security headers to every response."""

    def __init__(self, policies: Mapping[str, str] | None = None) -> None:
        default_headers = {
            "Strict-Transport-Security": "max-age=63072000; includeSubDomains",
            "X-Content-Type-Options": "nosniff",
            "X-Frame-Options": "DENY",
            "Referrer-Policy": "no-referrer",
            "Permissions-Policy": "geolocation=(), microphone=()",
            "Cross-Origin-Opener-Policy": "same-origin",
            "Cross-Origin-Resource-Policy": "same-origin",
        }
        self._headers = dict(default_headers)
        if policies:
            self._headers.update(policies)

    def apply(self, response: GatewayResponse) -> GatewayResponse:
        for key, value in self._headers.items():
            response.headers.setdefault(key, value)
        return response


class GatewayApp:
    """High-level gateway orchestrating middlewares and handler execution."""

    def __init__(
        self,
        handler: Callable[[GatewayRequest], GatewayResponse],
        *,
        rate_limits: Mapping[str, tuple[int, int]] | None = None,
        cors_allowed: Iterable[str] | None = None,
        header_policies: Mapping[str, str] | None = None,
        audit_logger: logging.Logger | None = None,
    ) -> None:
        self._handler = handler
        self._audit = AuditLoggingMiddleware(audit_logger).wrap
        self._cors = CORSMiddleware(cors_allowed)
        self._security_headers = SecurityHeadersMiddleware(header_policies)
        self._rate_limiter = TokenBucketRateLimiter()
        if rate_limits:
            for key, (hits, seconds) in rate_limits.items():
                self._rate_limiter.configure_bucket(
                    key,
                    capacity=hits,
                    refill_period=timedelta(seconds=seconds),
                )
        self._wrapped_handler = self._build_handler()

    def _build_handler(self) -> Callable[[GatewayRequest], GatewayResponse]:
        def apply_middlewares(request: GatewayRequest) -> GatewayResponse:
            origin = request.origin
            preflight = self._cors.handle_preflight(request)
            if preflight is not None:
                return self._security_headers.apply(preflight)

            rate_key = f"{request.method.upper()} {request.path}"
            self._rate_limiter.check(rate_key)
            response = self._handler(request)
            if self._cors:
                response = self._cors.apply(response, origin)
            response = self._security_headers.apply(response)
            return response

        return self._audit(apply_middlewares)

    def __call__(self, request: GatewayRequest) -> GatewayResponse:
        try:
            return self._wrapped_handler(request)
        except RateLimitExceeded as exc:
            retry_after = max(1, math.ceil(exc.retry_after))
            response = GatewayResponse(
                status_code=429,
                body={"error": "Rate limit exceeded", "retry_after": retry_after},
                headers={"Retry-After": str(retry_after)},
            )
            if self._cors:
                response = self._cors.apply(response, request.origin)
            return self._security_headers.apply(response)


__all__ = [
    "GatewayApp",
    "GatewayRequest",
    "GatewayResponse",
    "AuditLoggingMiddleware",
    "SecurityHeadersMiddleware",
    "CORSMiddleware",
]
