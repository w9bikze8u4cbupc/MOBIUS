import hashlib
import io
import os
from pathlib import Path
from typing import Dict, Iterable, Tuple

import pytest
from wsgiref.util import setup_testing_defaults

from gateway.app import GatewayApplication, GatewayConfig


def make_app(tmp_path: Path, **overrides) -> GatewayApplication:
    config = GatewayConfig(
        exports_root=tmp_path,
        api_key=overrides.pop("api_key", "secret"),
        version=overrides.pop("version", "2024.10"),
        cache_mode=overrides.pop("cache_mode", "revalidate"),
        health_public=overrides.pop("health_public", False),
        chunk_size=overrides.pop("chunk_size", 4096),
    )
    assert not overrides, f"Unexpected overrides: {overrides}"  # fail fast during tests
    return GatewayApplication(config)


def call_app(app: GatewayApplication, path: str, method: str = "GET", headers: Dict[str, str] | None = None, body: bytes = b"") -> Tuple[str, Dict[str, str], bytes]:
    environ: Dict[str, object] = {}
    setup_testing_defaults(environ)
    environ["REQUEST_METHOD"] = method
    environ["PATH_INFO"] = path
    environ["wsgi.input"] = io.BytesIO(body)
    environ["CONTENT_LENGTH"] = str(len(body))
    if headers:
        for key, value in headers.items():
            environ[f"HTTP_{key.upper().replace('-', '_')}"] = value

    captured: Dict[str, object] = {}

    def start_response(status: str, response_headers: Iterable[Tuple[str, str]], exc_info=None):
        captured["status"] = status
        captured["headers"] = list(response_headers)

    iterable = app(environ, start_response)
    try:
        content = b"".join(iterable)
    finally:
        close = getattr(iterable, "close", None)
        if callable(close):
            close()

    status = captured["status"]
    headers_dict = dict(captured["headers"])  # type: ignore[arg-type]
    return status, headers_dict, content


@pytest.fixture()
def artifact(tmp_path: Path) -> Path:
    path = tmp_path / "тест.zip"
    path.write_bytes(b"zip-binary-data")
    return path


def test_streams_zip_with_expected_headers(artifact: Path):
    app = make_app(artifact.parent)
    status, headers, body = call_app(app, f"/exports/{artifact.name}", headers={"X-Mobius-Key": "secret"})

    assert status == "200 OK"
    assert body == artifact.read_bytes()
    assert headers["Content-Type"] == "application/zip"
    assert headers["Cache-Control"] == "public, max-age=0, must-revalidate"
    assert headers["Content-Disposition"].startswith("attachment;")
    assert "filename*=" in headers["Content-Disposition"]
    assert headers["Vary"] == "Accept-Encoding"
    assert headers["Accept-Ranges"] == "bytes"
    assert headers["X-Mobius-Version"] == "2024.10"


def test_head_matches_get_headers(artifact: Path):
    app = make_app(artifact.parent)
    _, headers_get, _ = call_app(app, f"/exports/{artifact.name}", headers={"X-Mobius-Key": "secret"})
    status, headers_head, body_head = call_app(app, f"/exports/{artifact.name}", method="HEAD", headers={"X-Mobius-Key": "secret"})

    assert status == "200 OK"
    assert body_head == b""
    assert headers_head == headers_get


def test_sha256_virtual_document(artifact: Path):
    app = make_app(artifact.parent)
    status, headers, body = call_app(app, f"/exports/{artifact.name}.sha256", headers={"X-Mobius-Key": "secret"})

    expected_digest = hashlib.sha256(artifact.read_bytes()).hexdigest()
    assert status == "200 OK"
    assert body == f"{expected_digest}  {artifact.name}\n".encode()
    assert headers["Content-Type"] == "text/plain; charset=utf-8"
    assert headers["Content-Disposition"].startswith("attachment;")
    assert "filename*=" in headers["Content-Disposition"]
    assert "sha256" in headers["Content-Disposition"]


