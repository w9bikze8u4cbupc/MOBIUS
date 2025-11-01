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
    """
    Invoke the WSGI application with a synthetic request and collect its response.
    
    Parameters:
        path (str): Request path sent as PATH_INFO.
        method (str): HTTP method to use.
        headers (dict[str, str] | None): Additional request headers; keys are header names (e.g., "X-Mobius-Key").
        query_string (str): Raw query string to send as QUERY_STRING.
        body (bytes): Request body sent as the WSGI input stream.
    
    Returns:
        tuple[str, dict[str, str], bytes]: A tuple of (status, headers, body) where `status` is the HTTP status line (e.g., "200 OK"), `headers` is a mapping of response header names to values, and `body` is the full response body as bytes.
    """
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
        """
        Capture the WSGI response status and headers and return a write callable that collects body chunks.
        
        Parameters:
            status (str): WSGI status string (e.g., "200 OK") provided by the application.
            response_headers (list[tuple[str, str]]): Response headers provided by the application.
            exc_info: Optional exception info as per WSGI; accepted but not processed.
        
        Returns:
            callable: A single-argument callable that appends provided bytes or text (will be stored as bytes) to the internal response body collector.
        """
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
    """
    Create a temporary export root and configure environment variables for tests.
    
    Sets MOBIUS_EXPORT_ROOT to the created temporary path, MOBIUS_API_KEY to "secret",
    and MOBIUS_CACHE_MODE to "revalidate". Ensures MOBIUS_VERSION and MOBIUS_HEALTH_PUBLIC
    are unset. Returns the temporary path to be used as the export root.
    
    Parameters:
        tmp_path (Path): pytest temporary path fixture.
        monkeypatch (pytest.MonkeyPatch): pytest monkeypatch fixture used to set environment variables.
    
    Returns:
        Path: The temporary path configured as the export root.
    """
    (tmp_path / "nested").mkdir()
    monkeypatch.setenv("MOBIUS_EXPORT_ROOT", str(tmp_path))
    monkeypatch.setenv("MOBIUS_API_KEY", "secret")
    monkeypatch.setenv("MOBIUS_CACHE_MODE", "revalidate")
    monkeypatch.delenv("MOBIUS_VERSION", raising=False)
    monkeypatch.delenv("MOBIUS_HEALTH_PUBLIC", raising=False)
    return tmp_path


def write_file(path: Path, data: bytes) -> None:
    """
    Write binary data to the given path and set the file's access and modification timestamps
    to the values reported immediately after the write.
    
    Parameters:
        path (Path): Filesystem path to write the data to.
        data (bytes): Binary content to write.
    """
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
    """
    Verifies that a GET request with an `If-Modified-Since` header matching a file's `Last-Modified` returns a 304 Not Modified with an empty body.
    
    Parameters:
        export_root (Path): Temporary export directory used to create the test file.
        monkeypatch (pytest.MonkeyPatch): Pytest fixture for modifying environment or configuration (not used directly in this test).
    """
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
    """
    Verifies that a file with a non-ASCII filename is served with a UTF-8 encoded Content-Disposition and its body is returned unchanged.
    
    Asserts that the Content-Disposition header contains an RFC 5987 `filename*` UTF-8 encoding (i.e., `filename*=UTF-8''`), includes `attachment;`, and that the response body matches the stored file bytes.
    """
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
    """
    Verifies that a directory traversal request is rejected.
    
    Sends a request targeting a parent-directory path (../demo.zip) and asserts the application responds with "404 Not Found" and an empty response body.
    """
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
    """
    Verify that the health endpoint is publicly accessible when MOBIUS_HEALTH_PUBLIC is enabled.
    
    Sets MOBIUS_HEALTH_PUBLIC and asserts that a request to /healthz returns 200 OK with the body "OK".
    """
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
    """
    Verifies that POST requests to an export path are rejected with 405 Method Not Allowed.
    
    Asserts the response status is "405 Method Not Allowed", the Allow header is "GET, HEAD", and the response body is empty.
    """
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