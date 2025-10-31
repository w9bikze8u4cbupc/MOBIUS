from __future__ import annotations

import hashlib
import os
import sys
from pathlib import Path
from typing import Dict

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from fastapi.testclient import TestClient

from src.gateway.app import create_app


def _auth_headers() -> Dict[str, str]:
    return {"x-mobius-key": "secret"}


def _setup(tmp_path: Path, monkeypatch) -> TestClient:
    exports = tmp_path / "exports"
    exports.mkdir()
    logs = tmp_path / "logs"
    logs.mkdir()
    monkeypatch.setenv("EXPORTS_DIR", str(exports))
    monkeypatch.setenv("LOG_DIR", str(logs))
    monkeypatch.setenv("MOBIUS_API_KEY", "secret")
    app = create_app()
    return TestClient(app)


def test_cdn_like_flow(tmp_path: Path, monkeypatch) -> None:
    client = _setup(tmp_path, monkeypatch)
    exports = Path(os.environ["EXPORTS_DIR"])  # type: ignore[index]
    target = exports / "alpha.zip"
    target.write_bytes(b"A" * 10)

    response = client.get("/exports/alpha.zip", headers=_auth_headers())
    assert response.status_code == 200
    etag = response.headers.get("ETag")
    last_modified = response.headers.get("Last-Modified")
    assert etag
    assert last_modified

    response2 = client.get(
        "/exports/alpha.zip",
        headers={**_auth_headers(), "If-None-Match": etag},
    )
    assert response2.status_code in (200, 304)

    response3 = client.get(
        "/exports/alpha.zip",
        headers={**_auth_headers(), "If-Modified-Since": last_modified},
    )
    assert response3.status_code in (200, 304)


def test_sha256_signature(tmp_path: Path, monkeypatch) -> None:
    client = _setup(tmp_path, monkeypatch)
    exports = Path(os.environ["EXPORTS_DIR"])  # type: ignore[index]
    payload = b"hello-zip"
    (exports / "signed.zip").write_bytes(payload)

    response = client.get("/exports/signed.zip.sha256", headers=_auth_headers())
    assert response.status_code == 200
    assert response.text.strip() == hashlib.sha256(payload).hexdigest()
