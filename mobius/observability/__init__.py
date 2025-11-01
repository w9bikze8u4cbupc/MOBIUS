"""Public observability helpers for MOBIUS services."""

from __future__ import annotations

import logging
from pathlib import Path
from time import perf_counter
from typing import Any, Callable, Iterable, Iterator, Mapping, Optional, Union

from importlib import import_module
from importlib.util import find_spec

from .audit import AuditLogger, AuditStorage, DigestSigner, JSONLStorage, build_default_storage
from .metrics import (
    create_prometheus_wsgi_app,
    generate_prometheus_latest,
    init_metrics,
    instrument_fastapi_app,
    instrument_wsgi_app,
    record_cdn_event,
    record_digest_verification,
)

logger = logging.getLogger(__name__)

_starlette_base = import_module("starlette.middleware.base") if find_spec("starlette.middleware.base") else None
if _starlette_base is not None:
    BaseHTTPMiddleware = getattr(_starlette_base, "BaseHTTPMiddleware")
else:
    BaseHTTPMiddleware = None

AuditStorageLike = Union[AuditStorage, Path, str]


def _resolve_storage(storage: Optional[AuditStorageLike], audit_path: Optional[Union[str, Path]]) -> AuditStorage:
    """
    Resolve an AuditStorage instance from a flexible storage specification.
    
    Parameters:
        storage: Either an existing AuditStorage-like object, a filesystem path (str or Path) to a JSONL storage file, or None to use the default storage.
        audit_path: Optional path used to build the default storage when `storage` is None.
    
    Returns:
        An AuditStorage instance corresponding to the provided specification.
    
    Raises:
        TypeError: If `storage` is not None, not a str/Path, and does not expose an `append` method.
    """
    if storage is None:
        return build_default_storage(audit_path)
    if isinstance(storage, (str, Path)):
        return JSONLStorage(storage)
    if hasattr(storage, "append"):
        return storage  # type: ignore[return-value]
    raise TypeError("Unsupported audit storage type provided")


def _build_audit_logger(
    *,
    storage: Optional[AuditStorageLike],
    audit_path: Optional[Union[str, Path]],
    signer_secret: Optional[str],
) -> AuditLogger:
    """
    Builds and returns an AuditLogger configured with the provided storage and optional signer.
    
    Parameters:
        storage (Optional[AuditStorageLike]): An existing AuditStorage instance, or a Path/str pointing to a storage location. If None, a default storage is created using audit_path.
        audit_path (Optional[Union[str, Path]]): Filesystem path used to construct a default JSONL storage when storage is None.
        signer_secret (Optional[str]): Secret used to create a DigestSigner for signing audit entries; if None, no signer is attached.
    
    Returns:
        AuditLogger: An AuditLogger wired to the resolved storage and optional signer; it is configured to emit digest verification and CDN event callbacks.
    """
    resolved_storage = _resolve_storage(storage, audit_path)
    signer = DigestSigner(signer_secret) if signer_secret else None

    def _on_digest(record: Mapping[str, Any]) -> None:
        """
        Emit a digest verification audit record derived from a mapping of fields.
        
        Parameters:
            record (Mapping[str, Any]): Mapping containing audit fields. Recognized keys:
                - "artifact_id": optional identifier included as `attributes["artifact_id"]` if present.
                - "status": verification status; defaults to `"unknown"` if missing.
                - "artifact_kind": artifact type; defaults to `"unknown"` if missing.
                - "source": event source; defaults to `"gateway"` if missing.
        """
        artifact_id = record.get("artifact_id")
        attributes = {"artifact_id": artifact_id} if artifact_id else None
        record_digest_verification(
            status=str(record.get("status", "unknown")),
            artifact_kind=str(record.get("artifact_kind", "unknown")),
            source=str(record.get("source", "gateway")),
            attributes=attributes,
        )

    def _on_cdn(record: Mapping[str, Any]) -> None:
        """
        Emit a CDN transfer audit event extracted from the given record.
        
        Parameters:
            record (Mapping[str, Any]): Mapping containing CDN event fields; expected keys include
                "provider", "cache_status", "status_code", and optionally "artifact_id". When
                present, "artifact_id" is included as an attribute on the emitted event.
        """
        artifact_id = record.get("artifact_id")
        attributes = {"artifact_id": artifact_id} if artifact_id else None
        record_cdn_event(
            provider=str(record.get("provider", "unknown")),
            cache_status=str(record.get("cache_status", "unknown")),
            status_code=str(record.get("status_code", "0")),
            attributes=attributes,
        )

    return AuditLogger(
        storage=resolved_storage,
        signer=signer,
        on_digest=_on_digest,
        on_cdn=_on_cdn,
    )


