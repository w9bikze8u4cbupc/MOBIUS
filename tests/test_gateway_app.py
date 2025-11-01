from __future__ import annotations

import hashlib
import sys
from pathlib import Path
from typing import Dict, Iterable, Tuple
from urllib.parse import quote

import pytest
from wsgiref.util import setup_testing_defaults

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.gateway import ExportGateway


@pytest.fixture()
def export_root(tmp_path: Path) -> Path:
    root = tmp_path / "exports"
    root.mkdir()
    (root / "alpha.zip").write_bytes(b"zip-bytes-1")
    (root / "unicode 📦.zip").write_bytes("payload".encode("utf-8"))
    return root


@pytest.fixture()
def app(export_root: Path) -> ExportGateway:
    return ExportGateway(export_root, "secret")


def _request(app: ExportGateway, path: str, *, method: str = "GET", headers: Dict[str, str] | None = None):
    environ: Dict[str, str] = {}
    setup_testing_defaults(environ)
    environ["PATH_INFO"] = path
    environ["REQUEST_METHOD"] = method
    if headers:
        for key, value in headers.items():
            environ[f"HTTP_{key.upper().replace('-', '_')}"] = value

    captured: Dict[str, object] = {}

    def start_response(status: str, header_list: Iterable[Tuple[str, str]]):
        captured["status"] = status
        captured["headers"] = {k: v for k, v in header_list}

    result_iter = app(environ, start_response)
    body = b"".join(result_iter)
    captured["body"] = body
    return captured


def test_zip_requires_auth(app: ExportGateway):
    response = _request(app, "/alpha.zip")
    assert response["status"].startswith("401")
    headers = response["headers"]
    assert headers["Cache-Control"] == "no-store"
    assert "X-Mobius-Key" in headers["WWW-Authenticate"]


def test_zip_success_returns_file(app: ExportGateway):
    response = _request(
        app,
        "/alpha.zip",
        headers={"X-Mobius-Key": "secret"},
    )
    assert response["status"].startswith("200")
    headers = response["headers"]
    assert headers["Content-Type"] == "application/zip"
    assert "immutable" in headers["Cache-Control"]
    assert response["body"] == b"zip-bytes-1"
    assert headers["Content-Disposition"].startswith("attachment")


def test_manifest_streams_checksum(app: ExportGateway, export_root: Path):
    response = _request(
        app,
        "/alpha.sha256",
        headers={"X-Mobius-Key": "secret"},
    )
    assert response["status"].startswith("200")
    headers = response["headers"]
    assert headers["Cache-Control"] == "public, max-age=0, must-revalidate"
    expected = hashlib.sha256((export_root / "alpha.zip").read_bytes()).hexdigest()
    assert response["body"].endswith(f"= {expected}\n".encode("utf-8"))


def test_unicode_filename_content_disposition(app: ExportGateway):
    quoted = quote("unicode 📦.zip")
    response = _request(
        app,
        f"/{quoted}",
        headers={"X-Mobius-Key": "secret"},
    )
    headers = response["headers"]
    assert "filename*=" in headers["Content-Disposition"]
    assert "%F0%9F%93%A6" in headers["Content-Disposition"]


def test_path_traversal_rejected(app: ExportGateway):
    response = _request(
        app,
        "/../alpha.zip",
        headers={"X-Mobius-Key": "secret"},
    )
    assert response["status"].startswith("404")


def test_conditional_get_uses_etag(app: ExportGateway):
    first = _request(
        app,
        "/alpha.zip",
        headers={"X-Mobius-Key": "secret"},
    )
    etag = first["headers"]["ETag"]
    second = _request(
        app,
        "/alpha.zip",
        headers={"X-Mobius-Key": "secret", "If-None-Match": etag},
    )
    assert second["status"].startswith("304")
    assert second["body"] == b""


def test_health_public_access(export_root: Path):
    public_app = ExportGateway(export_root, "secret", health_public=True)
    response = _request(public_app, "/health")
    assert response["status"].startswith("200")
    assert response["body"]


def test_manifest_head_includes_length(app: ExportGateway):
    response = _request(
        app,
        "/alpha.sha256",
        method="HEAD",
        headers={"X-Mobius-Key": "secret"},
    )
    assert response["status"].startswith("200")
    assert response["headers"]["Content-Length"]
    assert response["body"] == b""
