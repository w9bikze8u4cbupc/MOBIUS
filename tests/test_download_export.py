from __future__ import annotations

import shutil
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from services.gateway.app import EXPORTS_ROOT, create_app


@pytest.fixture(scope="module")
def client() -> TestClient:
    return TestClient(create_app())


@pytest.fixture(autouse=True)
def clean_exports_root() -> None:
    EXPORTS_ROOT.mkdir(parents=True, exist_ok=True)
    for child in EXPORTS_ROOT.iterdir():
        if child.is_file():
            child.unlink()
        elif child.is_dir():
            shutil.rmtree(child)
    yield
    for child in EXPORTS_ROOT.iterdir():
        if child.is_file():
            child.unlink()
        elif child.is_dir():
            shutil.rmtree(child)


def _write_export(path: Path, content: bytes = b"example") -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(content)
    return path


def test_health_endpoint(client: TestClient) -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_download_existing_export(client: TestClient) -> None:
    export_path = _write_export(EXPORTS_ROOT / "reports" / "example.txt")

    response = client.get("/exports/reports/example.txt")

    assert response.status_code == 200
    assert response.content == export_path.read_bytes()


def test_download_missing_export(client: TestClient) -> None:
    response = client.get("/exports/missing.txt")

    assert response.status_code == 404


def test_fixture_removes_nested_directories(client: TestClient) -> None:
    nested_dir = EXPORTS_ROOT / "nested" / "inner"
    nested_dir.mkdir(parents=True, exist_ok=True)
    _write_export(nested_dir / "file.txt")

    response = client.get("/exports/nested/inner/file.txt")
    assert response.status_code == 200


def test_exports_root_is_clean_between_tests() -> None:
    assert all(not child.is_dir() for child in EXPORTS_ROOT.iterdir())
