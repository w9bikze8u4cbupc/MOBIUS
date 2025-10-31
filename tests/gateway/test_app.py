from __future__ import annotations

import hashlib
import os
import sys
from io import BytesIO
from pathlib import Path
from urllib.parse import quote

import pytest

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from gateway import application


def call_app(
    path: str,
    *,
    method: str = "GET",
    headers: dict[str, str] | None = None,
    query_string: str = "",
    body: bytes = b"",
) -> tuple[str, dict[str, str], bytes]:
    environ: dict[str, str] = {}
    environ["REQUEST_METHOD"] = method
    environ["PATH_INFO"] = path
    environ["QUERY_STRING"] = query_string
    environ["SERVER_NAME"] = "testserver"
    environ["SERVER_PORT"] = "80"
    environ["wsgi.version"] = (1, 0)
    environ["wsgi.url_scheme"] = "http"
    environ["wsgi.input"] = BytesIO(body)
    environ["CONTENT_LENGTH"] = str(len(body))
    environ["wsgi.errors"] = BytesIO()
    if headers:
        for key, value in headers.items():
            http_key = "HTTP_" + key.upper().replace("-", "_")
            environ[http_key] = value
    collected: list[bytes] = []
    status_holder: dict[str, str | list[tuple[str, str]]] = {}

    def start_response(status: str, response_headers: list[tuple[str, str]], exc_info=None):
        status_holder["status"] = status
        status_holder["headers"] = response_headers
        return collected.append

    result = application(environ, start_response)
    try:
        for chunk in result:
            if isinstance(chunk, bytes):
                collected.append(chunk)
            else:
                collected.append(chunk.encode("utf-8"))
    finally:
        if hasattr(result, "close"):
            result.close()  # pragma: no cover

    status = status_holder["status"]
    headers_dict = {key: value for key, value in status_holder["headers"]}
    body_bytes = b"".join(collected)
    return status, headers_dict, body_bytes


