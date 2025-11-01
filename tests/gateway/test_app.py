"""Unit tests for the gateway WSGI application."""

from __future__ import annotations

import io
import sys
import zipfile
from pathlib import Path
from typing import Optional

import pytest

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.gateway.app import HTTP_200, HTTP_401, HTTP_404, application


def _call_app(
    *,
    path: str,
    method: str = "GET",
    key: Optional[str] = None,
    body: bytes = b"",
    extra_environ: Optional[dict[str, str]] = None,
) -> tuple[str, list[tuple[str, str]], bytes]:
    collected: dict[str, object] = {}

    def start_response(status: str, response_headers: list[tuple[str, str]], _exc_info=None):
        collected["status"] = status
        collected["headers"] = response_headers
        return None

    environ: dict[str, object] = {
        "REQUEST_METHOD": method,
        "PATH_INFO": path,
        "QUERY_STRING": "",
        "wsgi.url_scheme": "http",
        "wsgi.input": io.BytesIO(body),
        "SERVER_NAME": "testserver",
        "SERVER_PORT": "80",
        "CONTENT_LENGTH": str(len(body)),
    }
    if key is not None:
        environ["HTTP_X_MOBIUS_KEY"] = key
    if extra_environ:
        environ.update(extra_environ)

    body_iter = application(environ, start_response)
    try:
        response_body = b"".join(body_iter)
    finally:
        close = getattr(body_iter, "close", None)
        if callable(close):
            close()
    status = collected.get("status")
    headers = collected.get("headers")
    assert isinstance(status, str)
    assert isinstance(headers, list)
    return status, headers, response_body


def test_not_found_has_no_store(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    export_root = tmp_path / "exports"
    export_root.mkdir()
    monkeypatch.setenv("MOBIUS_EXPORT_ROOT", str(export_root))
    monkeypatch.setenv("MOBIUS_API_KEY", "secret")

    status, headers, body = _call_app(path="/does-not-exist", key="secret")

    assert status == HTTP_404
    assert ("Cache-Control", "no-store") in headers
    assert body == b""


def test_unauthorized_header(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    export_root = tmp_path / "exports"
    export_root.mkdir()
    monkeypatch.setenv("MOBIUS_EXPORT_ROOT", str(export_root))
    monkeypatch.setenv("MOBIUS_API_KEY", "secret")

    status, headers, body = _call_app(path="/exports/demo.zip")

    assert status == HTTP_401
    assert ("WWW-Authenticate", 'X-Mobius-Key realm="exports"') in headers
    assert ("Cache-Control", "no-store") in headers
    assert body == b""


def test_legacy_env_support(monkeypatch: pytest.MonkeyPatch, tmp_path: Path, caplog: pytest.LogCaptureFixture) -> None:
    export_root = tmp_path / "legacy"
    export_root.mkdir()
    zip_path = export_root / "bundle.zip"
    with zipfile.ZipFile(zip_path, "w") as zf:
        zf.writestr("README.txt", "hello")

    monkeypatch.delenv("MOBIUS_EXPORT_ROOT", raising=False)
    monkeypatch.delenv("MOBIUS_API_KEY", raising=False)
    monkeypatch.setenv("MOBIUS_EXPORTS_ROOT", str(export_root))
    monkeypatch.setenv("MOBIUS_GATEWAY_KEY", "legacy")
    monkeypatch.setenv("MOBIUS_CACHE_MODE", "immutable")

    with caplog.at_level("WARNING"):
        status, headers, body = _call_app(path="/exports/bundle.zip", key="legacy")

    assert status == HTTP_200
    assert ("Cache-Control", "public, max-age=31536000, immutable") in headers
    assert body != b""
    assert any("Using legacy env" in message for message in caplog.messages)
