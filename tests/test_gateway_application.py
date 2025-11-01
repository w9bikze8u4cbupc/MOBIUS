from __future__ import annotations

import hashlib
import io
import os
from datetime import datetime, timezone
from typing import Dict, Iterable, Tuple

import pytest

from gateway import GatewayApplication


def _call_app(
    app: GatewayApplication,
    method: str,
    path: str,
    headers: Dict[str, str] | None = None,
) -> Tuple[str, Dict[str, str], bytes]:
    """
    Make a WSGI request to the provided GatewayApplication and collect the full response.
    
    Parameters:
        app (GatewayApplication): The WSGI application to invoke.
        method (str): HTTP method to use (e.g., "GET", "HEAD").
        path (str): Request path to set as PATH_INFO.
        headers (Dict[str, str] | None): Optional mapping of HTTP header names to values;
            names will be normalized to WSGI environ keys (prefixed with "HTTP_" and
            uppercased with '-' replaced by '_').
    
    Returns:
        Tuple[str, Dict[str, str], bytes]: A tuple (status, headers, body) where
            status is the HTTP status string (e.g., "200 OK"),
            headers is a dict of response headers,
            and body is the full response body as bytes.
    """
    environ = {
        "REQUEST_METHOD": method,
        "PATH_INFO": path,
        "SERVER_NAME": "localhost",
        "SERVER_PORT": "80",
        "SCRIPT_NAME": "",
        "QUERY_STRING": "",
        "wsgi.version": (1, 0),
        "wsgi.url_scheme": "http",
        "wsgi.input": io.BytesIO(b""),
        "wsgi.errors": io.StringIO(),
        "wsgi.multithread": False,
        "wsgi.multiprocess": False,
        "wsgi.run_once": False,
        "CONTENT_TYPE": "",
        "CONTENT_LENGTH": "0",
    }
    if headers:
        for key, value in headers.items():
            environ[f"HTTP_{key.upper().replace('-', '_')}"] = value

    status_holder: Dict[str, str] = {}
    response_headers: list[Tuple[str, str]] = []
    body_chunks: list[bytes] = []

    def start_response(status: str, header_list: Iterable[Tuple[str, str]]):
        """
        Capture the WSGI response status and headers and return a write callable to collect body chunks.
        
        Parameters:
            status (str): WSGI status string (e.g. "200 OK").
            header_list (Iterable[Tuple[str, str]]): Sequence of header (name, value) pairs to append to the response headers.
        
        Returns:
            write (Callable[[bytes], None]): A callable that accepts a bytes chunk and appends it to the captured body chunks.
        """
        status_holder["status"] = status
        response_headers.extend(header_list)

        def write(chunk: bytes):
            """
            Append a bytes chunk to the captured response body chunks.
            
            Parameters:
                chunk (bytes): A portion of the response body to append to the collector.
            """
            body_chunks.append(chunk)

        return write

    result = app(environ, start_response)
    try:
        for part in result:
            body_chunks.append(part)
    finally:
        close = getattr(result, "close", None)
        if callable(close):
            close()

    body = b"".join(body_chunks)
    header_map: Dict[str, str] = {}
    for key, value in response_headers:
        header_map[key] = value

    return status_holder.get("status", ""), header_map, body


@pytest.fixture()
def artifact_root(tmp_path):
    """
    Create and return an "exports" subdirectory inside the provided temporary path.
    
    Parameters:
        tmp_path (pathlib.Path): Base temporary directory (typically provided by pytest).
    
    Returns:
        pathlib.Path: Path to the newly created "exports" directory.
    """
    exports = tmp_path / "exports"
    exports.mkdir()
    return exports


@pytest.fixture()
def sample_file(artifact_root):
    """
    Create a sample ZIP file with deterministic metadata for tests.
    
    Creates a file named "データ.zip" in the given artifact_root with fixed contents,
    sets a deterministic Last-Modified timestamp for stable test assertions, and
    returns the file path, the raw payload bytes, and the SHA-256 hex digest of the payload.
    
    Parameters:
        artifact_root (pathlib.Path): Directory in which to create the sample file.
    
    Returns:
        tuple[pathlib.Path, bytes, str]: (path to the created file, payload bytes, SHA-256 hex digest)
    """
    filename = "データ.zip"
    path = artifact_root / filename
    payload = b"content-of-export"
    path.write_bytes(payload)
    # Stabilise mtime for deterministic Last-Modified headers.
    fixed_time = datetime(2023, 5, 17, 15, 30, 45, tzinfo=timezone.utc)
    timestamp = fixed_time.timestamp()
    os.utime(path, (timestamp, timestamp))
    digest = hashlib.sha256(payload).hexdigest()
    return path, payload, digest


def _app(root, **kwargs) -> GatewayApplication:
    """
    Create a GatewayApplication configured for tests.
    
    Parameters:
        root (str | pathlib.Path): Filesystem path used as the application's artifact root.
        **kwargs: Additional GatewayApplication configuration options forwarded unchanged (e.g., cache_mode, health_public).
    
    Returns:
        GatewayApplication: Instance configured with api_key="secret" and version="1.2.3", with `root` and any provided kwargs applied.
    """
    return GatewayApplication(root, api_key="secret", version="1.2.3", **kwargs)