@pytest.fixture
def export_root(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    (tmp_path / "nested").mkdir()
    monkeypatch.setenv("MOBIUS_EXPORT_ROOT", str(tmp_path))
    monkeypatch.setenv("MOBIUS_API_KEY", "secret")
    monkeypatch.setenv("MOBIUS_CACHE_MODE", "revalidate")
    monkeypatch.delenv("MOBIUS_VERSION", raising=False)
    monkeypatch.delenv("MOBIUS_HEALTH_PUBLIC", raising=False)
    return tmp_path


def write_file(path: Path, data: bytes) -> None:
    path.write_bytes(data)
    os.utime(path, (path.stat().st_atime, path.stat().st_mtime))


def test_streams_zip_with_expected_headers(export_root: Path) -> None:
    payload = b"example-zip-contents"
    export_file = export_root / "demo.zip"
    write_file(export_file, payload)

    status, headers, body = call_app(
        "/exports/demo.zip",
        headers={"X-Mobius-Key": "secret"},
    )

    assert status == "200 OK"
    assert headers["Content-Type"] == "application/zip"
    assert headers["Content-Disposition"].startswith("attachment; filename=")
    assert headers["Cache-Control"] == "public, max-age=0, must-revalidate"
    assert headers["Vary"] == "Accept-Encoding"
    assert headers["Accept-Ranges"] == "bytes"
    assert "ETag" in headers
    assert "Last-Modified" in headers
    assert body == payload


def test_head_matches_metadata(export_root: Path) -> None:
    payload = b"zip"
    export_file = export_root / "demo.zip"
    write_file(export_file, payload)

    status, headers, body = call_app(
        "/exports/demo.zip",
        method="HEAD",
        headers={"X-Mobius-Key": "secret"},
    )

    assert status == "200 OK"
    assert headers["Content-Length"] == str(len(payload))
    assert body == b""


def test_cache_mode_immutable(monkeypatch: pytest.MonkeyPatch, export_root: Path) -> None:
    monkeypatch.setenv("MOBIUS_CACHE_MODE", "immutable")
    export_file = export_root / "demo.zip"
    write_file(export_file, b"zip")

    status, headers, _ = call_app(
        "/exports/demo.zip",
        headers={"X-Mobius-Key": "secret"},
    )

    assert status == "200 OK"
    assert headers["Cache-Control"] == "public, max-age=31536000, immutable"


def test_conditional_etag_returns_304(export_root: Path) -> None:
    payload = b"zip"
    export_file = export_root / "demo.zip"
    write_file(export_file, payload)

    status, headers, _ = call_app(
        "/exports/demo.zip",
        headers={"X-Mobius-Key": "secret"},
    )
    etag = headers["ETag"]

    status, headers, body = call_app(
        "/exports/demo.zip",
        headers={"X-Mobius-Key": "secret", "If-None-Match": etag},
    )

    assert status == "304 Not Modified"
    assert body == b""
    assert headers["ETag"] == etag
    assert "Last-Modified" in headers
    assert headers["Cache-Control"] == "public, max-age=0, must-revalidate"


def test_conditional_last_modified_returns_304(export_root: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    payload = b"zip"
    export_file = export_root / "demo.zip"
    write_file(export_file, payload)

    status, headers, _ = call_app(
        "/exports/demo.zip",
        headers={"X-Mobius-Key": "secret"},
    )
    last_modified = headers["Last-Modified"]

    status, headers, body = call_app(
        "/exports/demo.zip",
        headers={"X-Mobius-Key": "secret", "If-Modified-Since": last_modified},
    )

    assert status == "304 Not Modified"
    assert body == b""
    assert headers["Last-Modified"] == last_modified


def test_unicode_content_disposition(export_root: Path) -> None:
    filename = "überraschung.zip"
    export_file = export_root / filename
    write_file(export_file, b"zip")

    quoted_path = "/exports/" + quote(filename)
    status, headers, body = call_app(
        quoted_path,
        headers={"X-Mobius-Key": "secret"},
    )

    assert status == "200 OK"
    disposition = headers["Content-Disposition"]
    assert "filename*=UTF-8''" in disposition
    assert "attachment;" in disposition
    assert body == b"zip"


def test_checksum_endpoint(export_root: Path) -> None:
    export_file = export_root / "demo.zip"
    payload = b"checksum"
    write_file(export_file, payload)

    status, headers, body = call_app(
        "/exports/demo.zip.sha256",
        headers={"X-Mobius-Key": "secret"},
    )

    assert status == "200 OK"
    assert headers["Content-Type"] == "text/plain; charset=utf-8"
    assert headers["Content-Disposition"].startswith("inline;")
    expected_checksum = hashlib.sha256(payload).hexdigest()
    assert body.decode("utf-8") == f"{expected_checksum}  demo.zip\n"


def test_checksum_uses_validators(export_root: Path) -> None:
    export_file = export_root / "demo.zip"
    payload = b"checksum"
    write_file(export_file, payload)

    status, headers, _ = call_app(
        "/exports/demo.zip.sha256",
        headers={"X-Mobius-Key": "secret"},
    )
    etag = headers["ETag"]

    status, headers_304, body = call_app(
        "/exports/demo.zip.sha256",
        headers={"X-Mobius-Key": "secret", "If-None-Match": etag},
    )

    assert status == "304 Not Modified"
    assert body == b""
    assert headers_304["Cache-Control"] == "public, max-age=0, must-revalidate"


def test_missing_api_key_is_rejected(export_root: Path) -> None:
    export_file = export_root / "demo.zip"
    write_file(export_file, b"zip")

    status, headers, body = call_app("/exports/demo.zip")

    assert status == "401 Unauthorized"
    assert headers["WWW-Authenticate"].startswith("Mobius")
    assert body == b""


def test_traversal_is_blocked(export_root: Path) -> None:
    status, headers, body = call_app(
        "/exports/../demo.zip",
        headers={"X-Mobius-Key": "secret"},
    )

    assert status == "404 Not Found"
    assert body == b""


def test_health_requires_key_by_default(export_root: Path) -> None:
    status, _, body = call_app("/healthz")
    assert status == "401 Unauthorized"
    assert body == b""


def test_health_allows_public_access(monkeypatch: pytest.MonkeyPatch, export_root: Path) -> None:
    monkeypatch.setenv("MOBIUS_HEALTH_PUBLIC", "1")

    status, headers, body = call_app(
        "/healthz",
        headers={"X-Mobius-Key": "secret"},
    )

    assert status == "200 OK"
    assert headers["Cache-Control"] == "no-store"
    assert body == b"OK"


def test_health_public_without_key(monkeypatch: pytest.MonkeyPatch, export_root: Path) -> None:
    monkeypatch.setenv("MOBIUS_HEALTH_PUBLIC", "1")

    status, _, body = call_app("/healthz")

    assert status == "200 OK"
    assert body == b"OK"


def test_version_header_is_included(monkeypatch: pytest.MonkeyPatch, export_root: Path) -> None:
    monkeypatch.setenv("MOBIUS_VERSION", "2024.09")
    export_file = export_root / "demo.zip"
    write_file(export_file, b"zip")

    status, headers, _ = call_app(
        "/exports/demo.zip",
        headers={"X-Mobius-Key": "secret"},
    )

    assert status == "200 OK"
    assert headers["X-Mobius-Version"] == "2024.09"


def test_unknown_method_returns_405(export_root: Path) -> None:
    status, headers, body = call_app(
        "/exports/demo.zip",
        method="POST",
        headers={"X-Mobius-Key": "secret"},
    )

    assert status == "405 Method Not Allowed"
    assert headers["Allow"] == "GET, HEAD"
    assert body == b""


def test_non_zip_requests_are_rejected(export_root: Path) -> None:
    status, _, body = call_app(
        "/exports/demo.txt",
        headers={"X-Mobius-Key": "secret"},
    )

    assert status == "404 Not Found"
    assert body == b""
