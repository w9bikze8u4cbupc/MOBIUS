import hashlib
import importlib
from pathlib import Path
from urllib.parse import quote
import zipfile
import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import pytest

from gateway.framework import TestClient


def build_app(monkeypatch, export_dir: Path, *, health_public: bool = False):
    monkeypatch.setenv("MOBIUS_EXPORT_ROOT", str(export_dir))
    monkeypatch.setenv("MOBIUS_GATEWAY_KEY", "secret")
    if health_public:
        monkeypatch.setenv("MOBIUS_HEALTH_PUBLIC", "1")
    else:
        monkeypatch.delenv("MOBIUS_HEALTH_PUBLIC", raising=False)

    import gateway.config as config
    import gateway.files as files
    import gateway.security as security
    import gateway.app as app_module

    importlib.reload(config)
    importlib.reload(files)
    importlib.reload(security)
    importlib.reload(app_module)

    return app_module


@pytest.fixture
def sample_export(tmp_path, monkeypatch):
    export_name = "café data"
    zip_path = tmp_path / f"{export_name}.zip"
    with zipfile.ZipFile(zip_path, "w") as archive:
        archive.writestr("readme.txt", "Hello from MOBIUS!")
    app_module = build_app(monkeypatch, tmp_path)
    client = TestClient(app_module.app)
    encoded_name = quote(export_name, safe="")
    return client, export_name, encoded_name, zip_path


def test_export_includes_expected_headers(sample_export):
    client, export_name, encoded_name, zip_path = sample_export
    response = client.get(
        f"/exports/{encoded_name}.zip",
        headers={"X-Mobius-Key": "secret"},
    )
    assert response.status_code == 200
    assert response.headers["Content-Type"] == "application/zip"
    assert response.headers["Cache-Control"] == "public, max-age=0, must-revalidate"
    assert response.headers["Vary"] == "Accept-Encoding"
    assert response.headers["Accept-Ranges"] == "bytes"
    assert response.headers["Content-Length"] == str(zip_path.stat().st_size)

    etag = response.headers["ETag"]
    assert etag.startswith('"') and etag.endswith('"')
    expected_digest = hashlib.sha256(zip_path.read_bytes()).hexdigest()
    assert etag.strip('"') == expected_digest

    content_disposition = response.headers["Content-Disposition"]
    assert "filename=\"cafe_data.zip\"" in content_disposition
    assert f"filename*=UTF-8''{quote(export_name + '.zip', safe='')}" in content_disposition

    # Content should match the file on disk.
    assert response.content == zip_path.read_bytes()


def test_export_supports_revalidation(sample_export):
    client, export_name, encoded_name, zip_path = sample_export
    first = client.get(
        f"/exports/{encoded_name}.zip",
        headers={"X-Mobius-Key": "secret"},
    )
    etag = first.headers["ETag"]
    last_modified = first.headers["Last-Modified"]

    second = client.get(
        f"/exports/{encoded_name}.zip",
        headers={"X-Mobius-Key": "secret", "If-None-Match": etag},
    )
    assert second.status_code == 304
    assert second.content == b""

    third = client.get(
        f"/exports/{encoded_name}.zip",
        headers={"X-Mobius-Key": "secret", "If-Modified-Since": last_modified},
    )
    assert third.status_code == 304


def test_signature_matches_digest(sample_export):
    client, export_name, encoded_name, zip_path = sample_export
    response = client.get(
        f"/exports/{encoded_name}.zip.sha256",
        headers={"X-Mobius-Key": "secret"},
    )
    assert response.status_code == 200
    assert response.headers["Content-Type"] == "text/plain; charset=utf-8"
    assert response.headers["Cache-Control"] == "public, max-age=0, must-revalidate"
    expected_digest = hashlib.sha256(zip_path.read_bytes()).hexdigest()
    assert response.text == expected_digest

    cached = client.get(
        f"/exports/{encoded_name}.zip.sha256",
        headers={"X-Mobius-Key": "secret", "If-None-Match": response.headers["ETag"]},
    )
    assert cached.status_code == 304


def test_missing_or_invalid_exports_are_not_served(sample_export):
    client, *_ = sample_export
    missing = client.get(
        "/exports/missing.zip",
        headers={"X-Mobius-Key": "secret"},
    )
    assert missing.status_code == 404

    traversal = client.get(
        "/exports/../secret.zip",
        headers={"X-Mobius-Key": "secret"},
    )
    assert traversal.status_code == 404


def test_api_key_required(sample_export):
    client, export_name, encoded_name, _ = sample_export
    denied = client.get(f"/exports/{encoded_name}.zip")
    assert denied.status_code == 403


def test_health_requires_key_by_default(tmp_path, monkeypatch):
    app_module = build_app(monkeypatch, tmp_path)
    client = TestClient(app_module.app)

    forbidden = client.get("/healthz")
    assert forbidden.status_code == 403

    allowed = client.get("/healthz", headers={"X-Mobius-Key": "secret"})
    assert allowed.status_code == 200
    payload = allowed.json()
    assert payload["status"] == "ok"
    assert payload["version"] == app_module.SETTINGS.version


def test_health_can_be_public(tmp_path, monkeypatch):
    app_module = build_app(monkeypatch, tmp_path, health_public=True)
    client = TestClient(app_module.app)
    response = client.get("/healthz")
    assert response.status_code == 200
