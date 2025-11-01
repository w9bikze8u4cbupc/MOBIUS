"""Gateway entry-point wiring the observability layer."""

from __future__ import annotations

import io
import json
import logging
from typing import Any, Dict, Iterable, Mapping, MutableMapping, Optional

from mobius import (
    Observability,
    ObservabilityMiddleware,
    build_observability_from_env,
    emit_cdn_transfer,
    emit_digest_verification,
    get_current_observability,
    init_global_observability,
)

__all__ = [
    "create_app",
    "emit_digest_verification",
    "emit_cdn_transfer",
]

_LOGGER = logging.getLogger(__name__)


class GatewayApplication:
    """Barebones WSGI router that exposes the observability endpoints."""

    def __init__(self, observability: Observability) -> None:
        self.observability = observability

    def __call__(self, environ: MutableMapping[str, Any], start_response):
        path = environ.get("PATH_INFO", "") or "/"
        method = environ.get("REQUEST_METHOD", "GET")
        if method == "GET" and path == "/metrics":
            return self._handle_metrics(start_response)
        if method == "POST" and path == "/digests/verify":
            return self._handle_digest_verify(environ, start_response)
        start_response("404 NOT FOUND", [("Content-Type", "application/json")])
        return [json.dumps({"error": "not_found"}).encode("utf-8")]

    def _handle_metrics(self, start_response):
        body = self.observability.render_prometheus()
        headers = [
            ("Content-Type", self.observability.prometheus_content_type),
            ("Content-Length", str(len(body))),
        ]
        start_response("200 OK", headers)
        return [body]

    def _handle_digest_verify(self, environ: Mapping[str, Any], start_response):
        try:
            payload = _read_json(environ)
        except ValueError as exc:  # invalid JSON or missing body
            _LOGGER.debug("Failed to parse digest verification payload: %s", exc)
            start_response("400 BAD REQUEST", [("Content-Type", "application/json")])
            return [json.dumps({"error": "invalid_payload"}).encode("utf-8")]

        required = ["status", "artifact_kind", "source"]
        if any(key not in payload for key in required):
            start_response("400 BAD REQUEST", [("Content-Type", "application/json")])
            return [json.dumps({"error": "missing_fields"}).encode("utf-8")]

        status = str(payload["status"])
        artifact_kind = str(payload["artifact_kind"])
        source = str(payload["source"])
        details = {
            key: value for key, value in payload.items() if key not in {"status", "artifact_kind", "source"}
        }
        self.observability.emit_digest_verification(
            status=status,
            artifact_kind=artifact_kind,
            source=source,
            details=details or None,
        )
        response = {
            "status": status,
            "artifact_kind": artifact_kind,
            "source": source,
            "ok": status.lower() == "success",
        }
        body = json.dumps(response).encode("utf-8")
        headers = [("Content-Type", "application/json"), ("Content-Length", str(len(body)))]
        start_response("200 OK", headers)
        return [body]


def _read_json(environ: Mapping[str, Any]) -> Dict[str, Any]:
    length = environ.get("CONTENT_LENGTH")
    try:
        size = int(length) if length else 0
    except (TypeError, ValueError):
        size = 0
    body = environ.get("wsgi.input")
    if not isinstance(body, io.BytesIO):
        body_stream = io.BytesIO(body.read(size) if body else b"")  # type: ignore[attr-defined]
    else:
        body_stream = body
    raw = body_stream.read(size or -1)
    if not raw:
        raise ValueError("empty body")
    return json.loads(raw.decode("utf-8"))


def create_app(settings: Optional[Mapping[str, str]] = None):
    """Create the WSGI app with observability wiring."""

    observability = build_observability_from_env(settings)
    app = GatewayApplication(observability)
    return ObservabilityMiddleware(app, observability)


def get_observability() -> Optional[Observability]:
    return get_current_observability()
