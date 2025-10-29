
from fastapi.testclient import TestClient

from services.gateway.app import app, EXPORTS_ROOT

client = TestClient(app)


def setup_module() -> None:
    EXPORTS_ROOT.mkdir(parents=True, exist_ok=True)


def teardown_module() -> None:
    for path in EXPORTS_ROOT.glob("*.zip"):
        try:
            path.unlink()
        except FileNotFoundError:
            pass


def test_404_on_bad_name() -> None:
    response = client.get("/exports/../../evil.zip")
    assert response.status_code == 404


def test_404_on_wrong_ext() -> None:
    response = client.get("/exports/demo.tar.gz")
    assert response.status_code == 404


def test_404_when_missing() -> None:
    response = client.get("/exports/missing.zip")
    assert response.status_code == 404


def test_serves_zip_with_headers() -> None:
    zip_path = EXPORTS_ROOT / "demo.zip"
    zip_path.write_bytes(b"PK\x03\x04stub")

    response = client.get("/exports/demo.zip")

    try:
        assert response.status_code == 200
        assert response.headers["content-type"] == "application/zip"
        cd = response.headers.get("content-disposition", "")
        assert "attachment" in cd and "demo.zip" in cd
        assert "etag" in {key.lower() for key in response.headers.keys()}
        assert response.content.startswith(b"PK\x03\x04")
    finally:
        zip_path.unlink(missing_ok=True)
