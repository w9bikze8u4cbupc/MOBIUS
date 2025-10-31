from __future__ import annotations

import hashlib
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Tuple

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from gateway import GatewayApplication
from gateway.config import GatewayConfig


def _write_file(path: Path, content: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(content)


def _make_app(tmp_path: Path, **overrides) -> GatewayApplication:
    config = GatewayConfig(
        export_root=tmp_path.resolve(),
        gateway_key=overrides.get("gateway_key", "secret"),
        health_public=overrides.get("health_public", False),
        version=overrides.get("version", "test-version"),
        cache_mode=overrides.get("cache_mode", "revalidate"),
        sha256_chunk_size=overrides.get("sha256_chunk_size", 8),
    )
    return GatewayApplication(config)


def _run_request(
    app: GatewayApplication,
    path: str,
    *,
    method: str = "GET",
    headers: Dict[str, str] | None = None,
) -> Tuple[str, List[Tuple[str, str]], bytes]:
    headers = headers or {}
    environ = {
        "REQUEST_METHOD": method,
        "PATH_INFO": path,
        "SERVER_NAME": "testserver",
        "SERVER_PORT": "80",
        "wsgi.version": (1, 0),
        "wsgi.url_scheme": "http",
        "wsgi.input": None,
        "wsgi.errors": None,
        "wsgi.multithread": False,
        "wsgi.multiprocess": False,
        "wsgi.run_once": False,
    }
    for header, value in headers.items():
        key = f"HTTP_{header.upper().replace('-', '_')}"
        environ[key] = value

    status_holder = {}

    def start_response(status: str, response_headers: List[Tuple[str, str]], exc_info=None):  # type: ignore[override]
        status_holder["status"] = status
        status_holder["headers"] = list(response_headers)

    result = app(environ, start_response)
    try:
        body = b"".join(result)
    finally:
        close = getattr(result, "close", None)
        if close:
            close()

    return status_holder["status"], status_holder["headers"], body


def _header_dict(headers: List[Tuple[str, str]]) -> Dict[str, str]:
    return {name: value for name, value in headers}


def test_exports_stream_with_expected_headers(tmp_path):
    file_path = tmp_path / "exports" / "sample.zip"
    payload = b"zip-bytes" * 10
    _write_file(file_path, payload)

    app = _make_app(tmp_path / "exports")

    status, headers, body = _run_request(
        app,
        "/exports/sample.zip",
        headers={"X-Mobius-Key": "secret"},
    )

    header_map = _header_dict(headers)
    digest = hashlib.sha256(payload).hexdigest()

    assert status == "200 OK"
    assert body == payload
    assert header_map["Content-Type"] == "application/zip"
    assert header_map["Content-Length"] == str(len(payload))
    assert header_map["Cache-Control"] == "public, max-age=0, must-revalidate"
    assert header_map["Accept-Ranges"] == "bytes"
    assert header_map["ETag"] == f'"{digest}"'
    assert "Last-Modified" in header_map
    assert "filename*=" in header_map["Content-Disposition"]


def test_exports_return_304_for_matching_etag(tmp_path):
    file_path = tmp_path / "exports" / "again.zip"
    payload = b"abc123"
    _write_file(file_path, payload)

    app = _make_app(tmp_path / "exports")

    first_status, first_headers, _ = _run_request(
        app,
        "/exports/again.zip",
        headers={"X-Mobius-Key": "secret"},
    )
    etag = _header_dict(first_headers)["ETag"]

    status, headers, body = _run_request(
        app,
        "/exports/again.zip",
        headers={"X-Mobius-Key": "secret", "If-None-Match": etag},
    )

    assert first_status == "200 OK"
    assert status == "304 Not Modified"
    assert body == b""
    header_map = _header_dict(headers)
    assert header_map["ETag"] == etag


def test_exports_return_304_for_if_modified_since(tmp_path):
    file_path = tmp_path / "exports" / "old.zip"
    payload = b"payload"
    _write_file(file_path, payload)
    mtime = datetime(2024, 1, 1, tzinfo=timezone.utc).timestamp()
    os.utime(file_path, (mtime, mtime))

    app = _make_app(tmp_path / "exports")
    _, headers, _ = _run_request(
        app,
        "/exports/old.zip",
        headers={"X-Mobius-Key": "secret"},
    )
    last_modified = _header_dict(headers)["Last-Modified"]

    status, _, _ = _run_request(
        app,
        "/exports/old.zip",
        headers={
            "X-Mobius-Key": "secret",
            "If-Modified-Since": last_modified,
        },
    )
    assert status == "304 Not Modified"


def test_signature_route_returns_digest(tmp_path):
    file_path = tmp_path / "exports" / "artifact.zip"
    payload = b"artifact"
    _write_file(file_path, payload)

    app = _make_app(tmp_path / "exports")
    status, headers, body = _run_request(
        app,
        "/exports/artifact.zip.sha256",
        headers={"X-Mobius-Key": "secret"},
    )
    digest = hashlib.sha256(payload).hexdigest()
    assert status == "200 OK"
    assert body.decode("utf-8") == f"{digest}  artifact.zip\n"
    header_map = _header_dict(headers)
    assert header_map["Content-Type"] == "text/plain; charset=utf-8"
    assert header_map["ETag"] == f'"{digest}"'


def test_signature_route_honours_conditional_headers(tmp_path):
    file_path = tmp_path / "exports" / "condition.zip"
    payload = b"condition"
    _write_file(file_path, payload)

    app = _make_app(tmp_path / "exports")

    _, headers, _ = _run_request(
        app,
        "/exports/condition.zip.sha256",
        headers={"X-Mobius-Key": "secret"},
    )
    etag = _header_dict(headers)["ETag"]

    status, _, body = _run_request(
        app,
        "/exports/condition.zip.sha256",
        headers={"X-Mobius-Key": "secret", "If-None-Match": etag},
    )
    assert status == "304 Not Modified"
    assert body == b""


def test_health_requires_key_by_default(tmp_path):
    app = _make_app(tmp_path / "exports")
    status, _, _ = _run_request(app, "/healthz")
    assert status == "401 Unauthorized"

    status, headers, body = _run_request(
        app,
        "/healthz",
        headers={"X-Mobius-Key": "secret"},
    )
    assert status == "200 OK"
    assert body == b'{"status":"ok"}'
    assert _header_dict(headers)["Content-Type"] == "application/json; charset=utf-8"


def test_health_can_be_public(tmp_path):
    app = _make_app(tmp_path / "exports", health_public=True)
    status, _, body = _run_request(app, "/healthz")
    assert status == "200 OK"
    assert body == b'{"status":"ok"}'


def test_path_traversal_is_rejected(tmp_path):
    file_path = tmp_path / "exports" / "artifact.zip"
    _write_file(file_path, b"data")
    app = _make_app(tmp_path / "exports")
    status, _, _ = _run_request(
        app,
        "/exports/../artifact.zip",
        headers={"X-Mobius-Key": "secret"},
    )
    assert status == "400 Bad Request"


def test_unicode_filename_has_rfc5987_content_disposition(tmp_path):
    file_name = "リリース.zip"
    file_path = tmp_path / "exports" / file_name
    _write_file(file_path, b"unicode")

    app = _make_app(tmp_path / "exports")
    status, headers, _ = _run_request(
        app,
        f"/exports/{file_name}",
        headers={"X-Mobius-Key": "secret"},
    )

    assert status == "200 OK"
    disposition = _header_dict(headers)["Content-Disposition"]
    assert "filename*=" in disposition
    assert "UTF-8''%E3%83%AA%E3%83%AA%E3%83%BC%E3%82%B9.zip" in disposition
