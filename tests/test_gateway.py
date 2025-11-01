from __future__ import annotations

import email.utils
import hashlib
import io
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Iterable, Optional, Tuple

import pytest

from gateway import GatewayApplication, GatewayConfig


def _make_app(tmp_path: Path, **overrides) -> Tuple[GatewayApplication, Path]:
    exports_root = tmp_path / "exports"
    exports_root.mkdir(exist_ok=True)
    config = GatewayConfig(
        exports_root=exports_root,
        gateway_key="secret",
        cache_mode=overrides.get("cache_mode", "revalidate"),
        version=overrides.get("version"),
        health_public=overrides.get("health_public", False),
    )
    return GatewayApplication(config), exports_root


def _request(
    app: GatewayApplication,
    method: str,
    path: str,
    headers: Optional[Dict[str, str]] = None,
):
    headers = headers or {}
    environ: Dict[str, str] = {}
    from wsgiref.util import setup_testing_defaults

    setup_testing_defaults(environ)
    environ["REQUEST_METHOD"] = method
    environ["PATH_INFO"] = path
    environ["wsgi.input"] = io.BytesIO(b"")
    environ["CONTENT_LENGTH"] = "0"

    for key, value in headers.items():
        environ[f"HTTP_{key.upper().replace('-', '_')}"] = value

    captured: Dict[str, object] = {}

    def start_response(status: str, response_headers: Iterable[Tuple[str, str]]):
        captured["status"] = status
        captured["headers"] = list(response_headers)

    body = b"".join(app(environ, start_response))
    status = captured["status"]
    header_map = {}
    for name, value in captured["headers"]:
        header_map[name] = value
    return status, header_map, body


def _write_file(path: Path, data: bytes, mtime: float) -> None:
    path.write_bytes(data)
    os.utime(path, (mtime, mtime))


def test_streams_zip_with_expected_headers(tmp_path):
    app, root = _make_app(tmp_path, version="1.2.3")
    artifact = root / "demo.zip"
    payload = b"hello world" * 10
    mtime = 1_700_000_000
    _write_file(artifact, payload, mtime)

    status, headers, body = _request(
        app,
        "GET",
        "/exports/demo.zip",
        {"X-Mobius-Key": "secret"},
    )

    assert status == "200 OK"
    assert body == payload
    digest = hashlib.sha256(payload).hexdigest()
    assert headers["ETag"] == f'"{digest}"'
    assert headers["Content-Length"] == str(len(payload))
    assert headers["Content-Type"] == "application/zip"
    assert headers["X-Mobius-Version"] == "1.2.3"
    expected_last_modified = email.utils.format_datetime(
        datetime.fromtimestamp(mtime, tz=timezone.utc),
        usegmt=True,
    )
    assert headers["Last-Modified"] == expected_last_modified
    assert headers["Cache-Control"] == "public, must-revalidate"
    assert headers["Vary"] == "Accept-Encoding"
    assert headers["Accept-Ranges"] == "bytes"
    content_disposition = headers["Content-Disposition"]
    assert "filename=\"demo.zip\"" in content_disposition
    assert "filename*=UTF-8''demo.zip" in content_disposition


def test_head_matches_get_headers(tmp_path):
    app, root = _make_app(tmp_path)
    artifact = root / "demo.zip"
    _write_file(artifact, b"abc", 1_700_000_100)

    status_get, headers_get, _ = _request(
        app,
        "GET",
        "/exports/demo.zip",
        {"X-Mobius-Key": "secret"},
    )
    status_head, headers_head, body_head = _request(
        app,
        "HEAD",
        "/exports/demo.zip",
        {"X-Mobius-Key": "secret"},
    )

    assert status_get == "200 OK"
    assert status_head == "200 OK"
    assert body_head == b""
    assert headers_head == headers_get


def test_etag_revalidation_returns_304(tmp_path):
    app, root = _make_app(tmp_path)
    artifact = root / "demo.zip"
    payload = b"payload"
    mtime = 1_700_000_400
    _write_file(artifact, payload, mtime)

    _, headers, _ = _request(
        app,
        "GET",
        "/exports/demo.zip",
        {"X-Mobius-Key": "secret"},
    )

    status, revalidated_headers, body = _request(
        app,
        "GET",
        "/exports/demo.zip",
        {
            "X-Mobius-Key": "secret",
            "If-None-Match": headers["ETag"],
        },
    )

    assert status == "304 Not Modified"
    assert body == b""
    assert revalidated_headers["ETag"] == headers["ETag"]
    assert revalidated_headers["Cache-Control"] == "public, must-revalidate"
    assert revalidated_headers["Last-Modified"] == headers["Last-Modified"]


