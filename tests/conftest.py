import io
import sys
from pathlib import Path
from typing import Dict, List, Tuple

import pytest

PROJECT_ROOT = Path(__file__).resolve().parents[1]
SRC_ROOT = PROJECT_ROOT / "src"
if str(SRC_ROOT) not in sys.path:
    sys.path.insert(0, str(SRC_ROOT))

from gateway import GatewayApplication, GatewayConfig


@pytest.fixture
def exports_root(tmp_path):
    root = tmp_path / "exports"
    root.mkdir()
    return root


@pytest.fixture
def config(exports_root):
    return GatewayConfig(
        exports_root=exports_root,
        api_key="test-key",
        version="1.2.3",
        cache_mode="revalidate",
        health_public=False,
    )


@pytest.fixture
def app(config):
    return GatewayApplication(config)


@pytest.fixture
def call_app(app):
    def _call(
        method: str,
        path: str,
        headers: Dict[str, str] | None = None,
    ) -> Tuple[int, List[Tuple[str, str]], bytes]:
        environ = build_environ(method=method, path=path, headers=headers)
        return run_request(app, environ)

    return _call


def build_environ(
    method: str,
    path: str,
    headers: Dict[str, str] | None = None,
) -> Dict[str, str]:
    from wsgiref.util import setup_testing_defaults

    environ: Dict[str, str] = {}
    setup_testing_defaults(environ)
    environ["REQUEST_METHOD"] = method
    environ["PATH_INFO"] = path
    environ["QUERY_STRING"] = ""
    environ["wsgi.input"] = io.BytesIO(b"")
    if headers:
        for key, value in headers.items():
            environ[f"HTTP_{key.upper().replace('-', '_')}"] = value
    return environ


def run_request(
    app: GatewayApplication,
    environ: Dict[str, str],
) -> Tuple[int, List[Tuple[str, str]], bytes]:
    status_headers: Dict[str, object] = {}
    body_chunks: List[bytes] = []

    def start_response(status: str, headers: List[Tuple[str, str]], exc_info=None):
        status_headers["status"] = status
        status_headers["headers"] = headers
        return body_chunks.append

    result = app(environ, start_response)
    try:
        for chunk in result:
            body_chunks.append(chunk)
    finally:
        if hasattr(result, "close"):
            result.close()  # type: ignore[attr-defined]

    status_code = int(str(status_headers["status"]).split()[0])
    headers = status_headers["headers"]  # type: ignore[assignment]
    body = b"".join(body_chunks)
    return status_code, headers, body
