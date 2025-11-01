"""WSGI entrypoint for the MOBIUS gateway."""

from __future__ import annotations

import json
from http import HTTPStatus
from typing import Callable, Iterable, Mapping, Optional

from mobius.observability import (
    AuditLogger,
    ObservabilityResult,
    configure_observability,
    record_cdn_event,
    record_digest_verification,
)

_AUDIT_LOGGER: Optional[AuditLogger] = None
_OBSERVABILITY: Optional[ObservabilityResult] = None


def _json_response(start_response: Callable, payload: Mapping[str, object], status: HTTPStatus = HTTPStatus.OK) -> Iterable[bytes]:
    body = json.dumps(payload).encode("utf-8")
    start_response(
        f"{status.value} {status.phrase}",
        [("Content-Type", "application/json"), ("Content-Length", str(len(body)))],
    )
    return [body]


def _read_json(environ: Mapping[str, object]) -> Optional[Mapping[str, object]]:
    try:
        length = int(environ.get("CONTENT_LENGTH", "0") or 0)
    except (TypeError, ValueError):
        length = 0
    body = environ.get("wsgi.input")
    if body is None:
        raw = b""
    else:
        raw = body.read(length) if length else body.read()  # type: ignore[call-arg]
    if not raw:
        return None
    try:
        return json.loads(raw.decode("utf-8"))
    except json.JSONDecodeError:
        return None


def _handle_digest_verify(environ: Mapping[str, object], start_response: Callable) -> Iterable[bytes]:
    payload = _read_json(environ) or {}
    artifact_id = payload.get("artifact_id")
    expected = payload.get("expected_digest")
    provided = payload.get("provided_digest")
    if not isinstance(artifact_id, str) or not isinstance(expected, str) or not isinstance(provided, str):
        return _json_response(start_response, {"error": "invalid payload"}, HTTPStatus.BAD_REQUEST)
    result = "match" if expected == provided else "mismatch"
    if _OBSERVABILITY:
        record_digest_verification(_OBSERVABILITY.metrics, result=result)
        if _AUDIT_LOGGER:
            _AUDIT_LOGGER.log_digest_verification(
                artifact_id=artifact_id,
                digest=provided,
                result=result,
                extra={"expected": expected},
            )
    return _json_response(start_response, {"artifact_id": artifact_id, "result": result})


def _handle_cdn_event(environ: Mapping[str, object], start_response: Callable) -> Iterable[bytes]:
    payload = _read_json(environ) or {}
    provider = payload.get("provider", "unknown")
    cache_status = payload.get("cache_status", "miss")
    status_code_raw = payload.get("cdn_status_code", HTTPStatus.OK.value)
    try:
        status_code = int(status_code_raw)
    except (TypeError, ValueError):
        return _json_response(start_response, {"error": "invalid cdn_status_code"}, HTTPStatus.BAD_REQUEST)
    if _OBSERVABILITY:
        record_cdn_event(_OBSERVABILITY.metrics, provider=str(provider), cache_status=str(cache_status), status_code=status_code)
        if _AUDIT_LOGGER:
            _AUDIT_LOGGER.log_cdn_event(
                provider=str(provider),
                cache_status=str(cache_status),
                status_code=status_code,
                extra={key: value for key, value in payload.items() if key not in {"provider", "cache_status", "cdn_status_code"}},
            )
    return _json_response(start_response, {"status": "recorded"})


def base_app(environ: Mapping[str, object], start_response: Callable) -> Iterable[bytes]:
    path = environ.get("PATH_INFO", "/")
    method = environ.get("REQUEST_METHOD", "GET")

    if path == "/" and method == "GET":
        return _json_response(start_response, {"status": "ok"})

    if path == "/digests/verify" and method == "POST":
        return _handle_digest_verify(environ, start_response)

    if path == "/cdn/event" and method == "POST":
        return _handle_cdn_event(environ, start_response)

    return _json_response(start_response, {"error": "not found"}, HTTPStatus.NOT_FOUND)


def _configure() -> ObservabilityResult:
    result = configure_observability(base_app)
    global _AUDIT_LOGGER
    global _OBSERVABILITY
    _AUDIT_LOGGER = result.audit_logger
    _OBSERVABILITY = result
    return result


_OBSERVABILITY = _configure()


def application(environ: Mapping[str, object], start_response: Callable) -> Iterable[bytes]:
    if environ.get("PATH_INFO") == "/metrics" and _OBSERVABILITY.metrics_app:
        return _OBSERVABILITY.metrics_app(environ, start_response)
    return _OBSERVABILITY.app(environ, start_response)


__all__ = ["application", "base_app"]
