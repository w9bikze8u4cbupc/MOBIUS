from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from src.gateway.app import app


@pytest.fixture(autouse=True)
def configure_env(tmp_path, monkeypatch):
    exports_dir = tmp_path / "exports"
    exports_dir.mkdir()
    (exports_dir / "package.zip").write_bytes(b"payload")

    monkeypatch.setenv("EXPORTS_DIR", str(exports_dir))
    monkeypatch.setenv("GATEWAY_API_KEY", "test-key")
    monkeypatch.setenv("GATEWAY_LOG_DIR", str(tmp_path / "logs"))
    monkeypatch.delenv("GATEWAY_STRONG_ETAG", raising=False)

    yield


@pytest.fixture()
def client():
    with TestClient(app) as client:
        yield client


def _auth_headers():
    return {"X-Mobius-Key": "test-key"}


def test_get_returns_etag_and_last_modified(client):
    response = client.get("/exports/package.zip", headers=_auth_headers())

    assert response.status_code == 200
    assert "ETag" in response.headers
    assert "Last-Modified" in response.headers
    assert response.content == b"payload"


def test_head_respects_conditional_headers(client):
    response = client.get("/exports/package.zip", headers=_auth_headers())
    etag = response.headers["ETag"]
    last_modified = response.headers["Last-Modified"]

    head_response = client.head(
        "/exports/package.zip",
        headers={"If-None-Match": etag, "If-Modified-Since": last_modified, **_auth_headers()},
    )
    assert head_response.status_code == 304
    assert head_response.text == ""


def test_conditional_get_returns_304(client):
    initial = client.get("/exports/package.zip", headers=_auth_headers())
    etag = initial.headers["ETag"]

    conditional = client.get(
        "/exports/package.zip",
        headers={"If-None-Match": etag, **_auth_headers()},
    )

    assert conditional.status_code == 304
    assert conditional.content == b""


def test_last_modified_header_blocks_old_clients(client):
    response = client.get("/exports/package.zip", headers=_auth_headers())
    last_modified = response.headers["Last-Modified"]
    stale_time = (datetime.now(timezone.utc) - timedelta(days=1)).strftime(
        "%a, %d %b %Y %H:%M:%S GMT"
    )

    conditional = client.get(
        "/exports/package.zip",
        headers={"If-Modified-Since": last_modified, **_auth_headers()},
    )
    assert conditional.status_code == 304

    stale = client.get(
        "/exports/package.zip",
        headers={"If-Modified-Since": stale_time, **_auth_headers()},
    )
    assert stale.status_code == 200


def test_rejects_path_traversal(client):
    resp_relative = client.get("/exports/../escape.zip", headers=_auth_headers())
    resp_absolute = client.get("/exports//absolute.zip", headers=_auth_headers())

    assert resp_relative.status_code == 400
    assert resp_absolute.status_code == 400


def test_requires_api_key(client):
    response = client.get("/exports/package.zip")
    assert response.status_code == 401


def test_strong_etag_mode(monkeypatch):
    monkeypatch.setenv("GATEWAY_STRONG_ETAG", "true")
    with TestClient(app) as strong_client:
        response = strong_client.get(
            "/exports/package.zip", headers={"X-Mobius-Key": "test-key"}
        )

    assert response.status_code == 200
    assert not response.headers["ETag"].startswith("W/")


def test_custom_exports_dir_is_respected(tmp_path, monkeypatch):
    exports_dir = tmp_path / "custom"
    exports_dir.mkdir()
    file_path = exports_dir / "asset.zip"
    file_path.write_text("data")

    monkeypatch.setenv("EXPORTS_DIR", str(exports_dir))
    monkeypatch.setenv("GATEWAY_API_KEY", "another-key")

    with TestClient(app) as isolated_client:
        response = isolated_client.get(
            "/exports/asset.zip", headers={"X-Mobius-Key": "another-key"}
        )

    assert response.status_code == 200
    assert response.content == b"data"
