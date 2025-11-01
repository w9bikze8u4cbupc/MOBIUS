"""Observability helpers used across MOBIUS services.

The implementation in this module purposely keeps its dependency surface
minimal so it can operate in constrained deployment environments.  The
Prometheus exporter is intentionally lightweight but emits standards
compliant counter metrics for the gateway to scrape.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import os
import threading
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Callable, Dict, Iterable, Iterator, Mapping, MutableMapping, Optional, Tuple

__all__ = [
    "AuditLogger",
    "MetricsRegistry",
    "Observability",
    "ObservabilityMiddleware",
    "build_observability_from_env",
    "configure_fastapi_observability",
    "emit_cdn_transfer",
    "emit_digest_verification",
    "get_current_observability",
    "init_global_observability",
]

_LOGGER = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Prometheus helpers
# ---------------------------------------------------------------------------


def _escape_label_value(value: str) -> str:
    return (
        value.replace("\\", "\\\\")
        .replace("\n", "\\n")
        .replace("\"", "\\\"")
    )


class _CounterChild:
    __slots__ = ("_parent", "_key")

    def __init__(self, parent: "Counter", key: Tuple[Tuple[str, str], ...]) -> None:
        self._parent = parent
        self._key = key

    def inc(self, amount: float = 1.0) -> None:
        self._parent._increment(self._key, amount)


class Counter:
    """Very small Prometheus style counter implementation."""

    def __init__(self, name: str, documentation: str, labelnames: Iterable[str]):
        self.name = name
        self.documentation = documentation
        self.labelnames = tuple(labelnames)
        self._values: Dict[Tuple[Tuple[str, str], ...], float] = {}
        self._lock = threading.Lock()

    def labels(self, **labels: str) -> _CounterChild:
        if set(labels) != set(self.labelnames):
            missing = set(self.labelnames) - set(labels)
            extra = set(labels) - set(self.labelnames)
            problems = []
            if missing:
                problems.append(f"missing labels: {sorted(missing)}")
            if extra:
                problems.append(f"unknown labels: {sorted(extra)}")
            raise ValueError(
                f"Incorrect labels for counter {self.name}: {', '.join(problems)}"
            )
        key = tuple(sorted((name, str(value)) for name, value in labels.items()))
        return _CounterChild(self, key)

    def _increment(self, key: Tuple[Tuple[str, str], ...], amount: float) -> None:
        with self._lock:
            self._values[key] = self._values.get(key, 0.0) + float(amount)

    def collect(self) -> Dict[Tuple[Tuple[str, str], ...], float]:
        with self._lock:
            return dict(self._values)


class MetricsRegistry:
    """Container for the counters exported by the gateway."""

    def __init__(self) -> None:
        self._counters: Dict[str, Counter] = {}
        self.content_type = "text/plain; version=0.0.4"

    def counter(self, name: str, documentation: str, labelnames: Iterable[str]) -> Counter:
        if name in self._counters:
            return self._counters[name]
        counter = Counter(name, documentation, labelnames)
        self._counters[name] = counter
        return counter

    def render(self) -> str:
        lines = []
        for counter in sorted(self._counters.values(), key=lambda c: c.name):
            lines.append(f"# HELP {counter.name} {counter.documentation}")
            lines.append(f"# TYPE {counter.name} counter")
            samples = counter.collect()
            for labels, value in sorted(samples.items()):
                if labels:
                    label_text = ",".join(
                        f"{name}=\"{_escape_label_value(val)}\"" for name, val in labels
                    )
                    lines.append(f"{counter.name}{{{label_text}}} {value}")
                else:
                    lines.append(f"{counter.name} {value}")
            lines.append("")
        return "\n".join(lines).strip() + "\n"


# ---------------------------------------------------------------------------
# Audit logging
# ---------------------------------------------------------------------------


@dataclass
class AuditLogger:
    """JSONL audit logger with optional HMAC signing."""

    path: str
    signing_secret: Optional[bytes] = None

    def __post_init__(self) -> None:
        self._lock = threading.Lock()
        directory = os.path.dirname(self.path)
        if directory:
            os.makedirs(directory, exist_ok=True)

    def _sign_record(self, record: Mapping[str, Any]) -> str:
        assert self.signing_secret is not None
        payload = json.dumps(record, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
        digest = hmac.new(self.signing_secret, payload.encode("utf-8"), hashlib.sha256).digest()
        return base64.b64encode(digest).decode("ascii")

    def append(self, record_type: str, payload: Mapping[str, Any]) -> bool:
        enriched: Dict[str, Any] = {
            "type": record_type,
            "payload": dict(payload),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        signature: Optional[str] = None
        if self.signing_secret:
            signature = self._sign_record(enriched)
            enriched["signature"] = signature
        line = json.dumps(enriched, separators=(",", ":"), ensure_ascii=False)
        try:
            with self._lock:
                with open(self.path, "a", encoding="utf-8") as handle:
                    handle.write(line)
                    handle.write("\n")
            return True
        except OSError:
            _LOGGER.warning("Failed to write audit record", exc_info=True)
            return False


# ---------------------------------------------------------------------------
# Observability core
# ---------------------------------------------------------------------------


class Observability:
    """Holds the runtime observability primitives for a service."""

    def __init__(
        self,
        *,
        metrics: Optional[MetricsRegistry] = None,
        audit_logger: Optional[AuditLogger] = None,
        resource_attributes: Optional[Mapping[str, str]] = None,
    ) -> None:
        self.metrics = metrics or MetricsRegistry()
        self.audit_logger = audit_logger
        self.resource_attributes = dict(resource_attributes or {})
        self.digest_counter = self.metrics.counter(
            "mobius_digest_verifications_total",
            "Total digest verification attempts grouped by outcome.",
            ["status", "artifact_kind", "source"],
        )
        self.cdn_counter = self.metrics.counter(
            "mobius_cdn_fetch_total",
            "Total CDN asset fetches grouped by provider and cache state.",
            ["provider", "cache_status", "status_code"],
        )

    @property
    def prometheus_content_type(self) -> str:
        return self.metrics.content_type

    def render_prometheus(self) -> bytes:
        body = self.metrics.render()
        return body.encode("utf-8")

    def emit_request_audit(
        self,
        *,
        method: str,
        path: str,
        status_code: int,
        latency_ms: float,
        user_agent: str,
        client_ip: str,
    ) -> None:
        if not self.audit_logger:
            return
        self.audit_logger.append(
            "request",
            {
                "method": method,
                "path": path,
                "status": status_code,
                "latency_ms": round(latency_ms, 3),
                "user_agent": user_agent,
                "client_ip": client_ip,
            },
        )

    def emit_digest_verification(
        self,
        *,
        status: str,
        artifact_kind: str,
        source: str,
        details: Optional[Mapping[str, Any]] = None,
    ) -> None:
        self.digest_counter.labels(
            status=status,
            artifact_kind=artifact_kind,
            source=source,
        ).inc()
        if self.audit_logger:
            payload = {
                "status": status,
                "artifact_kind": artifact_kind,
                "source": source,
            }
            if details:
                payload["details"] = dict(details)
            self.audit_logger.append("digest_verification", payload)

    def emit_cdn_transfer(
        self,
        *,
        provider: str,
        cache_status: str,
        status_code: int,
        detail: Optional[Mapping[str, Any]] = None,
    ) -> None:
        self.cdn_counter.labels(
            provider=provider,
            cache_status=cache_status,
            status_code=str(status_code),
        ).inc()
        if self.audit_logger:
            payload = {
                "provider": provider,
                "cache_status": cache_status,
                "status_code": status_code,
            }
            if detail:
                payload["detail"] = dict(detail)
            self.audit_logger.append("cdn_transfer", payload)


_GLOBAL_OBSERVABILITY: Optional[Observability] = None


def init_global_observability(observability: Observability) -> None:
    global _GLOBAL_OBSERVABILITY
    _GLOBAL_OBSERVABILITY = observability


def get_current_observability() -> Optional[Observability]:
    return _GLOBAL_OBSERVABILITY


def emit_digest_verification(**kwargs: Any) -> None:
    obs = get_current_observability()
    if obs:
        obs.emit_digest_verification(**kwargs)


def emit_cdn_transfer(**kwargs: Any) -> None:
    obs = get_current_observability()
    if obs:
        obs.emit_cdn_transfer(**kwargs)


# ---------------------------------------------------------------------------
# Middleware
# ---------------------------------------------------------------------------


class ObservabilityMiddleware:
    """WSGI middleware that emits request audit events."""

    def __init__(self, app: Callable, observability: Observability) -> None:
        self.app = app
        self.observability = observability

    def __call__(self, environ: MutableMapping[str, Any], start_response: Callable):
        start = time.perf_counter()
        status_headers: Dict[str, Any] = {"status": "500 INTERNAL SERVER ERROR", "headers": []}

        def _capture_start(status: str, headers: Iterable[Tuple[str, str]], exc_info=None):
            status_headers["status"] = status
            status_headers["headers"] = list(headers)
            return start_response(status, headers, exc_info)

        result = self.app(environ, _capture_start)

        def _iterate() -> Iterator[bytes]:
            try:
                for chunk in result:
                    yield chunk
            finally:
                if hasattr(result, "close"):
                    result.close()  # type: ignore[call-arg]
                self._after_response(environ, status_headers, start)

        return _iterate()

    def _after_response(self, environ: Mapping[str, Any], status_headers: Mapping[str, Any], start: float) -> None:
        status_code = 500
        status_text = status_headers.get("status", "500 INTERNAL SERVER ERROR")
        try:
            status_code = int(str(status_text).split(" ", 1)[0])
        except (ValueError, AttributeError):
            pass
        latency_ms = (time.perf_counter() - start) * 1000.0
        method = environ.get("REQUEST_METHOD", "GET")
        path = environ.get("PATH_INFO", "/")
        user_agent = environ.get("HTTP_USER_AGENT", "")
        client_ip = environ.get("REMOTE_ADDR", "")
        self.observability.emit_request_audit(
            method=method,
            path=path,
            status_code=status_code,
            latency_ms=latency_ms,
            user_agent=user_agent,
            client_ip=client_ip,
        )


# ---------------------------------------------------------------------------
# FastAPI integration (optional)
# ---------------------------------------------------------------------------


def configure_fastapi_observability(app: Any, observability: Observability, *, enable_audit: bool = True) -> None:
    """Attach request logging to a FastAPI app if FastAPI is available.

    The implementation intentionally avoids importing FastAPI unless the
    caller passes an actual FastAPI instance.  This keeps the base runtime
    dependency free for services that only rely on the WSGI middleware.
    """

    if not enable_audit or not observability.audit_logger:
        return
    try:
        from fastapi import Request
    except ImportError:  # pragma: no cover - optional dependency
        _LOGGER.debug("FastAPI is not installed; skipping audit middleware")
        return

    @app.middleware("http")
    async def _audit_fastapi_requests(request: "Request", call_next):  # type: ignore[name-defined]
        start = time.perf_counter()
        response = await call_next(request)
        latency_ms = (time.perf_counter() - start) * 1000.0
        observability.emit_request_audit(
            method=request.method,
            path=request.url.path,
            status_code=response.status_code,
            latency_ms=latency_ms,
            user_agent=request.headers.get("user-agent", ""),
            client_ip=request.client.host if request.client else "",
        )
        return response


# ---------------------------------------------------------------------------
# Configuration helpers
# ---------------------------------------------------------------------------


def _env_flag(value: Optional[str], default: bool) -> bool:
    if value is None:
        return default
    return value not in {"", "0", "false", "False", "no", "NO"}


def build_observability_from_env(env: Optional[Mapping[str, str]] = None) -> Observability:
    env = dict(env or os.environ)
    metrics_enabled = _env_flag(env.get("PROMETHEUS_METRICS_ENABLED"), True)
    audit_path = env.get("GATEWAY_AUDIT_PATH", os.path.join(".", "logs", "audit.jsonl"))
    signing_secret_raw = env.get("GATEWAY_AUDIT_SIGNING_SECRET")
    audit_logger = None
    if audit_path:
        signing_secret = signing_secret_raw.encode("utf-8") if signing_secret_raw else None
        audit_logger = AuditLogger(path=audit_path, signing_secret=signing_secret)
    metrics = MetricsRegistry() if metrics_enabled else MetricsRegistry()
    # Resource attributes for OTLP exporters can be expanded in the future. For
    # now we only record them for completeness.
    resource_attributes: Dict[str, str] = {}
    if env.get("OTLP_RESOURCE_ATTRIBUTES"):
        try:
            resource_attributes = json.loads(env["OTLP_RESOURCE_ATTRIBUTES"])
        except json.JSONDecodeError:
            _LOGGER.warning("Failed to parse OTLP_RESOURCE_ATTRIBUTES", exc_info=True)
    observability = Observability(metrics=metrics, audit_logger=audit_logger, resource_attributes=resource_attributes)
    init_global_observability(observability)
    return observability
