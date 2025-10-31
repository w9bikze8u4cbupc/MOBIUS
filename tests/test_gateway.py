import hashlib
from typing import Dict, Iterable, Optional, Tuple

import pytest
from wsgiref.util import setup_testing_defaults

from gateway import GatewayApplication, GatewayConfig


def _call_app(app: GatewayApplication, path: str, *, method: str = "GET", headers: Optional[Dict[str, str]] = None):
    environ: Dict[str, str] = {}
    setup_testing_defaults(environ)
    environ["REQUEST_METHOD"] = method
    environ["PATH_INFO"] = path
    if headers:
        for key, value in headers.items():
            header_key = "HTTP_" + key.upper().replace("-", "_")
            environ[header_key] = value
    captured: Dict[str, object] = {}

    def start_response(status, response_headers, exc_info=None):
        captured["status"] = status
        captured["headers"] = response_headers

    body_iterable = app(environ, start_response)
    body_chunks = list(body_iterable)
    if hasattr(body_iterable, "close"):
        body_iterable.close()
    captured["body"] = b"".join(body_chunks)
    return captured


@pytest.fixture
def export_root(tmp_path, monkeypatch):
    monkeypatch.setenv("MOBIUS_EXPORT_ROOT", str(tmp_path))
    monkeypatch.setenv("MOBIUS_GATEWAY_KEY", "topsecret")
    monkeypatch.setenv("MOBIUS_VERSION", "2025.10.09")
    monkeypatch.delenv("MOBIUS_CACHE_MODE", raising=False)
    monkeypatch.delenv("MOBIUS_HEALTH_PUBLIC", raising=False)
    monkeypatch.delenv("MOBIUS_SHA256_CHUNK", raising=False)
    return tmp_path


@pytest.fixture
def gateway_app(export_root):
    return GatewayApplication(GatewayConfig.from_environ())


def _headers_to_dict(headers: Iterable[Tuple[str, str]]):
    return {key: value for key, value in headers}


def test_streaming_zip_response_includes_expected_headers(gateway_app, export_root):
    payload = b"example zip bytes"
    file_path = export_root / "report.zip"
    file_path.write_bytes(payload)

    result = _call_app(
        gateway_app,
        "/exports/report.zip",
        headers={"X-Mobius-Key": "topsecret"},
    )

    assert result["status"] == "200 OK"
    headers = _headers_to_dict(result["headers"])
    assert headers["Content-Type"] == "application/zip"
    assert headers["Content-Length"] == str(len(payload))
    assert headers["Content-Disposition"].startswith("attachment;")
    assert headers["Content-Disposition"].endswith('filename="report.zip"')
    assert headers["Cache-Control"] == "public, max-age=0, must-revalidate"
    assert headers["Accept-Ranges"] == "bytes"
    assert headers["Vary"] == "Accept-Encoding"
    assert headers["X-Mobius-Version"] == "2025.10.09"
    assert "ETag" in headers
    assert "Last-Modified" in headers
    assert result["body"] == payload


def test_signature_body_matches_digest(gateway_app, export_root):
    payload = b"digest me"
    file_path = export_root / "archive.zip"
    file_path.write_bytes(payload)
    expected = hashlib.sha256(payload).hexdigest()

    result = _call_app(
        gateway_app,
        "/exports/archive.zip.sha256",
        headers={"X-Mobius-Key": "topsecret"},
    )

    assert result["status"] == "200 OK"
    headers = _headers_to_dict(result["headers"])
    assert headers["Content-Type"] == "text/plain; charset=utf-8"
    assert result["body"] == f"{expected}  archive.zip\n".encode()


def test_conditional_etag_request_returns_304(gateway_app, export_root):
    payload = b"etag content"
    file_path = export_root / "notes.zip"
    file_path.write_bytes(payload)

    first = _call_app(
        gateway_app,
        "/exports/notes.zip",
        headers={"X-Mobius-Key": "topsecret"},
    )
    etag = _headers_to_dict(first["headers"])["ETag"]

    second = _call_app(
        gateway_app,
        "/exports/notes.zip",
        headers={
            "X-Mobius-Key": "topsecret",
            "If-None-Match": etag,
        },
    )

    assert second["status"] == "304 Not Modified"
    assert second["body"] == b""


def test_conditional_if_modified_since_returns_304(gateway_app, export_root):
    payload = b"ims content"
    file_path = export_root / "latest.zip"
    file_path.write_bytes(payload)

    first = _call_app(
        gateway_app,
        "/exports/latest.zip",
        headers={"X-Mobius-Key": "topsecret"},
    )
    headers = _headers_to_dict(first["headers"])
    ims = headers["Last-Modified"]

    second = _call_app(
        gateway_app,
        "/exports/latest.zip",
        headers={
            "X-Mobius-Key": "topsecret",
            "If-Modified-Since": ims,
        },
    )

    assert second["status"] == "304 Not Modified"
    assert second["body"] == b""


def test_request_without_api_key_is_rejected(gateway_app, export_root):
    (export_root / "file.zip").write_bytes(b"content")
    result = _call_app(gateway_app, "/exports/file.zip")
    assert result["status"] == "401 Unauthorized"
    assert result["body"] == b"unauthorised"


def test_health_public_allows_missing_key(export_root, monkeypatch):
    monkeypatch.setenv("MOBIUS_HEALTH_PUBLIC", "1")
    app = GatewayApplication(GatewayConfig.from_environ())
    result = _call_app(app, "/healthz")
    assert result["status"] == "200 OK"
    headers = _headers_to_dict(result["headers"])
    assert headers["Cache-Control"] == "no-store"
    assert result["body"] == b"ok"


def test_path_traversal_is_blocked(gateway_app, export_root):
    (export_root / "good.zip").write_bytes(b"good")
    result = _call_app(
        gateway_app,
        "/exports/../good.zip",
        headers={"X-Mobius-Key": "topsecret"},
    )
    assert result["status"] == "404 Not Found"


def test_unicode_filename_sets_rfc5987_header(gateway_app, export_root):
    payload = b"unicodex"
    file_path = export_root / "unicod\xe9.zip"
    file_path.write_bytes(payload)

    result = _call_app(
        gateway_app,
        "/exports/unicod%C3%A9.zip",
        headers={"X-Mobius-Key": "topsecret"},
    )
    headers = _headers_to_dict(result["headers"])
    disposition = headers["Content-Disposition"]
    assert "filename*=UTF-8''unicod%C3%A9.zip" in disposition
    assert 'filename="unicod_.zip"' in disposition
    assert result["body"] == payload


def test_head_request_returns_headers_only(gateway_app, export_root):
    payload = b"head content"
    file_path = export_root / "headers.zip"
    file_path.write_bytes(payload)

    result = _call_app(
        gateway_app,
        "/exports/headers.zip",
        method="HEAD",
        headers={"X-Mobius-Key": "topsecret"},
    )

    assert result["status"] == "200 OK"
    headers = _headers_to_dict(result["headers"])
    assert headers["Content-Length"] == str(len(payload))
    assert result["body"] == b""


def test_cache_mode_immutable_applies_response_header(export_root, monkeypatch):
    monkeypatch.setenv("MOBIUS_CACHE_MODE", "immutable")
    app = GatewayApplication(GatewayConfig.from_environ())
    (export_root / "imm.zip").write_bytes(b"immutable")

    result = _call_app(
        app,
        "/exports/imm.zip",
        headers={"X-Mobius-Key": "topsecret"},
    )

    assert result["status"] == "200 OK"
    headers = _headers_to_dict(result["headers"])
    assert headers["Cache-Control"] == "public, max-age=31536000, immutable"