def test_if_none_match_returns_304(artifact: Path):
    app = make_app(artifact.parent)
    _, headers, _ = call_app(app, f"/exports/{artifact.name}", headers={"X-Mobius-Key": "secret"})
    status, headers_304, body = call_app(
        app,
        f"/exports/{artifact.name}",
        headers={"X-Mobius-Key": "secret", "If-None-Match": headers["ETag"]},
    )

    assert status == "304 Not Modified"
    assert body == b""
    assert headers_304["ETag"] == headers["ETag"]
    assert headers_304["Content-Length"] == "0"


def test_if_modified_since_returns_304(artifact: Path):
    app = make_app(artifact.parent)
    _, headers, _ = call_app(app, f"/exports/{artifact.name}", headers={"X-Mobius-Key": "secret"})
    status, headers_304, _ = call_app(
        app,
        f"/exports/{artifact.name}",
        headers={"X-Mobius-Key": "secret", "If-Modified-Since": headers["Last-Modified"]},
    )

    assert status == "304 Not Modified"
    assert headers_304["ETag"] == headers["ETag"]


def test_requires_api_key_for_exports(artifact: Path):
    app = make_app(artifact.parent)
    status, headers, body = call_app(app, f"/exports/{artifact.name}")

    assert status == "401 Unauthorized"
    assert headers["WWW-Authenticate"] == "X-Mobius-Key"
    assert headers["Cache-Control"] == "no-store"
    assert body == b"unauthorized\n"


def test_traversal_is_blocked(artifact: Path):
    app = make_app(artifact.parent)
    status, headers, _ = call_app(app, "/exports/../secret.zip", headers={"X-Mobius-Key": "secret"})

    assert status == "404 Not Found"
    assert headers["Cache-Control"] == "no-store"


def test_health_requires_key_when_not_public(artifact: Path):
    app = make_app(artifact.parent, health_public=False)
    status, _, body = call_app(app, "/healthz")
    assert status == "401 Unauthorized"
    assert body == b"unauthorized\n"

    status, headers, body = call_app(app, "/healthz", headers={"X-Mobius-Key": "secret"})
    assert status == "200 OK"
    assert headers["Cache-Control"] == "no-store"
    assert body == b"ok\n"


def test_health_public_flag_allows_unauthenticated_access(artifact: Path):
    app = make_app(artifact.parent, health_public=True)
    status, headers, body = call_app(app, "/healthz")

    assert status == "200 OK"
    assert headers["Cache-Control"] == "no-store"
    assert body == b"ok\n"


def test_cache_mode_immutable_changes_header(artifact: Path):
    app = make_app(artifact.parent, cache_mode="immutable")
    status, headers, _ = call_app(app, f"/exports/{artifact.name}", headers={"X-Mobius-Key": "secret"})

    assert status == "200 OK"
    assert headers["Cache-Control"] == "public, max-age=31536000, immutable"


def test_cache_mode_bypass_disables_caching(artifact: Path):
    app = make_app(artifact.parent, cache_mode="bypass")
    status, headers, _ = call_app(app, f"/exports/{artifact.name}", headers={"X-Mobius-Key": "secret"})

    assert status == "200 OK"
    assert headers["Cache-Control"] == "no-store"


def test_gateway_config_from_environ(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("MOBIUS_EXPORTS_ROOT", str(tmp_path))
    monkeypatch.setenv("MOBIUS_GATEWAY_KEY", "key")
    monkeypatch.setenv("MOBIUS_VERSION", "1.2.3")
    monkeypatch.setenv("MOBIUS_CACHE_MODE", "IMMUTABLE")
    monkeypatch.setenv("MOBIUS_HEALTH_PUBLIC", "1")

    config = GatewayConfig.from_environ(os.environ)
    assert config.exports_root == tmp_path.resolve()
    assert config.api_key == "key"
    assert config.version == "1.2.3"
    assert config.cache_mode == "immutable"
    assert config.health_public is True
