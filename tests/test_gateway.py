from __future__ import annotations

from pathlib import Path
from typing import Generator

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from services.gateway.app import _compute_strong_etag, create_app


@pytest.fixture()
def exports_dir(tmp_path: Path) -> Path:
    exports = tmp_path / "exports"
    exports.mkdir()
    (exports / "example.zip").write_bytes(b"example-zip-contents")
    return exports


@pytest.fixture()
def app(exports_dir: Path) -> FastAPI:
    return create_app(exports_dir)


@pytest.fixture(name="_exports_dir")
def _exports_dir_fixture(exports_dir: Path) -> Path:
    return exports_dir


@pytest.fixture()
def client(app) -> Generator[TestClient, None, None]:
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture()
def expected_etag(exports_dir: Path) -> str:
    return _compute_strong_etag(exports_dir / "example.zip")


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
    # Send multiple validators (one weak, one wrong, one correct)
    # Server should treat weak as matching if underlying tag matches.
    validators = f'W/"not-it", "nope", W/{expected_etag}'
    r = client.get("/exports/example.zip", headers={"If-None-Match": validators})
    assert r.status_code == 304
    assert r.headers.get("ETag") == expected_etag


def test_successful_download(client: TestClient, _exports_dir: Path) -> None:
    response = client.get("/exports/example.zip")
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/zip"
    assert "ETag" in response.headers
    assert response.content
