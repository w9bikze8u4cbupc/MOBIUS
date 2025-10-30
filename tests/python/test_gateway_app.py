from __future__ import annotations

import hashlib
from email.utils import parsedate_to_datetime
from pathlib import Path
from tempfile import TemporaryDirectory

import pytest
from fastapi.testclient import TestClient

from services.gateway import create_app


@pytest.fixture()
def export_dir() -> Path:
    with TemporaryDirectory() as tmp:
        yield Path(tmp)


def _write_zip(path: Path, data: bytes = b"payload") -> None:
    path.write_bytes(data)


def _expected_strong_etag(path: Path) -> str:
    digest = hashlib.sha256()
    digest.update(path.read_bytes())
    return f'"{digest.hexdigest()}"'


@pytest.fixture()
def client(export_dir: Path) -> TestClient:
    app = create_app(export_dir)
    return TestClient(app)


def test_health_endpoint(client: TestClient) -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_successful_download_includes_cache_headers(client: TestClient, export_dir: Path) -> None:
    export_path = export_dir / "example.zip"
    _write_zip(export_path)

    response = client.get("/exports/example.zip")
    assert response.status_code == 200
    assert response.headers["Cache-Control"] == "public, max-age=3600, must-revalidate"
    assert response.headers["Content-Disposition"] == 'attachment; filename="example.zip"'
    assert "Last-Modified" in response.headers
    last_modified = parsedate_to_datetime(response.headers["Last-Modified"])
    assert last_modified.tzinfo is not None
    assert response.headers["ETag"] == _expected_strong_etag(export_path)
    assert response.content == export_path.read_bytes()


def test_conditional_get_uses_etag(client: TestClient, export_dir: Path) -> None:
    export_path = export_dir / "conditional.zip"
    _write_zip(export_path, b"v1")

    etag = _expected_strong_etag(export_path)

    response = client.get("/exports/conditional.zip", headers={"if-none-match": etag})
    assert response.status_code == 304
    assert response.content == b""
    assert response.headers["ETag"] == etag


def test_head_returns_headers_without_body(client: TestClient, export_dir: Path) -> None:
    export_path = export_dir / "header.zip"
    _write_zip(export_path)

    response = client.head("/exports/header.zip")
    assert response.status_code == 200
    assert response.content == b""
    assert response.headers["ETag"] == _expected_strong_etag(export_path)


def test_head_respects_if_none_match(client: TestClient, export_dir: Path) -> None:
    export_path = export_dir / "etaghead.zip"
    _write_zip(export_path)

    etag = _expected_strong_etag(export_path)
    response = client.head("/exports/etaghead.zip", headers={"if-none-match": etag})
    assert response.status_code == 304
    assert response.content == b""


def test_invalid_name_returns_400(client: TestClient) -> None:
    response = client.get("/exports/INVALID.zip")
    assert response.status_code == 400
    assert response.json() == {
        "error": "http_error",
        "detail": "export name must be lower-case and end with .zip",
    }


def test_missing_file_returns_404(client: TestClient) -> None:
    response = client.get("/exports/missing.zip")
    assert response.status_code == 404
    assert response.json() == {"error": "http_error", "detail": "export not found"}


def test_long_name_within_limit_succeeds(client: TestClient, export_dir: Path) -> None:
    stem = "a" * 120
    name = f"{stem}.zip"
    export_path = export_dir / name
    _write_zip(export_path)

    response = client.get(f"/exports/{name}")
    assert response.status_code == 200
    assert response.headers["Content-Disposition"] == f'attachment; filename="{name}"'


def test_weak_etag_mode(export_dir: Path) -> None:
    export_path = export_dir / "weak.zip"
    _write_zip(export_path)

    app = create_app(export_dir, use_weak_etag=True)
    test_client = TestClient(app)
    response = test_client.get("/exports/weak.zip")
    assert response.status_code == 200
    assert response.headers["ETag"].startswith("W/")


def test_internal_error_returns_uniform_payload(export_dir: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    export_path = export_dir / "boom.zip"
    _write_zip(export_path)

    app = create_app(export_dir)

    async def broken(*_: object, **__: object) -> None:
        raise RuntimeError("explode")

    monkeypatch.setattr("services.gateway.app._serve_export", broken)
    client = TestClient(app)

    response = client.get("/exports/boom.zip")
    assert response.status_code == 500
    assert response.json() == {"error": "internal_error", "detail": "explode"}


def test_rejects_names_over_limit(client: TestClient) -> None:
    name = "a" * 200 + ".zip"
    response = client.get(f"/exports/{name}")
    assert response.status_code == 400
    assert response.json()["detail"] == "export name must be lower-case and end with .zip"
