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
    """
    Configure and register an OpenTelemetry MeterProvider and create internal metric counters.
    
    Builds a Resource with `service.name` (and any `resource_attributes`), attaches the requested metric readers (Prometheus and/or OTLP), registers the provider as the global meter provider, and creates the internal counters used by this module.
    
    Parameters:
        service_name (str): Service name to set on the created resource.
        enable_prometheus (bool): If true, add a Prometheus metric reader when available.
        enable_otlp (bool): If true, add a PeriodicExportingMetricReader with an OTLP exporter when available.
        otlp_endpoint (Optional[str]): OTLP exporter endpoint URL; passed to the OTLP exporter if enabled.
        otlp_headers (Optional[Mapping[str, str]]): Headers to send with OTLP exporter requests.
        otlp_timeout (Optional[int]): Timeout in seconds for the OTLP exporter.
        resource_attributes (Optional[Mapping[str, Any]]): Additional attributes to include on the created Resource.
    
    Returns:
        The configured MeterProvider instance if metric readers were configured and telemetry libraries are available, `None` otherwise.
    """
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
    """
    Initialize global metrics instrumentation and configure Prometheus and/or OTLP exporters.
    
    Only the first call performs setup; subsequent calls return the already-configured meter provider. The function may enable a Prometheus metric reader, an OTLP exporter, or both depending on the enable flags and available libraries.
    
    Parameters:
        service_name (str): Service name to set on the telemetry resource.
        enable_prometheus (bool): If true, attempt to add a Prometheus metric reader.
        enable_otlp (bool): If true, attempt to add an OTLP metric exporter and periodic reader.
        otlp_endpoint (Optional[str]): OTLP collector endpoint to use when OTLP is enabled.
        otlp_headers (Optional[Mapping[str, str]]): Headers to include on OTLP exporter requests.
        otlp_timeout (Optional[int]): Timeout in seconds for OTLP exporter requests.
        resource_attributes (Optional[Mapping[str, Any]]): Additional attributes to add to the telemetry resource.
    
    Returns:
        The configured OpenTelemetry MeterProvider instance, or `None` if no meter provider could be created (for example when required OT libraries or exporters are unavailable).
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
    """
    Create a WSGI application that serves the Prometheus metrics registry.
    
    Returns:
        wsgi_app (Callable): A WSGI application that serves metrics from the module's Prometheus registry.
    """

    return make_wsgi_app(registry=_PROM_REGISTRY)


def generate_prometheus_latest() -> tuple[bytes, str]:
    """
    Get the current Prometheus metrics payload and its content type.
    
    Returns:
        payload (bytes): Prometheus text-format metrics payload generated from the module registry.
        content_type (str): HTTP content type for the payload (`CONTENT_TYPE_LATEST`).
    """

    payload = generate_latest(registry=_PROM_REGISTRY)
    return payload, CONTENT_TYPE_LATEST


def instrument_fastapi_app(app: Any, **kwargs: Any) -> Any:
    """
    Instrument a FastAPI application with OpenTelemetry if the FastAPI instrumentation package is available.
    
    If the OpenTelemetry FastAPI instrumentation is present, applies instrumentation via the module's FastAPIInstrumentor using the module-level meter provider; otherwise returns the application unchanged.
    
    Parameters:
        app: The FastAPI application instance to instrument.
        **kwargs: Additional keyword arguments forwarded to FastAPIInstrumentor.instrument_app().
    
    Returns:
        The same FastAPI application instance, instrumented when instrumentation was applied, otherwise unchanged.
    """

    if _fastapi_instrumentation is None:
        logger.warning("FastAPI instrumentation is unavailable; install opentelemetry-instrumentation-fastapi")
        return app

    FastAPIInstrumentor = getattr(_fastapi_instrumentation, "FastAPIInstrumentor")
    FastAPIInstrumentor.instrument_app(app, meter_provider=_METER_PROVIDER, **kwargs)
    return app


def instrument_wsgi_app(app: Callable[..., Iterable[bytes]], **kwargs: Any) -> Callable[..., Iterable[bytes]]:
    """
    Instrument a WSGI application with OpenTelemetry middleware when the instrumentation package is available.
    
    If the OpenTelemetry WSGI instrumentation is not available, the original `app` is returned and a warning is logged.
    
    Parameters:
        app (Callable[..., Iterable[bytes]]): A WSGI application callable to be wrapped.
        **kwargs: Additional keyword arguments forwarded to the OpenTelemetry middleware constructor.
    
    Returns:
        Callable[..., Iterable[bytes]]: The instrumented WSGI application callable, or the original `app` if instrumentation is unavailable.
    """

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
    """
    Record a digest verification event in configured telemetry backends.
    
    Increments the Prometheus digest verification counter with labels `status`, `artifact_kind`, and `source`. If an OpenTelemetry meter has been initialized, also emits a corresponding metric with the same attributes; any keys in `attributes` are merged into the metric attributes.
    
    Parameters:
        status (str): Verification outcome label (e.g., `"success"`, `"failure"`).
        artifact_kind (str): Kind of artifact being verified (e.g., `"manifest"`, `"layer"`).
        source (str): Source of the artifact (e.g., CDN or registry identifier).
        attributes (Optional[Mapping[str, Any]]): Additional attribute key/value pairs to attach to the OpenTelemetry metric.
    """

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
    """
    Record a CDN fetch attempt metric with labels and optional additional attributes.
    
    Increments the internal Prometheus counter for CDN fetches and, if an OpenTelemetry meter is configured, emits a corresponding OpenTelemetry metric with the same label attributes merged with any provided extra attributes.
    
    Parameters:
        provider (str): Identifier of the CDN provider (e.g., "cloudfront", "fastly").
        cache_status (str): Cache outcome (e.g., "HIT", "MISS", "BYPASS").
        status_code (str): HTTP status code returned by the CDN (as a string).
        attributes (Optional[Mapping[str, Any]]): Additional attribute key/value pairs to attach to the emitted OpenTelemetry metric; these are merged with the required provider/cache_status/status_code attributes.
    """

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