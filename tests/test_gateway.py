from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import services.gateway.app as gateway


@pytest.fixture(autouse=True)
def clean_exports(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(gateway, "EXPORTS_ROOT", tmp_path)
    tmp_path.mkdir(parents=True, exist_ok=True)
    yield
    for child in tmp_path.iterdir():
        if child.is_file():
            child.unlink()


def get_client() -> TestClient:
    app = gateway.create_app()
    return TestClient(app)


def test_download_sets_cache_headers():
    client = get_client()
    target = gateway.EXPORTS_ROOT / "a.zip"
    target.write_bytes(b"x")

    response = client.get("/exports/a.zip")

    assert response.status_code == 200
    assert "ETag" in response.headers and response.headers["ETag"].startswith('"')
    assert "Last-Modified" in response.headers
    assert response.headers["Cache-Control"] == "public, max-age=3600, must-revalidate"
    disposition = response.headers.get("content-disposition", "")
    assert 'attachment; filename="a.zip"' in disposition.lower()


def test_conditional_get_304():
    client = get_client()
    target = gateway.EXPORTS_ROOT / "b.zip"
    target.write_bytes(b"x")

    etag = client.get("/exports/b.zip").headers["ETag"]

    response = client.get("/exports/b.zip", headers={"If-None-Match": etag})

    assert response.status_code == 304
    assert response.content == b""


def test_path_traversal_is_blocked():
    client = get_client()

    response = client.get("/exports/../../etc/passwd")

    assert response.status_code in (400, 404)
