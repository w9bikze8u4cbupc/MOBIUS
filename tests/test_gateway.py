from __future__ import annotations

import hashlib
import io
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Dict, Iterable, Tuple
from wsgiref.util import setup_testing_defaults

import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from gateway import GatewayApplication


def make_zip(path, name: str = "sample.zip") -> Tuple[str, bytes]:
    import zipfile

    zip_path = path / name
    with zipfile.ZipFile(zip_path, "w") as archive:
        archive.writestr("hello.txt", "hello world")
    return str(zip_path), zip_path.read_bytes()


def make_environ(path: str, method: str, headers: Dict[str, str] | None = None) -> Dict[str, object]:
    environ: Dict[str, object] = {}
    setup_testing_defaults(environ)
    environ["PATH_INFO"] = path
    environ["REQUEST_METHOD"] = method
    environ["QUERY_STRING"] = ""
    environ["wsgi.input"] = io.BytesIO(b"")
    if headers:
        for key, value in headers.items():
            header_key = "HTTP_" + key.upper().replace("-", "_")
            environ[header_key] = value
    return environ


def run_request(app: GatewayApplication, path: str, *, method: str = "GET", headers: Dict[str, str] | None = None):
    environ = make_environ(path, method, headers)
    captured: Dict[str, object] = {}

    def start_response(status: str, response_headers: Iterable[Tuple[str, str]], exc_info=None):
        captured["status"] = status
        captured["headers"] = list(response_headers)

    result = app(environ, start_response)
    try:
        body = b"".join(result)
    finally:
        close = getattr(result, "close", None)
        if callable(close):
            close()
    return captured["status"], captured["headers"], body


def header_map(headers: Iterable[Tuple[str, str]]):
    return {k: v for k, v in headers}


def authorized_headers(key: str) -> Dict[str, str]:
    return {"X-Mobius-Key": key}


def test_streaming_zip_headers(tmp_path):
    _, zip_bytes = make_zip(tmp_path, "artifact.zip")
    app = GatewayApplication(tmp_path, "secret", version="2024.09.01")
    status, headers, body = run_request(
        app,
        "/exports/artifact.zip",
        headers=authorized_headers("secret"),
    )

    assert status == "200 OK"
    assert body == zip_bytes
    hmap = header_map(headers)
    assert hmap["Content-Type"] == "application/zip"
    assert hmap["Content-Length"] == str(len(zip_bytes))
    assert hmap["Cache-Control"] == "public, max-age=0, must-revalidate"
    assert hmap["Accept-Ranges"] == "bytes"
    assert hmap["Vary"] == "Accept-Encoding"
    assert hmap["X-Mobius-Version"] == "2024.09.01"
    assert hmap["Content-Disposition"].startswith('attachment; filename="artifact.zip"')
    assert "ETag" in hmap
    assert "Last-Modified" in hmap


def test_head_request_matches_metadata(tmp_path):
    make_zip(tmp_path, "artifact.zip")
    app = GatewayApplication(tmp_path, "secret")
    status, headers, body = run_request(
        app,
        "/exports/artifact.zip",
        method="HEAD",
        headers=authorized_headers("secret"),
    )

    assert status == "200 OK"
    assert body == b""
    hmap = header_map(headers)
    assert hmap["Content-Type"] == "application/zip"
    assert "Content-Length" in hmap


def test_etag_and_last_modified_revalidation(tmp_path):
    make_zip(tmp_path, "artifact.zip")
    app = GatewayApplication(tmp_path, "secret")
    status, headers, _ = run_request(
        app,
        "/exports/artifact.zip",
        headers=authorized_headers("secret"),
    )
    hmap = header_map(headers)
    etag = hmap["ETag"]
    last_modified = hmap["Last-Modified"]

    status2, headers2, body2 = run_request(
        app,
        "/exports/artifact.zip",
        headers={"X-Mobius-Key": "secret", "If-None-Match": etag},
    )
    assert status2 == "304 Not Modified"
    assert body2 == b""
    hmap2 = header_map(headers2)
    assert hmap2["ETag"] == etag

    status3, headers3, body3 = run_request(
        app,
        "/exports/artifact.zip",
        headers={"X-Mobius-Key": "secret", "If-Modified-Since": last_modified},
    )
    assert status3 == "304 Not Modified"
    assert body3 == b""


