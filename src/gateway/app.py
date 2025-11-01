"""WSGI gateway entrypoint with observability hooks."""

from __future__ import annotations

import json
import logging
import os
from http import HTTPStatus
from typing import Any, Callable, Iterable, Mapping, Optional

from mobius.observability import (
    ObservabilityMiddleware,
    create_observability_middleware,
    create_prometheus_wsgi_app,
)

logger = logging.getLogger(__name__)
_metrics_app = create_prometheus_wsgi_app()


def _parse_bool(value: Optional[str], default: bool) -> bool:
    """
    Parse a string into a boolean using common truthy representations.
    
    Parameters:
        value (Optional[str]): The string to interpret as a boolean. If `None`, `default` is used.
        default (bool): The fallback boolean returned when `value` is `None`.
    
    Returns:
        bool: `True` if `value` (case-insensitive) is one of "1", "true", "yes", or "on"; `False` otherwise.
    """
    if value is None:
        return default
    return value.lower() in {"1", "true", "yes", "on"}


def _parse_json_dict(value: Optional[str]) -> Optional[dict[str, str]]:
    """
    Parse a JSON string into a dict of strings or return None if the input is empty or invalid.
    
    Parameters:
        value (Optional[str]): JSON-encoded object where keys and values will be coerced to strings.
    
    Returns:
        Optional[dict[str, str]]: A dictionary with keys and values converted to strings if parsing succeeds; `None` if `value` is falsy, not valid JSON, or not a JSON object.
    
    Notes:
        Logs a warning when the value is invalid JSON or when the parsed JSON is not an object.
    """
    if not value:
        return None
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError:
        logger.warning("Invalid JSON payload in configuration value: %s", value)
        return None
    if not isinstance(parsed, dict):
        logger.warning("Expected JSON object for configuration value: %s", value)
        return None
    return {str(k): str(v) for k, v in parsed.items()}


def _parse_int(value: Optional[str]) -> Optional[int]:
    """
    Parse a string as an integer, returning None for missing or invalid values.
    
    Parameters:
        value (Optional[str]): The string to parse; None or empty string are treated as missing.
    
    Returns:
        Optional[int]: The parsed integer, or None if the input is None, an empty string, or not a valid integer.
    """
    if value is None or value == "":
        return None
    try:
        return int(value)
    except ValueError:
        logger.warning("Invalid integer configuration value: %s", value)
        return None


