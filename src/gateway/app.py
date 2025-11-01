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
        """
        Return the value of the HTTP Origin header for this request.
        
        Returns:
            origin (Optional[str]): The value of the `Origin` header if present, `None` otherwise.
        """
        value = self.headers.get("Origin") if self.headers else None
        return value


@dataclass
class GatewayResponse:
    status_code: int
    body: Any
    headers: MutableMapping[str, str] = field(default_factory=dict)


class Middleware:
    def wrap(self, handler: Callable[[GatewayRequest], GatewayResponse]) -> Callable[[GatewayRequest], GatewayResponse]:
        """
        Return the provided handler unchanged as the default middleware behavior.
        
        Parameters:
            handler (Callable[[GatewayRequest], GatewayResponse]): The request handler to wrap.
        
        Returns:
            Callable[[GatewayRequest], GatewayResponse]: The same handler that was passed in, unmodified.
        """
        return handler


class AuditLoggingMiddleware(Middleware):
    def __init__(self, audit_logger: logging.Logger) -> None:
        """
        Initialize the middleware with the provided audit logger used to record gateway audit events.
        """
        self._audit_logger = audit_logger

    def wrap(
        self, handler: Callable[[GatewayRequest], GatewayResponse]
    ) -> Callable[[GatewayRequest], GatewayResponse]:
        """
        Wraps a request handler to emit audit log entries for the request, response, and any error.
        
        Parameters:
            handler (Callable[[GatewayRequest], GatewayResponse]): The handler to wrap.
        
        Returns:
            Callable[[GatewayRequest], GatewayResponse]: A handler that logs a "gateway.request" entry before invocation, logs "gateway.response" after a successful invocation, and logs "gateway.error" then re-raises any exception raised by the wrapped handler.
        """
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
        """
        Create a CORS middleware configured with an optional allowlist of origins.
        
        If `allowed_origins` is empty, the middleware treats origins as allowed (no origin restrictions). When provided, only requests whose Origin header matches an entry in `allowed_origins` are permitted.
        
        Parameters:
            allowed_origins (list[str] | None): Optional list of allowed origin strings; an empty list or None disables origin restrictions.
        """
        self.allowed_origins = allowed_origins or []

    def wrap(
        self, handler: Callable[[GatewayRequest], GatewayResponse]
    ) -> Callable[[GatewayRequest], GatewayResponse]:
        """
        Wraps a request handler with CORS enforcement and automatic CORS response headers.
        
        If the incoming request has an Origin header that is not in the middleware's allowed origins, the wrapped handler returns a 403 response with a JSON error body. If the origin is allowed or no allowed-origins list is configured, the wrapped handler delegates to the provided handler. When an origin is present and permitted, the response will include `Access-Control-Allow-Origin`, `Vary: Origin`, and `Access-Control-Allow-Credentials: true` headers (unless those headers are already set).
        
        Parameters:
            handler (Callable[[GatewayRequest], GatewayResponse]): The downstream request handler to wrap.
        
        Returns:
            Callable[[GatewayRequest], GatewayResponse]: A handler that enforces origin checks and injects CORS headers into responses.
        """
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
        """
        Initialize the security headers middleware with header policies to apply to responses.
        
        Parameters:
            policies (Mapping[str, str]): Mapping of header names to header values. The mapping is copied and stored internally; callers may mutate the original without affecting the middleware.
        """
        self.policies = dict(policies)

    def apply(self, response: GatewayResponse) -> GatewayResponse:
        """
        Apply configured security header policies to the given response without overwriting existing headers.
        
        Parameters:
            response (GatewayResponse): Response to modify.
        
        Returns:
            GatewayResponse: The same response instance with any headers from the configured policies added when not already present; existing headers are preserved.
        """
        for header, value in self.policies.items():
            response.headers.setdefault(header, value)
        return response

    def wrap(
        self, handler: Callable[[GatewayRequest], GatewayResponse]
    ) -> Callable[[GatewayRequest], GatewayResponse]:
        """
        Wraps a request handler so that configured security headers are applied to every response.
        
        Parameters:
            handler (Callable[[GatewayRequest], GatewayResponse]): Inner request handler to wrap.
        
        Returns:
            Callable[[GatewayRequest], GatewayResponse]: A handler that invokes the provided `handler`
            and returns its GatewayResponse after applying the middleware's security header policies.
        """
        def wrapped(request: GatewayRequest) -> GatewayResponse:
            response = handler(request)
            return self.apply(response)

        return wrapped


