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
    resolved_storage = _resolve_storage(storage, audit_path)
    signer = DigestSigner(signer_secret) if signer_secret else None

    def _on_digest(record: Mapping[str, Any]) -> None:
        artifact_id = record.get("artifact_id")
        attributes = {"artifact_id": artifact_id} if artifact_id else None
        record_digest_verification(
            status=str(record.get("status", "unknown")),
            artifact_kind=str(record.get("artifact_kind", "unknown")),
            source=str(record.get("source", "gateway")),
            attributes=attributes,
        )

    def _on_cdn(record: Mapping[str, Any]) -> None:
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
        self._app = instrument_wsgi_app(app)
        self.audit_logger = audit_logger

    def __call__(self, environ: Mapping[str, Any], start_response: Callable[..., Any]):  # type: ignore[override]
        start = perf_counter()
        status_holder = {"code": 500}

        def _start_response(status: str, headers: Iterable[tuple[str, str]], exc_info=None):  # type: ignore[override]
            try:
                status_holder["code"] = int(status.split(" ", 1)[0])
            except (ValueError, IndexError):
                logger.debug("Unable to parse status code from %s", status)
            return start_response(status, headers, exc_info)

        iterable = self._app(environ, _start_response)

        def _iterate() -> Iterator[bytes]:
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
            super().__init__(app)
            self.audit_logger = audit_logger

        async def dispatch(self, request, call_next):  # type: ignore[override]
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
    """Instantiate the WSGI observability middleware for the given app."""

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
    """Configure FastAPI observability instrumentation and return the audit logger."""

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
