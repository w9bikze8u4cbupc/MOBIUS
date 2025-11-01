"""Top-level helpers to wire observability into the gateway."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Mapping, Optional, Union

from .audit import AuditLogger, AuditSigner, AuditStorage, JSONLStorage
from .metrics import (
    GatewayMetrics,
    PrometheusConfig,
    TracingConfig,
    TracingHelper,
    create_prometheus_wsgi_app,
    init_metrics,
    instrument_wsgi_app,
    record_cdn_event,
    record_digest_verification,
)

AuditStorageLike = Union[str, Path, AuditStorage]


@dataclass
class ObservabilityConfig:
    """Settings that drive the observability setup."""

    prometheus: PrometheusConfig
    tracing: TracingConfig
    audit_path: Optional[Path]
    audit_secret: Optional[str]


@dataclass
class ObservabilityResult:
    """Return type for :func:`configure_observability`."""

    app: Callable
    metrics_app: Optional[Callable]
    audit_logger: AuditLogger
    metrics: GatewayMetrics
    tracer: TracingHelper


def _env_bool(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.lower() not in {"", "0", "false", "no"}


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except ValueError:
        return default


def load_config_from_env() -> ObservabilityConfig:
    """Read the configuration from environment variables."""

    prometheus = PrometheusConfig(
        enabled=_env_bool("GATEWAY_PROMETHEUS_ENABLED", False),
        port=_env_int("GATEWAY_PROMETHEUS_PORT", 9464),
        service_name=os.getenv("GATEWAY_SERVICE", "mobius-gateway"),
        service_version=os.getenv("GATEWAY_VERSION", "dev"),
    )
    tracing = TracingConfig(
        enabled=_env_bool("GATEWAY_OTLP_ENABLED", False),
        endpoint=os.getenv("GATEWAY_OTLP_ENDPOINT"),
        service_name=prometheus.service_name,
        service_version=prometheus.service_version,
    )
    audit_path_env = os.getenv("GATEWAY_AUDIT_PATH")
    audit_path = Path(audit_path_env) if audit_path_env else None
    audit_secret = os.getenv("GATEWAY_AUDIT_HMAC_SECRET")
    return ObservabilityConfig(
        prometheus=prometheus,
        tracing=tracing,
        audit_path=audit_path,
        audit_secret=audit_secret,
    )


def _resolve_storage(storage: Optional[AuditStorageLike], audit_path: Optional[Union[str, Path]]) -> AuditStorage:
    if storage is None:
        if audit_path:
            path_obj = Path(audit_path)
            return JSONLStorage(path_obj if path_obj.suffix else path_obj / "audit.jsonl")
        return JSONLStorage(Path(".artifacts/audit/audit.jsonl"))
    if isinstance(storage, (str, Path)):
        path_obj = Path(storage)
        return JSONLStorage(path_obj if path_obj.suffix else path_obj / "audit.jsonl")
    if hasattr(storage, "append"):
        return storage  # type: ignore[return-value]
    raise TypeError("Unsupported audit storage type provided")


def configure_observability(
    app: Callable,
    *,
    storage: Optional[AuditStorageLike] = None,
    audit_path: Optional[Union[str, Path]] = None,
) -> ObservabilityResult:
    """Wrap the given WSGI application with observability middleware."""

    config = load_config_from_env()
    storage_obj = _resolve_storage(storage, audit_path or config.audit_path)
    signer = AuditSigner(secret=config.audit_secret.encode("utf-8")) if config.audit_secret else None
    audit_logger = AuditLogger(storage_obj, signer=signer)
    metrics = init_metrics(config.prometheus)
    tracer = TracingHelper(config.tracing)

    def _audit_callback(payload: Mapping[str, Any]) -> None:
        audit_logger.log_request(
            route=str(payload.get("route", "")),
            method=str(payload.get("method", "")),
            status_code=int(payload.get("status_code", 0)),
            content_length=int(payload.get("content_length", 0)),
            extra={"duration": payload.get("duration")},
        )

    instrumented_app = instrument_wsgi_app(app, metrics=metrics, tracer=tracer, audit_callback=_audit_callback)
    metrics_app = create_prometheus_wsgi_app(metrics)
    return ObservabilityResult(
        app=instrumented_app,
        metrics_app=metrics_app,
        audit_logger=audit_logger,
        metrics=metrics,
        tracer=tracer,
    )


__all__ = [
    "AuditLogger",
    "AuditSigner",
    "AuditStorage",
    "configure_observability",
    "load_config_from_env",
    "ObservabilityConfig",
    "ObservabilityResult",
    "record_cdn_event",
    "record_digest_verification",
]
