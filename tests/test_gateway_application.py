from __future__ import annotations

import hashlib
import io
import os
from datetime import datetime, timezone
from typing import Dict, Iterable, Tuple

import pytest

from gateway import GatewayApplication


def _call_app(
    app: GatewayApplication,
    method: str,
    path: str,
    headers: Dict[str, str] | None = None,
) -> Tuple[str, Dict[str, str], bytes]:
    environ = {
        "REQUEST_METHOD": method,
        "PATH_INFO": path,
        "SERVER_NAME": "localhost",
        "SERVER_PORT": "80",
        "SCRIPT_NAME": "",
        "QUERY_STRING": "",
        "wsgi.version": (1, 0),
        "wsgi.url_scheme": "http",
        "wsgi.input": io.BytesIO(b""),
        "wsgi.errors": io.StringIO(),
        "wsgi.multithread": False,
        "wsgi.multiprocess": False,
        "wsgi.run_once": False,
        "CONTENT_TYPE": "",
        "CONTENT_LENGTH": "0",
    }
    if headers:
        for key, value in headers.items():
            environ[f"HTTP_{key.upper().replace('-', '_')}"] = value

    status_holder: Dict[str, str] = {}
    response_headers: list[Tuple[str, str]] = []
    body_chunks: list[bytes] = []

    def start_response(status: str, header_list: Iterable[Tuple[str, str]]):
        status_holder["status"] = status
        response_headers.extend(header_list)

        def write(chunk: bytes):
            body_chunks.append(chunk)

        return write

    result = app(environ, start_response)
    try:
        for part in result:
            body_chunks.append(part)
    finally:
        close = getattr(result, "close", None)
        if callable(close):
            close()

    body = b"".join(body_chunks)
    header_map: Dict[str, str] = {}
    for key, value in response_headers:
        header_map[key] = value

    return status_holder.get("status", ""), header_map, body


@pytest.fixture()
def artifact_root(tmp_path):
    exports = tmp_path / "exports"
    exports.mkdir()
    return exports


@pytest.fixture()
def sample_file(artifact_root):
    filename = "データ.zip"
    path = artifact_root / filename
    payload = b"content-of-export"
    path.write_bytes(payload)
    # Stabilise mtime for deterministic Last-Modified headers.
    fixed_time = datetime(2023, 5, 17, 15, 30, 45, tzinfo=timezone.utc)
    timestamp = fixed_time.timestamp()
    os.utime(path, (timestamp, timestamp))
    digest = hashlib.sha256(payload).hexdigest()
    return path, payload, digest


def _app(root, **kwargs) -> GatewayApplication:
    return GatewayApplication(root, api_key="secret", version="1.2.3", **kwargs)


def test_zip_streams_with_headers(sample_file):
    path, payload, digest = sample_file
    app = _app(path.parent)
    status, headers, body = _call_app(
        app,
        "GET",
        f"/exports/{path.name}",
        headers={"X-Mobius-Key": "secret"},
    )

    assert status == "200 OK"
    assert body == payload
    assert headers["Content-Type"] == "application/zip"
    assert headers["Content-Length"] == str(len(payload))
    assert headers["Accept-Ranges"] == "bytes"
    assert headers["Vary"] == "Accept-Encoding"
    assert headers["X-Mobius-Version"] == "1.2.3"
    assert headers["Cache-Control"] == "public, max-age=0, must-revalidate"
    assert headers["ETag"] == f'"{digest}"'
    assert "filename*=UTF-8''" in headers["Content-Disposition"]


def test_head_returns_headers_without_body(sample_file):
    path, payload, digest = sample_file
    app = _app(path.parent)
    status, headers, body = _call_app(
        app,
        "HEAD",
        f"/exports/{path.name}",
        headers={"X-Mobius-Key": "secret"},
    )

    assert status == "200 OK"
    assert body == b""
    assert headers["Content-Length"] == str(len(payload))
    assert headers["ETag"] == f'"{digest}"'


def test_conditional_get_with_etag(sample_file):
    path, _, digest = sample_file
    app = _app(path.parent)
    status, headers, _ = _call_app(
        app,
        "GET",
        f"/exports/{path.name}",
        headers={"X-Mobius-Key": "secret"},
    )
    assert status == "200 OK"

    status, headers, body = _call_app(
        app,
        "GET",
        f"/exports/{path.name}",
        headers={
            "X-Mobius-Key": "secret",
            "If-None-Match": headers["ETag"],
        },
    )
    assert status == "304 Not Modified"
    assert body == b""
    assert headers["ETag"] == f'"{digest}"'


def test_conditional_get_with_last_modified(sample_file):
    path, _, _ = sample_file
    app = _app(path.parent)
    status, headers, _ = _call_app(
        app,
        "GET",
        f"/exports/{path.name}",
        headers={"X-Mobius-Key": "secret"},
    )

    status, _, body = _call_app(
        app,
        "GET",
        f"/exports/{path.name}",
        headers={
            "X-Mobius-Key": "secret",
            "If-Modified-Since": headers["Last-Modified"],
        },
    )
    assert status == "304 Not Modified"
    assert body == b""


def test_sha256_signature_response(sample_file):
    path, payload, digest = sample_file
    app = _app(path.parent)
    status, headers, body = _call_app(
        app,
        "GET",
        f"/exports/{path.name}.sha256",
        headers={"X-Mobius-Key": "secret"},
    )

    assert status == "200 OK"
    assert headers["Content-Type"] == "text/plain; charset=utf-8"
    assert headers["ETag"] == f'"{digest}-sha"'
    assert body.decode("utf-8").strip() == f"{digest}  {path.name}"
    assert "filename*=UTF-8''" in headers["Content-Disposition"]


def test_traversal_is_rejected(sample_file):
    path, _, _ = sample_file
    app = _app(path.parent)
    status, headers, body = _call_app(
        app,
        "GET",
        "/exports/../secret.zip",
        headers={"X-Mobius-Key": "secret"},
    )

    assert status == "404 Not Found"
    assert body == b"Not Found"


def test_authentication_required(sample_file):
    path, _, _ = sample_file
    app = _app(path.parent)
    status, headers, body = _call_app(app, "GET", f"/exports/{path.name}")

    assert status == "401 Unauthorized"
    assert headers["WWW-Authenticate"] == "Mobius"


def test_health_endpoint_optional_public(artifact_root):
    app = GatewayApplication(artifact_root, api_key="secret", health_public=True)
    status, headers, body = _call_app(app, "GET", "/healthz")

    assert status == "200 OK"
    assert body == b"ok\n"
    assert headers["Cache-Control"] == "no-store"


@pytest.mark.parametrize(
    "mode,expected",
    [
        ("revalidate", "public, max-age=0, must-revalidate"),
        ("immutable", "public, max-age=31536000, immutable"),
        ("no-store", "no-store"),
    ],
)
def test_cache_control_modes(sample_file, mode, expected):
    path, _, _ = sample_file
    app = _app(path.parent, cache_mode=mode)
    status, headers, _ = _call_app(
        app,
        "GET",
        f"/exports/{path.name}",
        headers={"X-Mobius-Key": "secret"},
    )

    assert status == "200 OK"
    assert headers["Cache-Control"] == expected


def test_invalid_cache_mode_raises(artifact_root):
    with pytest.raises(ValueError):
        GatewayApplication(artifact_root, cache_mode="totally-bogus")


def test_health_requires_key_by_default(artifact_root):
    app = GatewayApplication(artifact_root, api_key="secret")
    status, _, _ = _call_app(app, "GET", "/healthz")
    assert status == "401 Unauthorized"


