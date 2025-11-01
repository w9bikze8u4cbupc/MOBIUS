from __future__ import annotations

import io
from pathlib import Path
from tempfile import TemporaryDirectory
import sys
sys.path.append(str(Path(__file__).resolve().parents[1] / "src"))
from typing import Iterable

import pytest

from gateway import GatewayApplication, GatewayConfig


class StartResponseRecorder:
    def __init__(self) -> None:
        self.status: str | None = None
        self.headers: list[tuple[str, str]] | None = None

    def __call__(self, status: str, headers: list[tuple[str, str]]):
        self.status = status
        self.headers = headers
        return lambda _: None


def call_app(
    app: GatewayApplication,
    path: str,
    *,
    method: str = "GET",
    headers: dict[str, str] | None = None,
) -> tuple[str, list[tuple[str, str]], bytes]:
    environ: dict[str, str] = {
        "REQUEST_METHOD": method,
        "PATH_INFO": path,
        "SERVER_NAME": "localhost",
        "SERVER_PORT": "80",
        "wsgi.version": (1, 0),
        "wsgi.url_scheme": "http",
        "wsgi.input": io.BytesIO(b""),
    }
    if headers:
        for key, value in headers.items():
            environ[key] = value

    recorder = StartResponseRecorder()
    result = app(environ, recorder)
    body = b"".join(result)
    return recorder.status or "", recorder.headers or [], body


@pytest.fixture()
def sample_gateway() -> Iterable[GatewayApplication]:
    with TemporaryDirectory() as tmp:
        root = Path(tmp)
        payload = root / "fäncy name.txt"
        payload.write_text("payload", encoding="utf-8")
        config = GatewayConfig(
            exports_root=root,
            gateway_key="secret",
            cache_mode="revalidate",
            version="1.2.3",
            health_public=False,
        )
        yield GatewayApplication(config)


def test_rejects_missing_auth(sample_gateway: GatewayApplication) -> None:
    status, headers, body = call_app(sample_gateway, "/exports/fäncy%20name.txt")
    assert status == "401 Unauthorized"
    assert ("Cache-Control", "no-store") in headers
    assert body == b"unauthorized"


def test_serves_file_with_disposition_and_validators(sample_gateway: GatewayApplication) -> None:
    status, headers, body = call_app(
        sample_gateway,
        "/exports/fäncy%20name.txt",
        headers={"HTTP_X_MOBIUS_KEY": "secret"},
    )
    assert status == "200 OK"
    header_dict = dict(headers)
    assert header_dict["Content-Disposition"].startswith("attachment;")
    assert header_dict["ETag"]
    assert header_dict["Last-Modified"]
    assert header_dict["Cache-Control"] == "public, max-age=0, must-revalidate"
    assert body == "payload".encode()


def test_conditional_requests_hit_304(sample_gateway: GatewayApplication) -> None:
    status, headers, _ = call_app(
        sample_gateway,
        "/exports/fäncy%20name.txt",
        headers={"HTTP_X_MOBIUS_KEY": "secret"},
    )
    header_dict = dict(headers)
    etag = header_dict["ETag"]
    last_modified = header_dict["Last-Modified"]

    status2, headers2, body2 = call_app(
        sample_gateway,
        "/exports/fäncy%20name.txt",
        headers={
            "HTTP_X_MOBIUS_KEY": "secret",
            "HTTP_IF_NONE_MATCH": etag,
            "HTTP_IF_MODIFIED_SINCE": last_modified,
        },
    )
    assert status2 == "304 Not Modified"
    header_dict2 = dict(headers2)
    assert header_dict2["ETag"] == etag
    assert header_dict2["Last-Modified"] == last_modified
    assert body2 == b""


def test_digest_manifest(sample_gateway: GatewayApplication) -> None:
    status, headers, body = call_app(
        sample_gateway,
        "/exports/fäncy%20name.txt.sha256",
        headers={"HTTP_X_MOBIUS_KEY": "secret"},
    )
    assert status == "200 OK"
    assert body.endswith(b"  f\xc3\xa4ncy name.txt\n")
    header_dict = dict(headers)
    assert header_dict["Content-Type"].startswith("text/plain")


def test_traversal_is_blocked(sample_gateway: GatewayApplication) -> None:
    status, headers, body = call_app(
        sample_gateway,
        "/exports/../secret.txt",
        headers={"HTTP_X_MOBIUS_KEY": "secret"},
    )
    assert status == "404 Not Found"
    assert body == b"not found"


def test_health_requires_auth_when_private(sample_gateway: GatewayApplication) -> None:
    status, _headers, body = call_app(sample_gateway, "/healthz")
    assert status == "401 Unauthorized"
    assert body == b"unauthorized"

    status2, headers2, body2 = call_app(
        sample_gateway,
        "/healthz",
        headers={"HTTP_X_MOBIUS_KEY": "secret"},
    )
    assert status2 == "200 OK"
    assert b"ok" == body2
    assert ("X-Mobius-Version", "1.2.3") in headers2


def test_head_requests_return_no_body(sample_gateway: GatewayApplication) -> None:
    status, headers, body = call_app(
        sample_gateway,
        "/exports/fäncy%20name.txt",
        method="HEAD",
        headers={"HTTP_X_MOBIUS_KEY": "secret"},
    )
    assert status == "200 OK"
    assert body == b""
    assert ("Content-Length", "7") in headers


def test_config_from_env(tmp_path: Path) -> None:
    env = {
        "MOBIUS_EXPORT_ROOT": str(tmp_path),
        "MOBIUS_API_KEY": "key",
        "MOBIUS_CACHE_MODE": "immutable",
        "MOBIUS_GATEWAY_VERSION": "2.0",
        "MOBIUS_HEALTH_PUBLIC": "true",
    }
    config = GatewayConfig.from_env(env)
    assert config.exports_root == tmp_path.resolve()
    assert config.gateway_key == "key"
    assert config.cache_mode == "immutable"
    assert config.version == "2.0"
    assert config.health_public is True