class ObservabilityMiddleware:
    """WSGI middleware emitting audit logs and telemetry for each request."""

    def __init__(
        self,
        app: Callable[..., Iterable[bytes]],
        *,
        audit_logger: AuditLogger,
    ) -> None:
        """
        Wraps a WSGI application with request instrumentation and stores the audit logger for emitting audit records.
        
        Parameters:
            app (Callable[..., Iterable[bytes]]): A WSGI application callable (expects `environ` and `start_response`) that yields response byte chunks.
            audit_logger (AuditLogger): Audit logger used to record request-level and artifact audit events.
        """
        self._app = instrument_wsgi_app(app)
        self.audit_logger = audit_logger

    def __call__(self, environ: Mapping[str, Any], start_response: Callable[..., Any]):  # type: ignore[override]
        """
        WSGI middleware entry point that delegates the request to the wrapped app, captures the response status and duration, and records a request audit after the response completes.
        
        Parameters:
            environ (Mapping[str, Any]): WSGI environment mapping for the request.
            start_response (Callable[..., Any]): WSGI start_response callable.
        
        Returns:
            Iterator[bytes]: An iterator that yields response body chunks as bytes.
        
        Notes:
            The audit record is written after the response iterable is exhausted. Failures while writing the audit are logged and do not affect the response.
        """
        start = perf_counter()
        status_holder = {"code": 500}

        def _start_response(status: str, headers: Iterable[tuple[str, str]], exc_info=None):  # type: ignore[override]
            """
            Wraps the original WSGI start_response to capture and store the numeric HTTP status code.
            
            Parses the numeric status code from the provided WSGI `status` string and, if successful, stores it in `status_holder["code"]`. Delegates to the original `start_response` and returns its result.
            
            Parameters:
                status (str): The WSGI status string, e.g. "200 OK".
                headers (Iterable[tuple[str, str]]): The response headers.
                exc_info (Optional[tuple]): Optional exception info passed through to the original `start_response`.
            
            Returns:
                The value returned by the wrapped `start_response` call.
            """
            try:
                status_holder["code"] = int(status.split(" ", 1)[0])
            except (ValueError, IndexError):
                logger.debug("Unable to parse status code from %s", status)
            return start_response(status, headers, exc_info)

        iterable = self._app(environ, _start_response)

        def _iterate() -> Iterator[bytes]:
            """
            Yield response body chunks produced by the wrapped WSGI application and, after iteration completes, close the underlying iterable (if supported) and write a request audit record.
            
            This generator measures the request duration in milliseconds, attempts to log a request audit via self.audit_logger with method, path, status_code, duration_ms, request_id, client_ip, and user_agent, and suppresses any exceptions raised during auditing so they do not affect the response flow.
            
            Returns:
                Iterator[bytes]: An iterator that yields response body chunks as bytes.
            """
            nonlocal iterable
            try:
                for chunk in iterable:
                    yield chunk
            finally:
                close = getattr(iterable, "close", None)
                if callable(close):
                    close()
                duration_ms = int((perf_counter() - start) * 1000)
                try:
                    self.audit_logger.log_request(
                        method=str(environ.get("REQUEST_METHOD", "UNKNOWN")),
                        path=str(environ.get("PATH_INFO", "")),
                        status_code=int(status_holder.get("code", 500)),
                        duration_ms=duration_ms,
                        request_id=environ.get("HTTP_X_REQUEST_ID"),
                        client_ip=environ.get("REMOTE_ADDR"),
                        user_agent=environ.get("HTTP_USER_AGENT"),
                    )
                except Exception:  # pragma: no cover - auditing failures should not interrupt responses
                    logger.exception("Failed to write request audit record")

        return _iterate()

    def log_digest_verification(
        self,
        *,
        artifact_id: str,
        expected_digest: str,
        observed_digest: str,
        status: str,
        source: str,
        artifact_kind: str,
        extra: Optional[Mapping[str, Any]] = None,
    ) -> None:
        """
        Emit an audit record for a digest verification event.
        
        Parameters:
            artifact_id (str): Identifier of the artifact being verified.
            expected_digest (str): The expected digest value for the artifact.
            observed_digest (str): The digest value observed during verification.
            status (str): Outcome of the verification (for example, 'success' or 'failure').
            source (str): Origin or component that performed the verification.
            artifact_kind (str): Kind or category of the artifact (for example, 'package' or 'image').
            extra (Optional[Mapping[str, Any]]): Optional additional attributes to attach to the audit record.
        """
        self.audit_logger.log_digest_verification(
            artifact_id=artifact_id,
            expected_digest=expected_digest,
            observed_digest=observed_digest,
            status=status,
            source=source,
            artifact_kind=artifact_kind,
            extra=extra,
        )

    def log_cdn_transfer(
        self,
        *,
        artifact_id: str,
        provider: str,
        cache_status: str,
        status_code: int,
        extra: Optional[Mapping[str, Any]] = None,
    ) -> None:
        """
        Emit an audit record describing a CDN transfer for a specific artifact.
        
        Parameters:
            artifact_id (str): Identifier of the artifact involved in the transfer.
            provider (str): CDN provider name or identifier.
            cache_status (str): Cache outcome reported by the CDN (for example "HIT", "MISS", "BYPASS").
            status_code (int): HTTP status code returned by the CDN for the transfer request.
            extra (Optional[Mapping[str, Any]]): Optional additional attributes to include with the audit record.
        """
        self.audit_logger.log_cdn_transfer(
            artifact_id=artifact_id,
            provider=provider,
            cache_status=cache_status,
            status_code=status_code,
            extra=extra,
        )


