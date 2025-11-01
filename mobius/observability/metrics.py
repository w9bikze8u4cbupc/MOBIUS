"""Prometheus and OpenTelemetry helpers for the gateway."""

from __future__ import annotations

import contextlib
import logging
import os
import time
from dataclasses import dataclass
from typing import Any, Callable, Dict, Iterable, Mapping, Optional

logger = logging.getLogger(__name__)

try:  # pragma: no cover - optional dependency
    from prometheus_client import CollectorRegistry, Counter, Histogram, multiprocess
    from prometheus_client import CONTENT_TYPE_LATEST, make_wsgi_app
except ImportError:  # pragma: no cover - fallback when dependency missing
    CollectorRegistry = None  # type: ignore[assignment]
    Counter = None  # type: ignore[assignment]
    Histogram = None  # type: ignore[assignment]
    multiprocess = None  # type: ignore[assignment]
    CONTENT_TYPE_LATEST = "text/plain; charset=utf-8"

    def make_wsgi_app(*_: Any, **__: Any) -> Callable:
        def _app(environ: Mapping[str, Any], start_response: Callable) -> Iterable[bytes]:
            start_response("200 OK", [("Content-Type", CONTENT_TYPE_LATEST)])
            return [b""]

        return _app

try:  # pragma: no cover - optional dependency
    from opentelemetry import trace
    from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
    from opentelemetry.sdk.resources import Resource
    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk.trace.export import BatchSpanProcessor
except ImportError:  # pragma: no cover - fallback when dependency missing
    trace = None  # type: ignore[assignment]
    OTLPSpanExporter = None  # type: ignore[assignment]
    Resource = None  # type: ignore[assignment]
    TracerProvider = None  # type: ignore[assignment]
    BatchSpanProcessor = None  # type: ignore[assignment]


class _NullMetric:
    """No-op metric that satisfies the Prometheus metric API."""

    def labels(self, *args: Any, **kwargs: Any) -> "_NullMetric":  # noqa: D401 - delegated docstring
        return self

    def inc(self, amount: float = 1.0) -> None:
        return None

    def observe(self, value: float) -> None:
        return None


@dataclass
class GatewayMetrics:
    """Container for gateway metrics objects."""

    request_counter: Any
    request_duration: Any
    request_size: Any
    digest_counter: Any
    cdn_counter: Any
    service_name: str
    service_version: str

    def observe_request(
        self,
        *,
        route: str,
        method: str,
        status_code: int,
        duration: float,
        content_length: int,
    ) -> None:
        labels = {
            "route": route,
            "method": method,
            "status": str(status_code),
            "service": self.service_name,
            "version": self.service_version,
        }
        self.request_counter.labels(**labels).inc()
        self.request_duration.labels(**labels).observe(duration)
        self.request_size.labels(route=route, service=self.service_name, version=self.service_version).inc(content_length)

    def record_digest(self, *, result: str) -> None:
        self.digest_counter.labels(result=result, service=self.service_name, version=self.service_version).inc()

    def record_cdn(self, *, provider: str, cache_status: str, status_code: int) -> None:
        self.cdn_counter.labels(
            provider=provider,
            cache_status=cache_status,
            status=str(status_code),
            service=self.service_name,
            version=self.service_version,
        ).inc()


@dataclass
class TracingConfig:
    """Configuration describing the tracing setup."""

    enabled: bool
    endpoint: Optional[str]
    service_name: str
    service_version: str


@dataclass
class PrometheusConfig:
    """Configuration describing Prometheus setup for the gateway."""

    enabled: bool
    port: int
    service_name: str
    service_version: str


def _build_registry() -> Optional[CollectorRegistry]:
    if CollectorRegistry is None:
        return None
    multiproc_dir = os.getenv("PROMETHEUS_MULTIPROC_DIR")
    if multiprocess and multiproc_dir:
        registry = CollectorRegistry()
        multiprocess.MultiProcessCollector(registry)
        return registry
    return CollectorRegistry() if CollectorRegistry else None