def test_if_modified_since_returns_304(tmp_path):
    app, root = _make_app(tmp_path)
    artifact = root / "demo.zip"
    payload = b"abc123"
    mtime = 1_700_000_800
    _write_file(artifact, payload, mtime)

    _, headers, _ = _request(
        app,
        "GET",
        "/exports/demo.zip",
        {"X-Mobius-Key": "secret"},
    )

    status, revalidated_headers, body = _request(
        app,
        "GET",
        "/exports/demo.zip",
        {
            "X-Mobius-Key": "secret",
            "If-Modified-Since": headers["Last-Modified"],
        },
    )

    assert status == "304 Not Modified"
    assert body == b""
    assert revalidated_headers["ETag"] == headers["ETag"]


def test_digest_endpoint_returns_manifest(tmp_path):
    app, root = _make_app(tmp_path)
    artifact = root / "unicode_demo.zip"
    payload = "dátå".encode("utf-8")
    mtime = 1_700_001_100
    _write_file(artifact, payload, mtime)

    status, headers, body = _request(
        app,
        "GET",
        "/exports/unicode_demo.zip.sha256",
        {"X-Mobius-Key": "secret"},
    )

    digest = hashlib.sha256(payload).hexdigest()
    assert status == "200 OK"
    assert body == f"{digest}  unicode_demo.zip\n".encode("utf-8")
    assert headers["Content-Type"] == "text/plain; charset=utf-8"
    assert headers["Content-Length"] == str(len(body))
    assert headers["ETag"] == f'"{digest}"'
    assert "filename*=UTF-8''unicode_demo.zip.sha256" in headers["Content-Disposition"]


def test_missing_key_rejected(tmp_path):
    app, root = _make_app(tmp_path)
    artifact = root / "demo.zip"
    _write_file(artifact, b"abc", 1_700_001_500)

    status, headers, body = _request(app, "GET", "/exports/demo.zip")
    assert status == "401 Unauthorized"
    assert body == b""
    assert headers["Content-Length"] == "0"


def test_path_traversal_rejected(tmp_path):
    app, root = _make_app(tmp_path)
    artifact = root / "demo.zip"
    _write_file(artifact, b"abc", 1_700_002_000)

    status, headers, body = _request(
        app,
        "GET",
        "/exports/..%2Fdemo.zip",
        {"X-Mobius-Key": "secret"},
    )

    assert status == "404 Not Found"
    assert body == b""


def test_cache_modes_control_header(tmp_path):
    modes = {
        "revalidate": "public, must-revalidate",
        "immutable": "public, max-age=31536000, immutable",
        "no-store": "no-store",
        "bypass": "private, max-age=0, no-store",
    }
    for mode, expected in modes.items():
        app, root = _make_app(tmp_path, cache_mode=mode)
        artifact = root / f"demo_{mode}.zip"
        _write_file(artifact, b"data", 1_700_003_000)

        status, headers, _ = _request(
            app,
            "GET",
            f"/exports/{artifact.name}",
            {"X-Mobius-Key": "secret"},
        )
        assert status == "200 OK"
        assert headers["Cache-Control"] == expected


def test_health_requires_key_unless_public(tmp_path):
    app, root = _make_app(tmp_path)

    status, headers, body = _request(app, "GET", "/healthz")
    assert status == "401 Unauthorized"

    status_ok, headers_ok, body_ok = _request(
        app,
        "GET",
        "/healthz",
        {"X-Mobius-Key": "secret"},
    )
    assert status_ok == "200 OK"
    assert headers_ok["Cache-Control"] == "no-store"
    assert body_ok == b"ok\n"

    public_app, _ = _make_app(tmp_path, health_public=True)
    status_public, _, _ = _request(public_app, "GET", "/healthz")
    assert status_public == "200 OK"


def test_gateway_config_from_environ():
    environ = {
        "MOBIUS_EXPORTS_ROOT": "/srv/artifacts",
        "MOBIUS_GATEWAY_KEY": "secret",
        "MOBIUS_CACHE_MODE": "immutable",
        "MOBIUS_VERSION": "2.0.0",
        "MOBIUS_HEALTH_PUBLIC": "true",
    }
    config = GatewayConfig.from_environ(environ)
    assert config.exports_root == Path("/srv/artifacts")
    assert config.gateway_key == "secret"
    assert config.cache_mode == "immutable"
    assert config.version == "2.0.0"
    assert config.health_public is True


def test_gateway_config_invalid_cache_mode():
    with pytest.raises(ValueError):
        GatewayConfig(
            exports_root=Path("/tmp"),
            gateway_key="secret",
            cache_mode="invalid",
        )
