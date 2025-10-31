from __future__ import annotations

import json
from pathlib import Path

from .conftest import MutableClock


def _auth_headers() -> dict[str, str]:
    return {"X-Mobius-Key": "secret", "User-Agent": "pytest-agent/1.0"}


def test_only_zip_allowed(client, exports_dir):
    Path(exports_dir, "notes.txt").write_text("hello", encoding="utf-8")
    response = client.get("/exports/notes.txt", headers=_auth_headers())
    assert response.status_code == 404


def test_safe_name_regex(client, exports_dir):
    Path(exports_dir, "good.zip").write_bytes(b"data")
    response = client.get("/exports/Bad Name!.zip", headers=_auth_headers())
    assert response.status_code == 404


def test_content_disposition_unicode(client, exports_dir):
    name = "rapport_échantillon.zip"
    Path(exports_dir, name).write_bytes(b"x")
    response = client.get(f"/exports/{name}", headers=_auth_headers())
    content_disposition = response.headers.get("Content-Disposition", "")
    assert "filename*=" in content_disposition
    assert "rapport_%C3%A9chantillon.zip" in content_disposition


def test_head_uses_offline_headers(client, exports_dir):
    file_path = Path(exports_dir, "archive.zip")
    file_path.write_bytes(b"payload")
    response = client.head("/exports/archive.zip", headers=_auth_headers())
    assert response.status_code == 200
    assert response.headers["Accept-Ranges"] == "bytes"
    assert response.headers["Content-Type"] == "application/zip"


def test_if_none_match_returns_304(client, exports_dir):
    file_path = Path(exports_dir, "etag.zip")
    file_path.write_bytes(b"payload")
    initial = client.get("/exports/etag.zip", headers=_auth_headers())
    etag = initial.headers["ETag"]
    follow_up = client.get(
        "/exports/etag.zip",
        headers={**_auth_headers(), "If-None-Match": etag},
    )
    assert follow_up.status_code == 304


def test_if_modified_since_returns_304(client, exports_dir):
    file_path = Path(exports_dir, "modified.zip")
    file_path.write_bytes(b"payload")
    initial = client.get("/exports/modified.zip", headers=_auth_headers())
    last_modified = initial.headers["Last-Modified"]
    follow_up = client.get(
        "/exports/modified.zip",
        headers={**_auth_headers(), "If-Modified-Since": last_modified},
    )
    assert follow_up.status_code == 304


def test_requires_api_key(client, exports_dir):
    Path(exports_dir, "secure.zip").write_bytes(b"x")
    response = client.get("/exports/secure.zip")
    assert response.status_code == 401


def test_audit_log_includes_metadata(client, exports_dir, logs_dir, clock: MutableClock):
    Path(exports_dir, "audit.zip").write_bytes(b"x")
    client.get("/exports/audit.zip", headers=_auth_headers())
    log_files = sorted(Path(logs_dir).glob("audit-*.log"))
    assert len(log_files) == 1
    payload = json.loads(log_files[0].read_text(encoding="utf-8").splitlines()[-1])
    assert payload["path"] == "/exports/audit.zip"
    assert payload.get("client_ip")
    assert payload.get("user_agent") == "pytest-agent/1.0"


def test_audit_rotation_by_day(client, exports_dir, logs_dir, clock: MutableClock):
    Path(exports_dir, "rotation.zip").write_bytes(b"x")
    client.get("/exports/rotation.zip", headers=_auth_headers())
    clock.advance(days=1)
    client.get("/exports/rotation.zip", headers=_auth_headers())
    log_files = sorted(Path(logs_dir).glob("audit-*.log"))
    assert len(log_files) == 2


def test_security_headers_present(client, exports_dir):
    Path(exports_dir, "secure.zip").write_bytes(b"x")
    response = client.get("/exports/secure.zip", headers=_auth_headers())
    assert response.headers["X-Content-Type-Options"] == "nosniff"
    assert response.headers["Referrer-Policy"] == "no-referrer"


def test_healthz_requires_auth(client):
    response = client.get("/healthz", headers=_auth_headers())
    assert response.status_code == 200
    unauthenticated = client.get("/healthz")
    assert unauthenticated.status_code == 401
