from __future__ import annotations

import os
import zipfile
from email.utils import formatdate
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from services.gateway.app import MAX_NAME_LEN, create_app


@pytest.fixture()
def zip_export(tmp_path: Path) -> Path:
    archive = tmp_path / "sample.zip"
    with zipfile.ZipFile(archive, "w") as zf:
        zf.writestr("data.txt", "payload")
    return archive


@pytest.fixture()
def client(tmp_path: Path, zip_export: Path) -> TestClient:
    base_dir = tmp_path
    # ensure the export fixture is inside the tmp_path base directory
    if zip_export.parent != base_dir:
        os.replace(zip_export, base_dir / zip_export.name)
    app = create_app(base_dir)
    return TestClient(app)


def test_fetch_export_includes_additional_headers(client: TestClient, zip_export: Path) -> None:
    response = client.get(f"/exports/{zip_export.name}")
    assert response.status_code == 200
    content_disposition = response.headers.get("Content-Disposition")
    assert content_disposition == f'attachment; filename="{zip_export.name}"'

    expected_last_modified = formatdate(zip_export.stat().st_mtime, usegmt=True)
    assert response.headers.get("Last-Modified") == expected_last_modified
    assert response.headers.get("Cache-Control") == "public, max-age=3600, must-revalidate"


def test_get_uses_if_none_match_validators(client: TestClient, zip_export: Path) -> None:
    initial = client.get(f"/exports/{zip_export.name}")
    etag = initial.headers["ETag"]
    validators = f'W/"mismatch", "other", W/{etag}'
    response = client.get(
        f"/exports/{zip_export.name}", headers={"If-None-Match": validators}
    )
    assert response.status_code == 304
    assert response.content == b""
    assert response.headers["ETag"] == etag


def test_head_export_supports_conditional_requests(client: TestClient, zip_export: Path) -> None:
    initial = client.head(f"/exports/{zip_export.name}")
    assert initial.status_code == 200
    etag = initial.headers["ETag"]

    second = client.head(
        f"/exports/{zip_export.name}", headers={"If-None-Match": etag}
    )
    assert second.status_code == 304
    assert second.content == b""
    assert second.headers["ETag"] == etag


def test_rejects_overlong_export_name(client: TestClient, tmp_path: Path) -> None:
    long_name = "a" * (MAX_NAME_LEN - len(".zip") + 1) + ".zip"
    response = client.get(f"/exports/{long_name}")
    assert response.status_code == 400


def test_if_none_match_wildcard_returns_not_modified(client: TestClient, zip_export: Path) -> None:
    response = client.get(
        f"/exports/{zip_export.name}", headers={"If-None-Match": "*"}
    )
    assert response.status_code == 304
    assert response.content == b""
