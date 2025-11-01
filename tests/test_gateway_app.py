import hashlib
import io
import os
import sys
import time
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Tuple

import pytest

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from gateway.app import (  # noqa: E402
    CACHE_MODE_IMMUTABLE,
    CACHE_MODE_NO_STORE,
    CACHE_MODE_REVALIDATE,
    application,
)


@dataclass
class AppResponse:
    status: str
    headers: List[Tuple[str, str]]
    body: bytes

    @property
    def status_code(self) -> int:
        """
        Return the numeric HTTP status code parsed from the instance's status string.
        
        The method extracts the leading integer from a status line like "200 OK" and returns it.
        
        Returns:
            int: The HTTP status code parsed from `self.status`.
        """
        return int(self.status.split()[0])

    def header(self, name: str) -> str | None:
        """
        Retrieve the most-recent value for a header name, matching case-insensitively.
        
        Parameters:
            name (str): Header name to look up.
        
        Returns:
            value (str | None): The last header value with the given name, or `None` if not present.
        """
        for key, value in reversed(self.headers):
            if key.lower() == name.lower():
                return value
        return None

def call_app(
    path: str,
    *,
    method: str = "GET",
    headers: Dict[str, str] | None = None,
) -> AppResponse:
    """
    Invoke the WSGI application with a constructed environ and capture its response.
    
    Parameters:
        path (str): Request PATH_INFO to call the application with.
        method (str): HTTP method to use (defaults to "GET").
        headers (Dict[str, str] | None): Optional mapping of HTTP header names to values; each entry is added to the WSGI environ as "HTTP_<NAME>" (hyphens replaced with underscores and uppercased).
    
    Returns:
        AppResponse: Captured response including status string, list of (header, value) tuples, and the full response body bytes.
    """
    environ: Dict[str, object] = {
        "REQUEST_METHOD": method,
        "SCRIPT_NAME": "",
        "PATH_INFO": path,
        "QUERY_STRING": "",
        "SERVER_NAME": "localhost",
        "SERVER_PORT": "80",
        "SERVER_PROTOCOL": "HTTP/1.1",
        "wsgi.version": (1, 0),
        "wsgi.url_scheme": "http",
        "wsgi.input": io.BytesIO(b""),
        "wsgi.errors": io.StringIO(),
        "wsgi.multithread": False,
        "wsgi.multiprocess": False,
        "wsgi.run_once": False,
    }
    if headers:
        for header_name, header_value in headers.items():
            key = "HTTP_" + header_name.upper().replace("-", "_")
            environ[key] = header_value

    captured: Dict[str, object] = {}
    body: List[bytes] = []

    def start_response(status: str, response_headers: List[Tuple[str, str]], exc_info=None):
        """
        Capture the WSGI response status and headers and return a write callback that appends to the response body.
        
        Parameters:
            status (str): HTTP status line (e.g., "200 OK") to record.
            response_headers (List[Tuple[str, str]]): Iterable of header (name, value) pairs to record.
            exc_info (Optional[tuple]): Optional exception info per WSGI specification; not used by this implementation.
        
        Returns:
            Callable[[bytes], None]: A write function that appends byte chunks to the response body list.
        """
        captured["status"] = status
        captured["headers"] = list(response_headers)
        return body.append

    result = application(environ, start_response)
    try:
        for chunk in result:
            if chunk:
                body.append(chunk)
    finally:
        if hasattr(result, "close"):
            result.close()

    return AppResponse(
        status=captured.get("status", ""),
        headers=captured.get("headers", []),
        body=b"".join(body),
    )


@pytest.fixture()
def export_dir(tmp_path: Path) -> Path:
    """
    Provide a temporary directory path to be used as the exports root in tests.
    
    Returns:
        Path: A pathlib.Path pointing to a temporary directory provided by pytest's tmp_path fixture.
    """
    return tmp_path


def _create_zip(path: Path, *, file_name: str, contents: bytes = b"payload") -> Path:
    """
    Create a ZIP archive containing a single entry named "data.bin" and return its path.
    
    The created archive will contain exactly one file, "data.bin", with the provided contents.
    The archive's filesystem modification time is normalized to a deterministic value to produce stable headers
    (e.g., for tests that assert Last-Modified or ETag values).
    
    Parameters:
        path (Path): Directory where the archive will be written.
        file_name (str): Name of the ZIP file to create (e.g., "archive.zip").
        contents (bytes): Bytes to write into the "data.bin" entry. Defaults to b"payload".
    
    Returns:
        Path: The full path to the created ZIP archive.
    """
    archive_path = path / file_name
    with zipfile.ZipFile(archive_path, "w") as zf:
        zf.writestr("data.bin", contents)
    # normalise timestamp for deterministic headers
    timestamp = int(time.time()) - 100
    os.utime(archive_path, (timestamp, timestamp))
    return archive_path


