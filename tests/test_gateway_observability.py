import base64
import hashlib
import hmac
import io
import json
import logging
from pathlib import Path
from typing import Any, Dict, Iterable, Tuple

import pytest

from src.gateway import create_app


def call_wsgi(app, method: str, path: str, *, body: Dict[str, Any] | None = None, headers: Dict[str, str] | None = None):
    body_bytes = json.dumps(body).encode("utf-8") if body is not None else b""
    environ: Dict[str, Any] = {
        "REQUEST_METHOD": method,
        "PATH_INFO": path,
        "SERVER_NAME": "testserver",
        "SERVER_PORT": "80",
        "REMOTE_ADDR": "127.0.0.1",
        "wsgi.version": (1, 0),
        "wsgi.url_scheme": "http",
        "wsgi.input": io.BytesIO(body_bytes),
        "wsgi.errors": io.StringIO(),
        "wsgi.multithread": False,
        "wsgi.multiprocess": False,
        "wsgi.run_once": False,
        "CONTENT_LENGTH": str(len(body_bytes)),
    }
    if headers:
        for key, value in headers.items():
            header_name = "HTTP_" + key.upper().replace("-", "_")
            environ[header_name] = value
    status_headers: Dict[str, Any] = {}

    def start_response(status: str, response_headers: Iterable[Tuple[str, str]], exc_info=None):
        status_headers["status"] = status
        status_headers["headers"] = list(response_headers)
        return lambda data: None

    chunks = list(app(environ, start_response))
    body_out = b"".join(chunks)
    return status_headers["status"], status_headers["headers"], body_out


def test_metrics_endpoint_exposes_counters(tmp_path: Path):
    audit_path = tmp_path / "audit.jsonl"
    settings = {
        "GATEWAY_AUDIT_PATH": str(audit_path),
        "PROMETHEUS_METRICS_ENABLED": "1",
    }
    app = create_app(settings)

    status, headers, body = call_wsgi(
        app,
        "POST",
        "/digests/verify",
        body={
            "status": "success",
            "artifact_kind": "tarball",
            "source": "ingress",
            "checksum": "abc123",
        },
        headers={"Content-Type": "application/json"},
    )
    assert status.startswith("200"), body

    metrics_status, metrics_headers, metrics_body = call_wsgi(app, "GET", "/metrics")
    assert metrics_status.startswith("200")
    assert ("Content-Type", "text/plain; version=0.0.4") in metrics_headers
    assert b'mobius_digest_verifications_total{artifact_kind="tarball",source="ingress",status="success"}' in metrics_body


def test_signed_audit_log_records_digest(tmp_path: Path):
    audit_path = tmp_path / "audit.jsonl"
    secret = "super-secret-key"
    settings = {
        "GATEWAY_AUDIT_PATH": str(audit_path),
        "GATEWAY_AUDIT_SIGNING_SECRET": secret,
    }
    app = create_app(settings)

    call_wsgi(
        app,
        "POST",
        "/digests/verify",
        body={
            "status": "failure",
            "artifact_kind": "wheel",
            "source": "cdn",
            "error": "hash_mismatch",
        },
        headers={"Content-Type": "application/json"},
    )

    records = [json.loads(line) for line in audit_path.read_text(encoding="utf-8").splitlines()]
    assert any(record["type"] == "request" for record in records)
    digest_record = next(record for record in records if record["type"] == "digest_verification")
    assert digest_record["payload"]["status"] == "failure"
    assert "signature" in digest_record

    canonical = {key: value for key, value in digest_record.items() if key != "signature"}
    payload = json.dumps(canonical, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    expected_sig = base64.b64encode(hmac.new(secret.encode("utf-8"), payload, hashlib.sha256).digest()).decode("ascii")
    assert digest_record["signature"] == expected_sig


def test_audit_failures_do_not_block_requests(tmp_path: Path, caplog: pytest.LogCaptureFixture):
    audit_dir = tmp_path / "readonly"
    audit_dir.mkdir()
    audit_path = audit_dir  # Intentionally use a directory to force write failures

    settings = {
        "GATEWAY_AUDIT_PATH": str(audit_path),
        "PROMETHEUS_METRICS_ENABLED": "1",
    }
    app = create_app(settings)

    with caplog.at_level(logging.WARNING):
        status, _, _ = call_wsgi(
            app,
            "POST",
            "/digests/verify",
            body={
                "status": "success",
                "artifact_kind": "archive",
                "source": "cdn",
            },
            headers={"Content-Type": "application/json"},
        )
    assert status.startswith("200")
    assert "Failed to write audit record" in caplog.text

    metrics_status, _, metrics_body = call_wsgi(app, "GET", "/metrics")
    assert metrics_status.startswith("200")
    assert b'mobius_digest_verifications_total{artifact_kind="archive",source="cdn",status="success"}' in metrics_body