if BaseHTTPMiddleware is not None:

    class FastAPIAuditMiddleware(BaseHTTPMiddleware):
        """Starlette middleware wiring audit logging for FastAPI apps."""

        def __init__(self, app: Any, audit_logger: AuditLogger):
            """
            Initialize the middleware with the underlying ASGI/Starlette app and an AuditLogger used to record request audits.
            
            Parameters:
                app: The ASGI or Starlette application instance to wrap.
                audit_logger: AuditLogger instance used to write request audit records.
            """
            super().__init__(app)
            self.audit_logger = audit_logger

        async def dispatch(self, request, call_next):  # type: ignore[override]
            """
            Record the incoming FastAPI request for auditing, then return the downstream response.
            
            Measures request duration in milliseconds and writes a request audit record containing method, path, status_code, duration_ms, request_id, client_ip, and user_agent. Failures during auditing are caught and logged; the original response is returned unchanged.
            
            Parameters:
                request: The incoming Starlette/FastAPI request object.
                call_next: Callable that when awaited produces the response from the next ASGI handler.
            
            Returns:
                The response produced by `call_next`.
            """
            start = perf_counter()
            response = await call_next(request)
            duration_ms = int((perf_counter() - start) * 1000)
            try:
                client_ip = request.client.host if getattr(request, "client", None) else None
                self.audit_logger.log_request(
                    method=request.method,
                    path=str(request.url.path),
                    status_code=response.status_code,
                    duration_ms=duration_ms,
                    request_id=request.headers.get("x-request-id"),
                    client_ip=client_ip,
                    user_agent=request.headers.get("user-agent"),
                )
            except Exception:  # pragma: no cover - telemetry must not break responses
                logger.exception("Failed to write FastAPI request audit record")
            return response

else:
    FastAPIAuditMiddleware = None