def test_zip_streams_with_headers(sample_file):
    path, payload, digest = sample_file
    app = _app(path.parent)
    status, headers, body = _call_app(
        app,
        "GET",
        f"/exports/{path.name}",
        headers={"X-Mobius-Key": "secret"},
    )

    assert status == "200 OK"
    assert body == payload
    assert headers["Content-Type"] == "application/zip"
    assert headers["Content-Length"] == str(len(payload))
    assert headers["Accept-Ranges"] == "bytes"
    assert headers["Vary"] == "Accept-Encoding"
    assert headers["X-Mobius-Version"] == "1.2.3"
    assert headers["Cache-Control"] == "public, max-age=0, must-revalidate"
    assert headers["ETag"] == f'"{digest}"'
    assert "filename*=UTF-8''" in headers["Content-Disposition"]


def test_head_returns_headers_without_body(sample_file):
    path, payload, digest = sample_file
    app = _app(path.parent)
    status, headers, body = _call_app(
        app,
        "HEAD",
        f"/exports/{path.name}",
        headers={"X-Mobius-Key": "secret"},
    )

    assert status == "200 OK"
    assert body == b""
    assert headers["Content-Length"] == str(len(payload))
    assert headers["ETag"] == f'"{digest}"'


def test_conditional_get_with_etag(sample_file):
    """
    Verifies that a conditional GET with a matching ETag returns 304 Not Modified and no body.
    
    Performs an initial GET to obtain the resource's ETag, then issues a GET with that ETag in If-None-Match and asserts the response status is "304 Not Modified", the response body is empty, and the ETag header remains the same.
    
    Parameters:
        sample_file: a fixture tuple (path, payload, digest) representing the exported file; `digest` is the SHA-256 hex used for the resource ETag.
    """
    path, _, digest = sample_file
    app = _app(path.parent)
    status, headers, _ = _call_app(
        app,
        "GET",
        f"/exports/{path.name}",
        headers={"X-Mobius-Key": "secret"},
    )
    assert status == "200 OK"

    status, headers, body = _call_app(
        app,
        "GET",
        f"/exports/{path.name}",
        headers={
            "X-Mobius-Key": "secret",
            "If-None-Match": headers["ETag"],
        },
    )
    assert status == "304 Not Modified"
    assert body == b""
    assert headers["ETag"] == f'"{digest}"'


def test_conditional_get_with_last_modified(sample_file):
    """
    Verifies that a conditional GET using the resource's Last-Modified header returns 304 Not Modified and an empty body when the resource is unmodified.
    
    Parameters:
        sample_file (tuple): Fixture producing (path, payload, digest) for a test export file; the test uses the file's Last-Modified header to perform the conditional request.
    """
    path, _, _ = sample_file
    app = _app(path.parent)
    status, headers, _ = _call_app(
        app,
        "GET",
        f"/exports/{path.name}",
        headers={"X-Mobius-Key": "secret"},
    )

    status, _, body = _call_app(
        app,
        "GET",
        f"/exports/{path.name}",
        headers={
            "X-Mobius-Key": "secret",
            "If-Modified-Since": headers["Last-Modified"],
        },
    )
    assert status == "304 Not Modified"
    assert body == b""


def test_sha256_signature_response(sample_file):
    path, payload, digest = sample_file
    app = _app(path.parent)
    status, headers, body = _call_app(
        app,
        "GET",
        f"/exports/{path.name}.sha256",
        headers={"X-Mobius-Key": "secret"},
    )

    assert status == "200 OK"
    assert headers["Content-Type"] == "text/plain; charset=utf-8"
    assert headers["ETag"] == f'"{digest}-sha"'
    assert body.decode("utf-8").strip() == f"{digest}  {path.name}"
    assert "filename*=UTF-8''" in headers["Content-Disposition"]


def test_traversal_is_rejected(sample_file):
    path, _, _ = sample_file
    app = _app(path.parent)
    status, headers, body = _call_app(
        app,
        "GET",
        "/exports/../secret.zip",
        headers={"X-Mobius-Key": "secret"},
    )

    assert status == "404 Not Found"
    assert body == b"Not Found"


def test_authentication_required(sample_file):
    path, _, _ = sample_file
    app = _app(path.parent)
    status, headers, body = _call_app(app, "GET", f"/exports/{path.name}")

    assert status == "401 Unauthorized"
    assert headers["WWW-Authenticate"] == "Mobius"


def test_health_endpoint_optional_public(artifact_root):
    app = GatewayApplication(artifact_root, api_key="secret", health_public=True)
    status, headers, body = _call_app(app, "GET", "/healthz")

    assert status == "200 OK"
    assert body == b"ok\n"
    assert headers["Cache-Control"] == "no-store"


@pytest.mark.parametrize(
    "mode,expected",
    [
        ("revalidate", "public, max-age=0, must-revalidate"),
        ("immutable", "public, max-age=31536000, immutable"),
        ("no-store", "no-store"),
    ],
)
def test_cache_control_modes(sample_file, mode, expected):
    path, _, _ = sample_file
    app = _app(path.parent, cache_mode=mode)
    status, headers, _ = _call_app(
        app,
        "GET",
        f"/exports/{path.name}",
        headers={"X-Mobius-Key": "secret"},
    )

    assert status == "200 OK"
    assert headers["Cache-Control"] == expected


def test_invalid_cache_mode_raises(artifact_root):
    with pytest.raises(ValueError):
        GatewayApplication(artifact_root, cache_mode="totally-bogus")


def test_health_requires_key_by_default(artifact_root):
    app = GatewayApplication(artifact_root, api_key="secret")
    status, _, _ = _call_app(app, "GET", "/healthz")
    assert status == "401 Unauthorized"

