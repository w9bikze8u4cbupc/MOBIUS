"""Telemetry helpers for MOBIUS services.

This module consolidates Prometheus and OpenTelemetry setup logic and provides
light-weight helpers that the gateway (WSGI) and any FastAPI applications can
use to register HTTP instrumentation and emit artifact verification metrics.
"""

from __future__ import annotations

import logging
import os
from importlib import import_module
from importlib.util import find_spec
from threading import Lock
from typing import Any, Callable, Dict, Iterable, Mapping, Optional

from prometheus_client import CollectorRegistry, Counter, CONTENT_TYPE_LATEST, generate_latest
from prometheus_client import make_wsgi_app, multiprocess

logger = logging.getLogger(__name__)

_PROM_REGISTRY = CollectorRegistry()
if "PROMETHEUS_MULTIPROC_DIR" in os.environ:
    multiprocess.MultiProcessCollector(_PROM_REGISTRY)

_DIGEST_COUNTER = Counter(
    "mobius_digest_verifications_total",
    "Count of digest verification events handled by the gateway.",
    ("status", "artifact_kind", "source"),
    registry=_PROM_REGISTRY,
)

_CDN_COUNTER = Counter(
    "mobius_cdn_fetch_total",
    "Count of CDN artifact fetch attempts handled by the gateway.",
    ("provider", "cache_status", "status_code"),
    registry=_PROM_REGISTRY,
)

_metrics_api = import_module("opentelemetry.metrics") if find_spec("opentelemetry.metrics") else None
_sdk_metrics = import_module("opentelemetry.sdk.metrics") if find_spec("opentelemetry.sdk.metrics") else None
_metrics_export = (
    import_module("opentelemetry.sdk.metrics.export") if find_spec("opentelemetry.sdk.metrics.export") else None
)
_prom_export = (
    import_module("opentelemetry.exporter.prometheus") if find_spec("opentelemetry.exporter.prometheus") else None
)
_otlp_export = (
    import_module("opentelemetry.exporter.otlp.proto.grpc.metric_exporter")
    if find_spec("opentelemetry.exporter.otlp.proto.grpc.metric_exporter")
    else None
)
_resources_module = import_module("opentelemetry.sdk.resources") if find_spec("opentelemetry.sdk.resources") else None
_fastapi_instrumentation = (
    import_module("opentelemetry.instrumentation.fastapi")
    if find_spec("opentelemetry.instrumentation.fastapi")
    else None
)
_wsgi_instrumentation = (
    import_module("opentelemetry.instrumentation.wsgi")
    if find_spec("opentelemetry.instrumentation.wsgi")
    else None
)

_METER_PROVIDER = None
_DIGEST_METRIC = None
_CDN_METRIC = None
_meter_lock = Lock()


def _build_meter_provider(
    *,
    service_name: str,
    enable_prometheus: bool,
    enable_otlp: bool,
    otlp_endpoint: Optional[str],
    otlp_headers: Optional[Mapping[str, str]],
    otlp_timeout: Optional[int],
    resource_attributes: Optional[Mapping[str, Any]],
):
    global _METER_PROVIDER, _DIGEST_METRIC, _CDN_METRIC

    if _METER_PROVIDER is not None or _metrics_api is None or _sdk_metrics is None:
        return _METER_PROVIDER

    resource = None
    if _resources_module is not None:
        Resource = getattr(_resources_module, "Resource")
        attributes: Dict[str, Any] = {"service.name": service_name}
        if resource_attributes:
            attributes.update(resource_attributes)
        resource = Resource.create(attributes)

    metric_readers: list[Any] = []

    if enable_prometheus and _prom_export is not None:
        PrometheusMetricReader = getattr(_prom_export, "PrometheusMetricReader")
        metric_readers.append(PrometheusMetricReader())
    if enable_otlp and _metrics_export is not None and _otlp_export is not None:
        PeriodicExportingMetricReader = getattr(_metrics_export, "PeriodicExportingMetricReader")
        OTLPMetricExporter = getattr(_otlp_export, "OTLPMetricExporter")
        exporter = OTLPMetricExporter(
            endpoint=otlp_endpoint,
            headers=dict(otlp_headers or {}),
            timeout=otlp_timeout,
        )
        metric_readers.append(PeriodicExportingMetricReader(exporter))

    if not metric_readers:
        logger.warning(
            "No OpenTelemetry metric readers configured; enable Prometheus or OTLP exporters to collect metrics."
        )
        return None

    MeterProvider = getattr(_sdk_metrics, "MeterProvider")
    _METER_PROVIDER = MeterProvider(resource=resource, metric_readers=metric_readers)
    set_meter_provider = getattr(_metrics_api, "set_meter_provider")
    set_meter_provider(_METER_PROVIDER)

    get_meter = getattr(_metrics_api, "get_meter")
    meter = get_meter(__name__)
    _DIGEST_METRIC = meter.create_counter(
        "mobius.digest.verifications",
        description="Number of digest verification events handled by the gateway.",
        unit="1",
    )
    _CDN_METRIC = meter.create_counter(
        "mobius.cdn.fetches",
        description="Number of CDN fetch attempts initiated by the gateway.",
        unit="1",
    )

    return _METER_PROVIDER


