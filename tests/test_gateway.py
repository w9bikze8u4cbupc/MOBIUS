from __future__ import annotations

import hashlib
from pathlib import Path
from typing import Generator

import pytest
from fastapi.testclient import TestClient

from services.gateway.app import create_app


@pytest.fixture()
def exports_dir(tmp_path: Path) -> Generator[Path, None, None]:
    exports = tmp_path / "exports"
    exports.mkdir()
    (exports / "example.zip").write_bytes(b"example-zip-contents")
    yield exports


@pytest.fixture()
def client(exports_dir: Path) -> Generator[TestClient, None, None]:
    app = create_app(base_dir=exports_dir)
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture()
def expected_etag(exports_dir: Path) -> str:
    sha = hashlib.sha256()
    sha.update((exports_dir / "example.zip").read_bytes())
    return f'"{sha.hexdigest()}"'


def test_caching_behavior(client: TestClient) -> None:
    first = client.get("/exports/example.zip")
    etag = first.headers["ETag"]

    second = client.get("/exports/example.zip", headers={"If-None-Match": etag})
    assert second.status_code == 304
    assert second.headers["ETag"] == etag


def test_fetch_export_conditional_hit(client: TestClient, expected_etag: str) -> None:
    cached = client.get("/exports/example.zip", headers={"If-None-Match": expected_etag})
    assert cached.status_code == 304
    assert cached.content == b""
    assert cached.headers.get("ETag") == expected_etag


def test_fetch_export_conditional_miss(client: TestClient) -> None:
    miss = client.get("/exports/example.zip", headers={"If-None-Match": 'W/"bogus"'})
    assert miss.status_code == 200
    assert miss.content == b"example-zip-contents"


def test_if_none_match_multiple_and_weak(client: TestClient, expected_etag: str) -> None:
    validators = f'W/"not-it", "nope", W/{expected_etag}'
    response = client.get("/exports/example.zip", headers={"If-None-Match": validators})
    assert response.status_code == 304
    assert response.headers.get("ETag") == expected_etag


def test_successful_download(client: TestClient, exports_dir: Path) -> None:
    _ = exports_dir  # ensure fixture is exercised for setup
    response = client.get("/exports/example.zip")
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/zip"
    assert "ETag" in response.headers
    assert response.content
