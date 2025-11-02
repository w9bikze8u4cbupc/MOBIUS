"""Tests for the gateway health endpoints."""

from __future__ import annotations

from collections.abc import Iterable
from pathlib import Path
from tempfile import TemporaryDirectory
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "src"))

from gateway.app import GatewayApplication
from gateway.config import GatewayConfig


class StartResponseRecorder:
    def __init__(self) -> None:
        self.status = ""
        self.headers: list[tuple[str, str]] = []

    def __call__(self, status: str, headers: list[tuple[str, str]], exc_info=None) -> None:
        self.status = status
        self.headers = headers


def _call(app: GatewayApplication, path: str, method: str = "GET"):
    environ = {"REQUEST_METHOD": method, "PATH_INFO": path}
    recorder = StartResponseRecorder()
    iterable = app(environ, recorder)
    body = b"".join(iterable if isinstance(iterable, Iterable) else [])
    return recorder.status, dict(recorder.headers), body


def mk_app(tmpdir: str, public: bool = True) -> GatewayApplication:
    return GatewayApplication(
        GatewayConfig(Path(tmpdir), gateway_key="secret", health_public=public)
    )


def test_livez_is_public():
    with TemporaryDirectory() as tmp:
        app = mk_app(tmp, public=False)
        status, headers, body = _call(app, "/livez")
        assert status == "200 OK"
        assert body == b"ok"
        assert headers["Cache-Control"] == "no-store"


def test_readyz_private_when_not_public():
    with TemporaryDirectory() as tmp:
        app = mk_app(tmp, public=False)
        status, _, _ = _call(app, "/readyz")
        assert status == "401 Unauthorized"
