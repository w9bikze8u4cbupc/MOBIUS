from __future__ import annotations

import io
import json
import os
import zipfile
from pathlib import Path
from typing import Iterable, Tuple

import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest

import gateway


@pytest.fixture(autouse=True)
def configure_env(monkeypatch, tmp_path):
    export_root = tmp_path / "exports"
    export_root.mkdir()

    with zipfile.ZipFile(export_root / "sample.zip", "w") as zf:
        zf.writestr("hello.txt", "hello world\n")

    with zipfile.ZipFile(export_root / "unicode-東京.zip", "w") as zf:
        zf.writestr("東京.txt", "こんにちは\n")

    monkeypatch.setenv("MOBIUS_EXPORT_ROOT", str(export_root))
    monkeypatch.setenv("MOBIUS_API_KEY", "test-key")
    monkeypatch.delenv("MOBIUS_HEALTH_REQUIRE_KEY", raising=False)
    monkeypatch.setenv("MOBIUS_BUILD_VERSION", "2024.09")

    # Reload module configuration for tests.
    import importlib

    importlib.reload(gateway)

    yield

    importlib.reload(gateway)


def _call_app(
    path: str,
    *,
    method: str = "GET",
    headers: dict[str, str] | None = None,
    query_string: str = "",
) -> Tuple[str, list[Tuple[str, str]], bytes]:
    headers = headers or {}
    environ = {
        "REQUEST_METHOD": method,
        "PATH_INFO": path,
        "QUERY_STRING": query_string,
        "SERVER_NAME": "testserver",
        "SERVER_PORT": "80",
        "wsgi.version": (1, 0),
        "wsgi.url_scheme": "http",
        "wsgi.input": io.BytesIO(b""),
        "wsgi.errors": io.StringIO(),
        "wsgi.multithread": False,
        "wsgi.multiprocess": False,
        "wsgi.run_once": False,
    }
    for name, value in headers.items():
        environ[f"HTTP_{name.upper().replace('-', '_')}"] = value

    status_headers: Tuple[str, list[Tuple[str, str]]] = ("", [])

    def start_response(status: str, response_headers: Iterable[Tuple[str, str]]):
        nonlocal status_headers
        status_headers = (status, list(response_headers))

    body_parts = list(gateway.application(environ, start_response))
    body = b"".join(body_parts)
    return status_headers[0], status_headers[1], body


def _header_map(headers: list[Tuple[str, str]]) -> dict[str, str]:
    return {name: value for name, value in headers}


def test_get_zip_happy_path():
    status, headers, body = _call_app(
        "/sample.zip", headers={"X-API-Key": "test-key"}
    )

    assert status == "200 OK"
    header_map = _header_map(headers)
    assert header_map["Cache-Control"] == "public, immutable, max-age=31536000"
    assert header_map["Content-Type"] == "application/zip"
    assert header_map["Content-Disposition"].startswith('attachment; filename="sample.zip"')
    assert header_map["Vary"] == "Accept-Encoding"
    assert "ETag" in header_map
    assert body  # content streamed


def test_head_matches_get_metadata():
    status, headers, body = _call_app(
        "/sample.zip", method="HEAD", headers={"X-API-Key": "test-key"}
    )

    assert status == "200 OK"
    assert body == b""
    header_map = _header_map(headers)
    assert header_map["Content-Length"].isdigit()
    length = int(header_map["Content-Length"])

    get_status, get_headers, get_body = _call_app(
        "/sample.zip", headers={"X-API-Key": "test-key"}
    )
    assert get_status == "200 OK"
    assert int(_header_map(get_headers)["Content-Length"]) == length
    assert len(get_body) == length


def test_checksum_manifest_matches_zip_digest():
    status, headers, body = _call_app(
        "/sample.zip.sha256", headers={"X-API-Key": "test-key"}
    )
    assert status == "200 OK"
    header_map = _header_map(headers)
    assert header_map["Cache-Control"] == "public, max-age=0, must-revalidate"
    assert header_map["Content-Type"].startswith("text/plain")
    digest, filename = body.decode("utf-8").strip().split()

    zip_path = Path(os.environ["MOBIUS_EXPORT_ROOT"]) / "sample.zip"
    with zip_path.open("rb") as handle:
        import hashlib

        sha = hashlib.sha256()
        sha.update(handle.read())
        assert sha.hexdigest() == digest
    assert filename == "sample.zip"


def test_conditional_get_uses_etag():
    status, headers, _ = _call_app(
        "/sample.zip", headers={"X-API-Key": "test-key"}
    )
    etag = _header_map(headers)["ETag"]

    status_304, headers_304, body_304 = _call_app(
        "/sample.zip", headers={"X-API-Key": "test-key", "If-None-Match": etag}
    )
    assert status_304 == "304 Not Modified"
    assert body_304 == b""
    header_map = _header_map(headers_304)
    assert header_map["ETag"] == etag


def test_path_traversal_rejected():
    status, headers, _ = _call_app(
        "/../sample.zip", headers={"X-API-Key": "test-key"}
    )
    assert status == "403 Forbidden"
    assert _header_map(headers)["Cache-Control"] == "no-store"


def test_missing_key_rejected():
    status, _, body = _call_app("/sample.zip")
    assert status == "401 Unauthorized"
    assert body == b'{"error":"unauthorized"}'


def test_unicode_filename_content_disposition():
    status, headers, _ = _call_app(
        "/unicode-東京.zip", headers={"X-API-Key": "test-key"}
    )
    assert status == "200 OK"
    header_map = _header_map(headers)
    assert "filename*=" in header_map["Content-Disposition"]


def test_health_endpoint_public():
    status, headers, body = _call_app("/health")
    assert status == "200 OK"
    payload = json.loads(body)
    assert payload["status"] == "ok"
    assert payload["version"] == "2024.09"
    assert _header_map(headers)["X-Mobius-Version"] == "2024.09"


def test_health_requires_key_when_flagged(monkeypatch):
    monkeypatch.setenv("MOBIUS_HEALTH_REQUIRE_KEY", "1")

    import importlib

    importlib.reload(gateway)

    status, _, body = _call_app("/health")
    assert status == "401 Unauthorized"
    assert body == b'{"error":"unauthorized"}'

    status_ok, _, _ = _call_app("/health", headers={"X-API-Key": "test-key"})
    assert status_ok == "200 OK"
