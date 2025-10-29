import zipfile
from pathlib import Path

import pytest

pytest.importorskip("fastapi")

from fastapi.testclient import TestClient

from services.gateway.app import create_app


@pytest.fixture()
def exports_dir(tmp_path: Path) -> Path:
    archive = tmp_path / "example.zip"
    with zipfile.ZipFile(archive, "w") as zf:
        zf.writestr("hello.txt", "hello")
    return tmp_path


@pytest.fixture()
def client(exports_dir: Path) -> TestClient:
    app = create_app(exports_dir)
    return TestClient(app)


def test_health(client: TestClient) -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_successful_download(client: TestClient, exports_dir: Path) -> None:
    response = client.get("/exports/example.zip")
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/zip"
    assert "ETag" in response.headers
    assert response.content


def test_caching_behavior(client: TestClient) -> None:
    first = client.get("/exports/example.zip")
    etag = first.headers["ETag"]

    second = client.get("/exports/example.zip", headers={"If-None-Match": etag})
    assert second.status_code == 304
    assert second.headers["ETag"] == etag


@pytest.mark.parametrize("export_name", ["not-a-zip.txt", "../escape.zip", "name.zip/.zip"])
def test_malformed_names(client: TestClient, export_name: str) -> None:
    response = client.get(f"/exports/{export_name}")
    assert response.status_code == 400


def test_missing_file(client: TestClient) -> None:
    response = client.get("/exports/missing.zip")
    assert response.status_code == 404