def test_if_modified_since_future_date(tmp_path):
    make_zip(tmp_path, "artifact.zip")
    app = GatewayApplication(tmp_path, "secret")
    future = (datetime.now(timezone.utc) + timedelta(days=1)).strftime("%a, %d %b %Y %H:%M:%S GMT")
    status, _, body = run_request(
        app,
        "/exports/artifact.zip",
        headers={"X-Mobius-Key": "secret", "If-Modified-Since": future},
    )
    assert status == "304 Not Modified"
    assert body == b""


def test_sha256_digest(tmp_path):
    _, zip_bytes = make_zip(tmp_path, "artifact.zip")
    app = GatewayApplication(tmp_path, "secret")
    expected = hashlib.sha256(zip_bytes).hexdigest()
    status, headers, body = run_request(
        app,
        "/exports/artifact.zip.sha256",
        headers=authorized_headers("secret"),
    )

    assert status == "200 OK"
    assert body.decode("utf-8") == f"{expected}  artifact.zip\n"
    hmap = header_map(headers)
    assert hmap["Content-Type"].startswith("text/plain")
    assert hmap["Cache-Control"] == "public, max-age=0, must-revalidate"


def test_unicode_content_disposition(tmp_path):
    make_zip(tmp_path, "ünïcødé.zip")
    app = GatewayApplication(tmp_path, "secret")
    status, headers, _ = run_request(
        app,
        "/exports/ünïcødé.zip",
        headers=authorized_headers("secret"),
    )
    hmap = header_map(headers)
    disposition = hmap["Content-Disposition"]
    assert "filename*=UTF-8''%C3%BCn%C3%AFc%C3%B8d%C3%A9.zip" in disposition


def test_authorization_required(tmp_path):
    make_zip(tmp_path, "artifact.zip")
    app = GatewayApplication(tmp_path, "secret")
    status, headers, _ = run_request(app, "/exports/artifact.zip")
    assert status == "401 Unauthorized"
    hmap = header_map(headers)
    assert hmap["WWW-Authenticate"].startswith("X-Mobius-Key")


def test_healthz_requires_key_by_default(tmp_path):
    app = GatewayApplication(tmp_path, "secret")
    status, _, _ = run_request(app, "/healthz")
    assert status == "401 Unauthorized"
    status2, _, body2 = run_request(app, "/healthz", headers=authorized_headers("secret"))
    assert status2 == "200 OK"
    assert body2 == b"ok"


def test_healthz_public_override(tmp_path):
    app = GatewayApplication(tmp_path, "secret", health_public=True)
    status, _, body = run_request(app, "/healthz")
    assert status == "200 OK"
    assert body == b"ok"


def test_cache_control_modes(tmp_path):
    make_zip(tmp_path, "artifact.zip")
    app = GatewayApplication(tmp_path, "secret", cache_mode="immutable")
    status, headers, _ = run_request(
        app,
        "/exports/artifact.zip",
        headers=authorized_headers("secret"),
    )
    assert header_map(headers)["Cache-Control"] == "public, max-age=31536000, immutable"

    app2 = GatewayApplication(tmp_path, "secret", cache_mode="no-store")
    status2, headers2, _ = run_request(
        app2,
        "/exports/artifact.zip",
        headers=authorized_headers("secret"),
    )
    assert header_map(headers2)["Cache-Control"] == "no-store"


def test_path_traversal_blocked(tmp_path):
    make_zip(tmp_path, "artifact.zip")
    app = GatewayApplication(tmp_path, "secret")
    status, _, _ = run_request(
        app,
        "/exports/../artifact.zip",
        headers=authorized_headers("secret"),
    )
    assert status == "404 Not Found"


def test_missing_export(tmp_path):
    app = GatewayApplication(tmp_path, "secret")
    status, _, _ = run_request(
        app,
        "/exports/missing.zip",
        headers=authorized_headers("secret"),
    )
    assert status == "404 Not Found"


def test_non_zip_extension_rejected(tmp_path):
    make_zip(tmp_path, "artifact.zip")
    app = GatewayApplication(tmp_path, "secret")
    status, _, _ = run_request(
        app,
        "/exports/artifact.tar.gz",
        headers=authorized_headers("secret"),
    )
    assert status == "404 Not Found"