def _auth_header(key: str) -> Dict[str, str]:
    """
    Create an HTTP header mapping containing the X-Mobius-Key authentication header.
    
    Parameters:
        key (str): The API key value to use for the X-Mobius-Key header.
    
    Returns:
        headers (Dict[str, str]): A dictionary with the single header "X-Mobius-Key" set to the provided key.
    """
    return {"X-Mobius-Key": key}


@pytest.mark.parametrize(
    "cache_mode, expected",
    [
        (CACHE_MODE_REVALIDATE, "public, max-age=0, must-revalidate"),
        (CACHE_MODE_IMMUTABLE, "public, max-age=31536000, immutable"),
        (CACHE_MODE_NO_STORE, "no-store"),
    ],
)
def test_zip_serving_with_cache_modes(monkeypatch, export_dir, cache_mode, expected):
    archive = _create_zip(export_dir, file_name="alpha.zip")
    monkeypatch.setenv("MOBIUS_EXPORT_ROOT", str(export_dir))
    monkeypatch.setenv("MOBIUS_API_KEY", "secret")
    monkeypatch.setenv("MOBIUS_CACHE_MODE", cache_mode)

    response = call_app(
        "/exports/alpha.zip",
        headers=_auth_header("secret"),
    )

    assert response.status_code == 200
    assert response.body == archive.read_bytes()
    assert response.header("Cache-Control") == expected
    assert response.header("Content-Type") == "application/zip"
    assert response.header("Content-Length") == str(archive.stat().st_size)
    assert response.header("ETag").startswith('"')
    assert response.header("Last-Modified") is not None
    assert response.header("Vary") == "Accept-Encoding"
    assert response.header("Accept-Ranges") == "bytes"


def test_zip_head_parity(monkeypatch, export_dir):
    _create_zip(export_dir, file_name="sample.zip")
    monkeypatch.setenv("MOBIUS_EXPORT_ROOT", str(export_dir))
    monkeypatch.setenv("MOBIUS_API_KEY", "secret")

    get_response = call_app(
        "/exports/sample.zip",
        headers=_auth_header("secret"),
    )
    head_response = call_app(
        "/exports/sample.zip",
        method="HEAD",
        headers=_auth_header("secret"),
    )

    assert head_response.status_code == 200
    assert head_response.body == b""
    ignored = {"Date"}
    assert {
        (k, v) for k, v in head_response.headers if k not in ignored
    } == {
        (k, v) for k, v in get_response.headers if k not in ignored
    }


def test_etag_and_last_modified_revalidation(monkeypatch, export_dir):
    _create_zip(export_dir, file_name="widget.zip")
    monkeypatch.setenv("MOBIUS_EXPORT_ROOT", str(export_dir))
    monkeypatch.setenv("MOBIUS_API_KEY", "secret")

    first = call_app(
        "/exports/widget.zip",
        headers=_auth_header("secret"),
    )
    etag = first.header("ETag")
    last_modified = first.header("Last-Modified")
    assert etag and last_modified

    second = call_app(
        "/exports/widget.zip",
        headers={
            **_auth_header("secret"),
            "If-None-Match": etag,
        },
    )
    assert second.status_code == 304
    assert second.body == b""

    third = call_app(
        "/exports/widget.zip",
        headers={
            **_auth_header("secret"),
            "If-Modified-Since": last_modified,
        },
    )
    assert third.status_code == 304
    assert third.body == b""


def test_sha256_manifest(monkeypatch, export_dir):
    archive = _create_zip(export_dir, file_name="bundle.zip", contents=b"bundle-data")
    monkeypatch.setenv("MOBIUS_EXPORT_ROOT", str(export_dir))
    monkeypatch.setenv("MOBIUS_API_KEY", "secret")

    response = call_app(
        "/exports/bundle.zip.sha256",
        headers=_auth_header("secret"),
    )

    expected_sha = hashlib.sha256(archive.read_bytes()).hexdigest()
    expected_body = f"{expected_sha}  bundle.zip\n".encode()
    assert response.status_code == 200
    assert response.body == expected_body
    assert response.header("Content-Type") == "text/plain; charset=utf-8"
    assert response.header("Content-Disposition").startswith("attachment;")


def test_unicode_filename_disposition(monkeypatch, export_dir):
    archive_name = "résumé.zip"
    _create_zip(export_dir, file_name=archive_name)
    monkeypatch.setenv("MOBIUS_EXPORT_ROOT", str(export_dir))
    monkeypatch.setenv("MOBIUS_API_KEY", "secret")

    response = call_app(
        f"/exports/{archive_name}",
        headers=_auth_header("secret"),
    )

    disposition = response.header("Content-Disposition")
    assert "filename*=UTF-8''" in disposition
    assert "%C3%A9" in disposition