def create_observability_middleware(
    app: Callable[..., Iterable[bytes]],
    *,
    service_name: str = "mobius-gateway",
    audit_storage: Optional[AuditStorageLike] = None,
    audit_path: Optional[Union[str, Path]] = None,
    signer_secret: Optional[str] = None,
    enable_prometheus: bool = True,
    enable_otlp: bool = False,
    otlp_endpoint: Optional[str] = None,
    otlp_headers: Optional[Mapping[str, str]] = None,
    otlp_timeout: Optional[int] = None,
    resource_attributes: Optional[Mapping[str, Any]] = None,
) -> ObservabilityMiddleware:
    """
    Create and return a WSGI ObservabilityMiddleware configured for the given app.
    
    Initializes telemetry (Prometheus/OTLP) according to the provided options and builds an AuditLogger used by the middleware.
    
    Parameters:
        app (Callable[..., Iterable[bytes]]): The WSGI application to wrap.
        service_name (str): Service name used for telemetry and metrics.
        audit_storage (Optional[AuditStorageLike]): Storage instance or path (or None to use default) for audit records.
        audit_path (Optional[Union[str, Path]]): Filesystem path used to build a default audit storage when `audit_storage` is None.
        signer_secret (Optional[str]): Secret used to create a DigestSigner for audit records; if None, signing is disabled.
        enable_prometheus (bool): Whether to enable Prometheus metrics exposition.
        enable_otlp (bool): Whether to enable OTLP export for traces/metrics.
        otlp_endpoint (Optional[str]): OTLP collector endpoint URL when OTLP is enabled.
        otlp_headers (Optional[Mapping[str, str]]): Additional headers to include when communicating with the OTLP endpoint.
        otlp_timeout (Optional[int]): Timeout (seconds) for OTLP exporter requests.
        resource_attributes (Optional[Mapping[str, Any]]): Additional resource attributes to attach to telemetry.
    
    Returns:
        ObservabilityMiddleware: A middleware instance that wraps the provided WSGI app and emits audit logs and telemetry.
    """

    init_metrics(
        service_name=service_name,
        enable_prometheus=enable_prometheus,
        enable_otlp=enable_otlp,
        otlp_endpoint=otlp_endpoint,
        otlp_headers=otlp_headers,
        otlp_timeout=otlp_timeout,
        resource_attributes=resource_attributes,
    )

    audit_logger = _build_audit_logger(
        storage=audit_storage,
        audit_path=audit_path,
        signer_secret=signer_secret,
    )

    return ObservabilityMiddleware(app, audit_logger=audit_logger)


def configure_fastapi_observability(
    app: Any,
    *,
    service_name: str = "mobius-gateway",
    audit_storage: Optional[AuditStorageLike] = None,
    audit_path: Optional[Union[str, Path]] = None,
    signer_secret: Optional[str] = None,
    enable_prometheus: bool = True,
    enable_otlp: bool = False,
    otlp_endpoint: Optional[str] = None,
    otlp_headers: Optional[Mapping[str, str]] = None,
    otlp_timeout: Optional[int] = None,
    resource_attributes: Optional[Mapping[str, Any]] = None,
) -> AuditLogger:
    """
    Configure observability for a FastAPI app and return an AuditLogger for audit events.
    
    Parameters:
        app (Any): FastAPI application instance to instrument.
        service_name (str): Logical service name used for telemetry and metrics.
        audit_storage (Optional[AuditStorageLike]): Storage backend, path, or storage instance for audit records.
        audit_path (Optional[Union[str, Path]]): Filesystem path used to build a default audit storage when `audit_storage` is not provided.
        signer_secret (Optional[str]): Secret used to create a DigestSigner for signed audit records.
        enable_prometheus (bool): Whether to enable Prometheus metrics exposition.
        enable_otlp (bool): Whether to enable OTLP (OpenTelemetry) export.
        otlp_endpoint (Optional[str]): OTLP collector endpoint URL when OTLP is enabled.
        otlp_headers (Optional[Mapping[str, str]]): Additional headers to send to the OTLP endpoint.
        otlp_timeout (Optional[int]): Timeout in seconds for OTLP export requests.
        resource_attributes (Optional[Mapping[str, Any]]): Additional resource attributes attached to telemetry.
    
    Returns:
        AuditLogger: Configured audit logger used by the application.
    """

    init_metrics(
        service_name=service_name,
        enable_prometheus=enable_prometheus,
        enable_otlp=enable_otlp,
        otlp_endpoint=otlp_endpoint,
        otlp_headers=otlp_headers,
        otlp_timeout=otlp_timeout,
        resource_attributes=resource_attributes,
    )

    audit_logger = _build_audit_logger(
        storage=audit_storage,
        audit_path=audit_path,
        signer_secret=signer_secret,
    )

    instrument_fastapi_app(app)
    if FastAPIAuditMiddleware is not None:
        app.add_middleware(FastAPIAuditMiddleware, audit_logger=audit_logger)
    else:
        logger.warning(
            "Starlette BaseHTTPMiddleware not available; request audits for FastAPI will be disabled."
        )

    return audit_logger


__all__ = [
    "AuditLogger",
    "AuditStorage",
    "DigestSigner",
    "JSONLStorage",
    "ObservabilityMiddleware",
    "FastAPIAuditMiddleware",
    "create_observability_middleware",
    "configure_fastapi_observability",
    "create_prometheus_wsgi_app",
    "generate_prometheus_latest",
]