def _core_wsgi_app(environ: Mapping[str, Any], start_response: Callable[..., Iterable[bytes]]):
    """
    WSGI application handling metrics, health checks, digest verification requests, and a 404 fallback.
    
    Routes:
    - /metrics: forwards the request to the Prometheus metrics WSGI app.
    - /healthz (GET): returns HTTP 200 with JSON {"status": "ok"} and Cache-Control: no-store.
    - /digests/verify (POST): accepts a JSON payload containing artifact_id, expected_digest, observed_digest, and optional cdn_* fields; logs a digest verification event and an optional CDN transfer event, then returns HTTP 200 with a JSON body summarizing the verification (fields: status, artifact_id, expected_digest, observed_digest).
    - any other path/method: returns HTTP 404 with JSON {"error": "not found", "path": "<requested path>"}.
    
    Parameters:
        environ (Mapping[str, Any]): WSGI environment mapping for the request.
        start_response (Callable[..., Iterable[bytes]]): WSGI start_response callable used to begin the HTTP response.
    
    Returns:
        An iterable of bytes containing the JSON-encoded response body.
    """
    method = environ.get("REQUEST_METHOD", "GET")
    path = environ.get("PATH_INFO", "/")

    if path == "/metrics":
        return _metrics_app(environ, start_response)

    if path == "/healthz" and method == "GET":
        start_response(
            f"{HTTPStatus.OK.value} {HTTPStatus.OK.phrase}",
            [("Content-Type", "application/json"), ("Cache-Control", "no-store")],
        )
        return [json.dumps({"status": "ok"}).encode("utf-8")]

    if path == "/digests/verify" and method == "POST":
        try:
            length = int(environ.get("CONTENT_LENGTH", "0"))
        except ValueError:
            length = 0
        body = environ.get("wsgi.input")
        raw_payload = body.read(length) if body is not None else b""
        try:
            payload = json.loads(raw_payload.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            start_response(
                f"{HTTPStatus.BAD_REQUEST.value} {HTTPStatus.BAD_REQUEST.phrase}",
                [("Content-Type", "application/json")],
            )
            return [json.dumps({"error": "invalid json"}).encode("utf-8")]

        artifact_id = str(payload.get("artifact_id", ""))
        expected_digest = str(payload.get("expected_digest", ""))
        observed_digest = str(payload.get("observed_digest", ""))
        source = str(payload.get("source", "api"))
        artifact_kind = str(payload.get("artifact_kind", "artifact"))
        status = "success" if expected_digest and expected_digest == observed_digest else "failure"
        observability.log_digest_verification(
            artifact_id=artifact_id or "unknown-artifact",
            expected_digest=expected_digest,
            observed_digest=observed_digest,
            status=status,
            source=source,
            artifact_kind=artifact_kind,
            extra={"path": path},
        )

        cdn_provider = payload.get("cdn_provider")
        if cdn_provider:
            cache_status = str(payload.get("cdn_cache_status", "miss"))
            status_code = int(payload.get("cdn_status_code", HTTPStatus.OK.value))
            observability.log_cdn_transfer(
                artifact_id=artifact_id or "unknown-artifact",
                provider=str(cdn_provider),
                cache_status=cache_status,
                status_code=status_code,
                extra={"path": path},
            )

        start_response(
            f"{HTTPStatus.OK.value} {HTTPStatus.OK.phrase}",
            [("Content-Type", "application/json"), ("Cache-Control", "no-store")],
        )
        response = {
            "status": status,
            "artifact_id": artifact_id,
            "expected_digest": expected_digest,
            "observed_digest": observed_digest,
        }
        return [json.dumps(response).encode("utf-8")]

    start_response(
        f"{HTTPStatus.NOT_FOUND.value} {HTTPStatus.NOT_FOUND.phrase}",
        [("Content-Type", "application/json")],
    )
    return [json.dumps({"error": "not found", "path": path}).encode("utf-8")]


_service_name = os.getenv("SERVICE_NAME", "mobius-gateway")
_enable_prometheus = _parse_bool(os.getenv("PROMETHEUS_METRICS_ENABLED"), True)
_otlp_endpoint = os.getenv("OTLP_METRICS_ENDPOINT")
_enable_otlp = _parse_bool(os.getenv("OTLP_METRICS_ENABLED"), bool(_otlp_endpoint))
_otlp_headers = _parse_json_dict(os.getenv("OTLP_METRICS_HEADERS"))
_otlp_timeout = _parse_int(os.getenv("OTLP_METRICS_TIMEOUT"))
_resource_attributes = _parse_json_dict(os.getenv("OTLP_RESOURCE_ATTRIBUTES"))
_audit_path = os.getenv("GATEWAY_AUDIT_PATH")
_signer_secret = os.getenv("GATEWAY_AUDIT_SIGNING_SECRET")

observability: ObservabilityMiddleware = create_observability_middleware(
    _core_wsgi_app,
    service_name=_service_name,
    audit_path=_audit_path,
    signer_secret=_signer_secret,
    enable_prometheus=_enable_prometheus,
    enable_otlp=_enable_otlp,
    otlp_endpoint=_otlp_endpoint,
    otlp_headers=_otlp_headers,
    otlp_timeout=_otlp_timeout,
    resource_attributes=_resource_attributes,
)

application = observability
metrics_application = _metrics_app


def emit_digest_verification(
    *,
    artifact_id: str,
    expected_digest: str,
    observed_digest: str,
    status: str,
    source: str,
    artifact_kind: str,
    extra: Optional[dict[str, str]] = None,
) -> None:
    """
    Emit an observability event describing the verification of an artifact digest.
    
    Parameters:
        artifact_id (str): Identifier of the artifact being verified; use a stable identifier when available.
        expected_digest (str): The digest value that was expected.
        observed_digest (str): The digest value that was observed.
        status (str): Verification outcome (e.g., "success" or "failure").
        source (str): Origin of the verification event (for example, "api" or "cdn").
        artifact_kind (str): Kind or category of the artifact (for example, "artifact" or "package").
        extra (Optional[dict[str, str]]): Additional metadata to attach to the event.
    """
    observability.log_digest_verification(
        artifact_id=artifact_id,
        expected_digest=expected_digest,
        observed_digest=observed_digest,
        status=status,
        source=source,
        artifact_kind=artifact_kind,
        extra=extra,
    )


def emit_cdn_transfer(
    *,
    artifact_id: str,
    provider: str,
    cache_status: str,
    status_code: int,
    extra: Optional[dict[str, str]] = None,
) -> None:
    """
    Emit a CDN transfer event to the observability pipeline.
    
    Parameters:
        artifact_id (str): Identifier of the artifact involved in the transfer.
        provider (str): CDN provider name.
        cache_status (str): Cache outcome (e.g., "hit", "miss").
        status_code (int): HTTP status code observed from the CDN.
        extra (Optional[dict[str, str]]): Additional metadata to include with the event.
    """
    observability.log_cdn_transfer(
        artifact_id=artifact_id,
        provider=provider,
        cache_status=cache_status,
        status_code=status_code,
        extra=extra,
    )


__all__ = [
    "observability",
    "application",
    "metrics_application",
    "emit_digest_verification",
    "emit_cdn_transfer",
]