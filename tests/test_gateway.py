"""Tests for the FastAPI gateway service."""

from __future__ import annotations

import hashlib
from pathlib import Path
from typing import Iterator

import pytest

pytest.importorskip("fastapi")

from fastapi.testclient import TestClient

from services.gateway.app import create_app


@pytest.fixture()
def export_root(tmp_path: Path) -> Path:
    data = b"example-zip-contents"
    export_file = tmp_path / "example.zip"
    export_file.write_bytes(data)
    return tmp_path


@pytest.fixture()
def client(export_root: Path) -> Iterator[TestClient]:
    app = create_app(export_root)
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture()
def expected_etag(export_root: Path) -> str:
    export_file = export_root / "example.zip"
    digest = hashlib.sha256(export_file.read_bytes()).hexdigest()
    return f'"{digest}"'


def test_health_endpoint(client: TestClient) -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_fetch_export_success(client: TestClient, expected_etag: str) -> None:
    response = client.get("/exports/example.zip")
    assert response.status_code == 200
    assert response.content == b"example-zip-contents"
    assert response.headers.get("ETag") == expected_etag
    assert (
        response.headers.get("Cache-Control")
        == "public, max-age=3600, must-revalidate"
    )
    content_disposition = response.headers.get("content-disposition", "")
    assert "attachment" in content_disposition.lower()
    assert "example.zip" in content_disposition


def test_fetch_export_conditional_hit(client: TestClient, expected_etag: str) -> None:
    cached = client.get(
        "/exports/example.zip", headers={"If-None-Match": expected_etag}
    )
    assert cached.status_code == 304
    assert cached.content == b""
    assert cached.headers.get("ETag") == expected_etag


def test_fetch_export_conditional_miss(client: TestClient) -> None:
    miss = client.get(
        "/exports/example.zip", headers={"If-None-Match": 'W/"bogus"'}
    )
    assert miss.status_code == 200
    assert miss.content == b"example-zip-contents"


def test_fetch_export_invalid_name(client: TestClient) -> None:
    response = client.get("/exports/Example.zip")
    assert response.status_code == 400


def test_fetch_export_missing_file(client: TestClient) -> None:
    response = client.get("/exports/missing.zip")
    assert response.status_code == 404


def test_head_export_success(client: TestClient, expected_etag: str) -> None:
    response = client.head("/exports/example.zip")
    assert response.status_code == 200
    assert response.headers.get("ETag") == expected_etag
    assert response.headers.get("Cache-Control") == "public, max-age=3600, must-revalidate"
    assert response.content == b""


def test_head_export_conditional_hit(client: TestClient, expected_etag: str) -> None:
    response = client.head(
        "/exports/example.zip", headers={"If-None-Match": expected_etag}
    )
    assert response.status_code == 304
    assert response.content == b""


def test_head_export_missing(client: TestClient) -> None:
    response = client.head("/exports/missing.zip")
    assert response.status_code == 404