def init_metrics(
    *,
    service_name: str = "mobius-gateway",
    enable_prometheus: bool = True,
    enable_otlp: bool = False,
    otlp_endpoint: Optional[str] = None,
    otlp_headers: Optional[Mapping[str, str]] = None,
    otlp_timeout: Optional[int] = None,
    resource_attributes: Optional[Mapping[str, Any]] = None,
) -> Optional[Any]:
    """Initialise global metrics instrumentation.

    This function may be invoked multiple times; only the first call performs
    the expensive setup work. Subsequent invocations simply return the existing
    meter provider instance.
    """

    with _meter_lock:
        return _build_meter_provider(
            service_name=service_name,
            enable_prometheus=enable_prometheus,
            enable_otlp=enable_otlp,
            otlp_endpoint=otlp_endpoint,
            otlp_headers=otlp_headers,
            otlp_timeout=otlp_timeout,
            resource_attributes=resource_attributes,
        )


def create_prometheus_wsgi_app() -> Callable:
    """Return a WSGI app exposing the Prometheus metrics registry."""

    return make_wsgi_app(registry=_PROM_REGISTRY)


def generate_prometheus_latest() -> tuple[bytes, str]:
    """Generate the latest Prometheus metrics payload and content type."""

    payload = generate_latest(registry=_PROM_REGISTRY)
    return payload, CONTENT_TYPE_LATEST


def instrument_fastapi_app(app: Any, **kwargs: Any) -> Any:
    """Apply OpenTelemetry instrumentation to a FastAPI application."""

    if _fastapi_instrumentation is None:
        logger.warning("FastAPI instrumentation is unavailable; install opentelemetry-instrumentation-fastapi")
        return app

    FastAPIInstrumentor = getattr(_fastapi_instrumentation, "FastAPIInstrumentor")
    FastAPIInstrumentor.instrument_app(app, meter_provider=_METER_PROVIDER, **kwargs)
    return app


def instrument_wsgi_app(app: Callable[..., Iterable[bytes]], **kwargs: Any) -> Callable[..., Iterable[bytes]]:
    """Wrap a WSGI app with OpenTelemetry middleware if available."""

    if _wsgi_instrumentation is None:
        logger.warning("WSGI instrumentation is unavailable; install opentelemetry-instrumentation-wsgi")
        return app

    OpenTelemetryMiddleware = getattr(_wsgi_instrumentation, "OpenTelemetryMiddleware")
    return OpenTelemetryMiddleware(app, meter_provider=_METER_PROVIDER, **kwargs)


def record_digest_verification(
    *,
    status: str,
    artifact_kind: str,
    source: str,
    attributes: Optional[Mapping[str, Any]] = None,
) -> None:
    """Record a digest verification event to Prometheus and OpenTelemetry."""

    _DIGEST_COUNTER.labels(status=status, artifact_kind=artifact_kind, source=source).inc()
    if _DIGEST_METRIC is not None:
        metric_attributes = {"status": status, "artifact_kind": artifact_kind, "source": source}
        if attributes:
            metric_attributes.update(attributes)
        _DIGEST_METRIC.add(1, attributes=metric_attributes)


def record_cdn_event(
    *,
    provider: str,
    cache_status: str,
    status_code: str,
    attributes: Optional[Mapping[str, Any]] = None,
) -> None:
    """Record a CDN fetch attempt."""

    _CDN_COUNTER.labels(provider=provider, cache_status=cache_status, status_code=status_code).inc()
    if _CDN_METRIC is not None:
        metric_attributes = {
            "provider": provider,
            "cache_status": cache_status,
            "status_code": status_code,
        }
        if attributes:
            metric_attributes.update(attributes)
        _CDN_METRIC.add(1, attributes=metric_attributes)


__all__ = [
    "init_metrics",
    "create_prometheus_wsgi_app",
    "generate_prometheus_latest",
    "instrument_fastapi_app",
    "instrument_wsgi_app",
    "record_digest_verification",
    "record_cdn_event",
]