def test_api_key_required(monkeypatch, export_dir):
    _create_zip(export_dir, file_name="secure.zip")
    monkeypatch.setenv("MOBIUS_EXPORT_ROOT", str(export_dir))
    monkeypatch.setenv("MOBIUS_API_KEY", "secret")

    response = call_app("/exports/secure.zip")
    assert response.status_code == 401
    assert response.header("WWW-Authenticate") == 'X-Mobius-Key realm="exports"'
    assert response.header("Cache-Control") == "no-store"


def test_path_traversal_blocked(monkeypatch, tmp_path):
    export_root = tmp_path / "exports"
    export_root.mkdir()
    outside = tmp_path / "outside.zip"
    outside.write_bytes(b"outside")
    monkeypatch.setenv("MOBIUS_EXPORT_ROOT", str(export_root))
    monkeypatch.setenv("MOBIUS_API_KEY", "secret")

    response = call_app(
        "/exports/../outside.zip",
        headers=_auth_header("secret"),
    )
    assert response.status_code == 404


def test_missing_export(monkeypatch, export_dir):
    monkeypatch.setenv("MOBIUS_EXPORT_ROOT", str(export_dir))
    monkeypatch.setenv("MOBIUS_API_KEY", "secret")

    response = call_app(
        "/exports/absent.zip",
        headers=_auth_header("secret"),
    )
    assert response.status_code == 404


def test_health_requires_key_by_default(monkeypatch):
    monkeypatch.setenv("MOBIUS_API_KEY", "secret")

    response = call_app("/healthz")
    assert response.status_code == 401
    assert response.header("Cache-Control") == "no-store"


def test_health_public_mode(monkeypatch):
    monkeypatch.delenv("MOBIUS_API_KEY", raising=False)
    monkeypatch.setenv("MOBIUS_HEALTH_PUBLIC", "1")

    response = call_app("/healthz")
    assert response.status_code == 200
    assert response.body == b"OK\n"
    assert response.header("Cache-Control") == "no-store"


def test_version_header(monkeypatch, export_dir):
    _create_zip(export_dir, file_name="versioned.zip")
    monkeypatch.setenv("MOBIUS_EXPORT_ROOT", str(export_dir))
    monkeypatch.setenv("MOBIUS_API_KEY", "secret")
    monkeypatch.setenv("MOBIUS_VERSION", "2024.04.01")

    response = call_app(
        "/exports/versioned.zip",
        headers=_auth_header("secret"),
    )

    assert response.header("X-Mobius-Version") == "2024.04.01"


def test_missing_export_root(monkeypatch):
    monkeypatch.delenv("MOBIUS_EXPORT_ROOT", raising=False)
    monkeypatch.setenv("MOBIUS_API_KEY", "secret")

    response = call_app(
        "/exports/whatever.zip",
        headers=_auth_header("secret"),
    )
    assert response.status_code == 500
    assert response.body


def test_sha256_reuses_cache_headers(monkeypatch, export_dir):
    _create_zip(export_dir, file_name="headers.zip")
    monkeypatch.setenv("MOBIUS_EXPORT_ROOT", str(export_dir))
    monkeypatch.setenv("MOBIUS_API_KEY", "secret")
    monkeypatch.setenv("MOBIUS_CACHE_MODE", CACHE_MODE_IMMUTABLE)

    response = call_app(
        "/exports/headers.zip.sha256",
        headers=_auth_header("secret"),
    )

    assert response.status_code == 200
    assert response.header("Cache-Control") == "public, max-age=31536000, immutable"
    etag = response.header("ETag")
    second = call_app(
        "/exports/headers.zip.sha256",
        headers={**_auth_header("secret"), "If-None-Match": etag},
    )
    assert second.status_code == 304


def test_unicode_manifest(monkeypatch, export_dir):
    archive_name = "データ.zip"
    _create_zip(export_dir, file_name=archive_name)
    monkeypatch.setenv("MOBIUS_EXPORT_ROOT", str(export_dir))
    monkeypatch.setenv("MOBIUS_API_KEY", "secret")

    response = call_app(
        f"/exports/{archive_name}.sha256",
        headers=_auth_header("secret"),
    )
    assert "filename*=UTF-8''" in response.header("Content-Disposition")


def test_percent_decoding(monkeypatch, export_dir):
    archive_name = "space name.zip"
    encoded = "space%20name.zip"
    _create_zip(export_dir, file_name=archive_name)
    monkeypatch.setenv("MOBIUS_EXPORT_ROOT", str(export_dir))
    monkeypatch.setenv("MOBIUS_API_KEY", "secret")

    response = call_app(
        f"/exports/{encoded}",
        headers=_auth_header("secret"),
    )
    assert response.status_code == 200