def init_metrics(config: PrometheusConfig) -> GatewayMetrics:
    """Create gateway metrics (no-op objects when Prometheus is unavailable)."""

    if not config.enabled or Counter is None or Histogram is None:
        null = _NullMetric()
        return GatewayMetrics(
            null,
            null,
            null,
            null,
            null,
            service_name=config.service_name,
            service_version=config.service_version,
        )

    registry = _build_registry()
    request_counter = Counter(
        "gateway_requests_total",
        "Total number of requests handled by the gateway.",
        ["route", "method", "status", "service", "version"],
        registry=registry,
    )
    request_duration = Histogram(
        "gateway_request_duration_seconds",
        "Distribution of request durations for the gateway.",
        ["route", "method", "status", "service", "version"],
        registry=registry,
    )
    request_size = Counter(
        "gateway_artifact_bytes_total",
        "Total bytes transferred per route.",
        ["route", "service", "version"],
        registry=registry,
    )
    digest_counter = Counter(
        "gateway_digest_verifications_total",
        "Total digest verification attempts.",
        ["result", "service", "version"],
        registry=registry,
    )
    cdn_counter = Counter(
        "gateway_cdn_events_total",
        "Total CDN transfer events emitted by the gateway.",
        ["provider", "cache_status", "status", "service", "version"],
        registry=registry,
    )

    metrics = GatewayMetrics(
        request_counter=request_counter,
        request_duration=request_duration,
        request_size=request_size,
        digest_counter=digest_counter,
        cdn_counter=cdn_counter,
        service_name=config.service_name,
        service_version=config.service_version,
    )
    metrics.registry = registry  # type: ignore[attr-defined]
    return metrics


def create_prometheus_wsgi_app(metrics: GatewayMetrics) -> Optional[Callable]:
    """Return the WSGI metrics endpoint if Prometheus is active."""

    registry = getattr(metrics, "registry", None)
    if registry is None:
        return None
    return make_wsgi_app(registry)


class TracingHelper:
    """Adapter around OpenTelemetry tracer with graceful fallbacks."""

    def __init__(self, config: TracingConfig) -> None:
        self._config = config
        self._tracer = None
        if config.enabled and trace and OTLPSpanExporter and TracerProvider and Resource and BatchSpanProcessor:
            resource = Resource.create({"service.name": config.service_name, "service.version": config.service_version})
            provider = TracerProvider(resource=resource)
            exporter_kwargs: Dict[str, Any] = {"insecure": True}
            if config.endpoint:
                exporter_kwargs["endpoint"] = config.endpoint
            exporter = OTLPSpanExporter(**exporter_kwargs)
            provider.add_span_processor(BatchSpanProcessor(exporter))
            trace.set_tracer_provider(provider)
            self._tracer = trace.get_tracer(__name__)
        elif config.enabled:
            logger.warning("OpenTelemetry requested but required packages are missing")

    @contextlib.contextmanager
    def span(self, name: str, **attributes: Any):
        if not self._tracer:
            yield None
            return
        with self._tracer.start_as_current_span(name) as span:  # type: ignore[attr-defined]
            for key, value in attributes.items():
                span.set_attribute(key, value)
            yield span


def instrument_wsgi_app(
    app: Callable,
    *,
    metrics: GatewayMetrics,
    tracer: TracingHelper,
    audit_callback: Callable[[Dict[str, Any]], None],
) -> Callable:
    """Wrap a WSGI application with observability instrumentation."""

    def _app(environ: Mapping[str, Any], start_response: Callable) -> Iterable[bytes]:
        path = environ.get("PATH_INFO", "")
        method = environ.get("REQUEST_METHOD", "GET")
        start_time = time.perf_counter()
        status_headers: Dict[str, Any] = {}

        def _start_response(status: str, response_headers: Iterable[tuple[str, str]], exc_info: Any = None) -> Callable:
            status_headers["status"] = int(status.split(" ", 1)[0])
            status_headers["headers"] = list(response_headers)
            return start_response(status, response_headers, exc_info)

        with tracer.span("gateway.request", route=path, method=method):
            body = list(app(environ, _start_response))

        duration = time.perf_counter() - start_time
        status_code = status_headers.get("status", 500)
        content_length = sum(len(chunk) for chunk in body)
        metrics.observe_request(route=path, method=method, status_code=status_code, duration=duration, content_length=content_length)
        audit_callback(
            {
                "route": path,
                "method": method,
                "status_code": status_code,
                "content_length": content_length,
                "duration": duration,
            }
        )
        return body

    return _app


def record_digest_verification(metrics: GatewayMetrics, *, result: str) -> None:
    metrics.record_digest(result=result)


def record_cdn_event(metrics: GatewayMetrics, *, provider: str, cache_status: str, status_code: int) -> None:
    metrics.record_cdn(provider=provider, cache_status=cache_status, status_code=status_code)


__all__ = [
    "create_prometheus_wsgi_app",
    "GatewayMetrics",
    "init_metrics",
    "instrument_wsgi_app",
    "PrometheusConfig",
    "record_cdn_event",
    "record_digest_verification",
    "TracingConfig",
    "TracingHelper",
]
