import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

TEST_EXPORTS_ROOT = Path(__file__).parent / "exports"
os.environ["EXPORTS_ROOT"] = str(TEST_EXPORTS_ROOT)

from services.gateway import app as gateway_app  # noqa: E402

client = TestClient(gateway_app.app)


@pytest.fixture(autouse=True)
def clean_exports_root():
    TEST_EXPORTS_ROOT.mkdir(parents=True, exist_ok=True)
    for child in TEST_EXPORTS_ROOT.iterdir():
        if child.is_file():
            child.unlink()
    yield
    for child in TEST_EXPORTS_ROOT.iterdir():
        if child.is_file():
            child.unlink()


def test_health_check():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_download_export_success_and_etag():
    export_name = "demo.zip"
    file_path = TEST_EXPORTS_ROOT / export_name
    file_path.write_bytes(b"PK\x03\x04demo")

    response = client.get(f"/exports/{export_name}")

    assert response.status_code == 200
    assert response.headers.get("etag", "").startswith('W/"')
    assert response.headers["content-type"] == "application/zip"
    assert response.content == b"PK\x03\x04demo"


def test_download_export_etag_conditional_get():
    export_name = "etag-demo.zip"
    file_path = TEST_EXPORTS_ROOT / export_name
    file_path.write_bytes(b"PK\x03\x04etag")

    first = client.get(f"/exports/{export_name}")
    etag = first.headers["etag"]

    second = client.get(
        f"/exports/{export_name}", headers={"if-none-match": etag}
    )

    assert first.status_code == 200
    assert second.status_code == 304
    assert second.content == b""
    assert second.headers.get("etag") == etag


def test_download_export_invalid_name():
    response = client.get("/exports/../secrets.txt")
    assert response.status_code == 404


def test_download_export_missing_file():
    response = client.get("/exports/missing.zip")
    assert response.status_code == 404
    assert response.json()["detail"] == "Export not ready"


def test_download_export_subdirectory_not_allowed():
    nested_dir = TEST_EXPORTS_ROOT / "nested"
    nested_dir.mkdir(exist_ok=True)
    file_path = nested_dir / "nested.zip"
    file_path.write_bytes(b"PK\x03\x04nested")

    response = client.get("/exports/nested/nested.zip")
    assert response.status_code == 404