class GatewayApp:
    """Application wrapper that layers security middleware before business logic."""

    def __init__(self) -> None:
        """
        Initialize the GatewayApp and prepare its internal routing and security middleware.
        
        Sets up the internal routes mapping, installs a default SecurityHeadersMiddleware (empty policies), loads built-in routes, and builds the middleware chain used to wrap route handlers.
        """
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
        """
        Register a request handler for a specific HTTP method and path.
        
        Parameters:
            method (str): HTTP method for the route (e.g., "GET", "post"); case is normalized when stored.
            path (str): URL path for the route (e.g., "/health").
            handler (Callable[[GatewayRequest], GatewayResponse]): Handler invoked for matching requests.
        """
        key = f"{method.upper()}:{path}"
        self._routes[key] = handler

    def handle_request(self, request: GatewayRequest) -> GatewayResponse:
        """
        Dispatches a GatewayRequest to the matching registered handler through the middleware chain, handling missing routes and rate-limit violations, and returns the final response with security headers applied.
        
        Parameters:
            request (GatewayRequest): The incoming gateway request; its `endpoint_key` may be set or will be derived from the request method and path.
        
        Returns:
            GatewayResponse: The response produced by the matched handler after middleware processing. If no route matches, returns a 404 response with body `{"error": "Not found"}`. If a rate limit is exceeded, returns a 429 response with body `{"error": "Rate limit exceeded", "retry_after": <seconds>}` and a `Retry-After` header set to the retry-after seconds.
        """
        key = request.endpoint_key or f"{request.method.upper()}:{request.path}"
        handler = self._routes.get(key)
        if handler is None:
            def handler(_: GatewayRequest) -> GatewayResponse:
                """
                Produce a 404 Not Found response with an error payload.
                
                Returns:
                    GatewayResponse: A response with status_code 404 and body {"error": "Not found"}.
                """
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
        """
        Register built-in HTTP routes used by the gateway.
        
        Currently registers a health-check endpoint at GET /health that responds with status 200 and body {"status": "ok"}.
        """
        def health(_: GatewayRequest) -> GatewayResponse:
            return GatewayResponse(status_code=200, body={"status": "ok"})

        self.register_route("GET", "/health", health)

    def _build_middleware_chain(
        self,
    ) -> Callable[[Callable[[GatewayRequest], GatewayResponse]], Callable[[GatewayRequest], GatewayResponse]]:
        """
        Builds the application's middleware chain and configures global security headers from environment variables.
        
        Reads MOBIUS_CORS_ALLOWED_ORIGINS, MOBIUS_SECURITY_HEADERS, and MOBIUS_RATE_LIMITS (using sensible defaults when absent), sets self._security_headers accordingly, and instantiates the rate limiting, CORS, and audit middleware components.
        
        Returns:
            A callable that accepts a request handler and returns a new handler wrapped with rate limiting, CORS, and audit logging middleware, applied in that order.
        """
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
            """
            Compose the security middleware chain around a route handler.
            
            Parameters:
                handler (Callable[[GatewayRequest], GatewayResponse]): The final route handler to be executed after middleware.
            
            Returns:
                Callable[[GatewayRequest], GatewayResponse]: A new handler that applies rate limiting, CORS checks, and audit logging (in that order) before invoking the provided handler.
            """
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
    """
    Selects a client identifier for rate limiting and auditing.
    
    Parameters:
        request (GatewayRequest): Incoming gateway request; may include an explicit client_id or headers.
    
    Returns:
        str: The client identifier — `request.client_id` if present, otherwise the `X-Forwarded-For` header, then `Remote-Addr`, and `"global"` if none are available.
    """
    if request.client_id:
        return request.client_id
    return request.headers.get("X-Forwarded-For") or request.headers.get("Remote-Addr") or "global"


def _parse_csv(raw: str) -> list[str]:
    """
    Parse a comma-separated string into a list of trimmed, non-empty items.
    
    Parameters:
    	raw (str): Comma-separated input; empty or whitespace-only items are discarded.
    
    Returns:
    	items (list[str]): List of values with surrounding whitespace removed, excluding any empty items.
    """
    return [item.strip() for item in raw.split(",") if item.strip()]


def _parse_header_policies(raw: str) -> Dict[str, str]:
    """
    Parse a comma-separated list of HTTP header policies in the form "Header:Value" into a dictionary.
    
    Parameters:
        raw (str): A comma-separated string where each entry is expected to be "Header:Value". Entries may include surrounding whitespace.
    
    Returns:
        Dict[str, str]: Mapping of header names to their policy values. Malformed or empty entries (missing ":" or blank items) are ignored.
    """
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