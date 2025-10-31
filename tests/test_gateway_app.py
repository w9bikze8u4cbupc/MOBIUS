import hashlib
import os
import time
from datetime import datetime, timezone
from email.utils import format_datetime
from pathlib import Path

import pytest

from gateway import GatewayApplication, GatewayConfig
from tests.conftest import build_environ, run_request


def write_export(root: Path, relative: str, content: bytes) -> Path:
    target = root / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(content)
    return target


def headers_to_dict(headers):
    return {key.lower(): value for key, value in headers}


@pytest.mark.parametrize("method", ["GET", "HEAD"])
def test_streams_zip_and_sets_headers(call_app, exports_root, method):
    file_path = write_export(exports_root, "kit.zip", b"hello world")

    status, headers, body = call_app(
        method,
        "/exports/kit.zip",
        headers={"X-Mobius-Key": "test-key"},
    )

    assert status == 200
    header_map = headers_to_dict(headers)
    assert header_map["content-type"] == "application/zip"
    assert header_map["content-length"] == str(file_path.stat().st_size)
    assert header_map["etag"] == f'"{hashlib.sha256(b"hello world").hexdigest()}"'
    assert "last-modified" in header_map
    assert header_map["vary"] == "Accept-Encoding"
    assert header_map["accept-ranges"] == "bytes"
    assert header_map["cache-control"] == "public, max-age=0, must-revalidate"
    assert header_map["x-mobius-version"] == "1.2.3"
    assert header_map["content-disposition"].startswith("attachment;")

    if method == "GET":
        assert body == b"hello world"
    else:
        assert body == b""


@pytest.mark.parametrize("method", ["GET", "HEAD"])
def test_streams_digest(call_app, exports_root, method):
    content = b"abc123"
    write_export(exports_root, "stuff.zip", content)
    expected = hashlib.sha256(content).hexdigest()

    status, headers, body = call_app(
        method,
        "/exports/stuff.zip.sha256",
        headers={"X-Mobius-Key": "test-key"},
    )

    assert status == 200
    header_map = headers_to_dict(headers)
    assert header_map["content-type"] == "text/plain; charset=utf-8"
    assert header_map["cache-control"] == "public, max-age=0, must-revalidate"
    assert header_map["content-disposition"].startswith("attachment;")

    if method == "GET":
        assert body.decode("utf-8") == f"{expected}  stuff.zip\n"
    else:
        assert body == b""


def test_digest_matches_sha256_nested(call_app, exports_root):
    content = b"content"
    write_export(exports_root, "nested/export.zip", content)
    expected = hashlib.sha256(content).hexdigest()

    status, headers, body = call_app(
        "GET",
        "/exports/nested/export.zip.sha256",
        headers={"X-Mobius-Key": "test-key"},
    )

    assert status == 200
    assert body.decode("utf-8") == f"{expected}  nested/export.zip\n"


def test_not_modified_via_etag(app, exports_root):
    content = b"fresh"
    write_export(exports_root, "thing.zip", content)
    expected = hashlib.sha256(content).hexdigest()

    environ = build_environ(
        method="GET",
        path="/exports/thing.zip",
        headers={
            "X-Mobius-Key": "test-key",
            "If-None-Match": f'"{expected}"',
        },
    )
    status, headers, body = run_request(app, environ)

    assert status == 304
    header_map = headers_to_dict(headers)
    assert header_map["etag"] == f'"{expected}"'
    assert header_map["x-mobius-version"] == "1.2.3"
    assert body == b""


def test_not_modified_via_last_modified(app, exports_root):
    content = b"older"
    file_path = write_export(exports_root, "another.zip", content)
    mtime = time.time() - 10
    os.utime(file_path, (mtime, mtime))
    http_date = format_datetime(datetime.fromtimestamp(mtime, tz=timezone.utc), usegmt=True)

    environ = build_environ(
        method="GET",
        path="/exports/another.zip",
        headers={
            "X-Mobius-Key": "test-key",
            "If-Modified-Since": http_date,
        },
    )
    status, headers, body = run_request(app, environ)
    assert status == 304
    assert body == b""


def test_requires_authorization(call_app, exports_root):
    write_export(exports_root, "kit.zip", b"data")
    status, headers, body = call_app("GET", "/exports/kit.zip", headers={})
    assert status == 401
    header_map = headers_to_dict(headers)
    assert header_map["www-authenticate"].startswith("X-Mobius-Key")


def test_traversal_is_blocked(call_app, exports_root):
    write_export(exports_root, "safe.zip", b"data")
    status, headers, body = call_app(
        "GET",
        "/exports/../safe.zip",
        headers={"X-Mobius-Key": "test-key"},
    )
    assert status == 404


def test_health_requires_key_by_default(app):
    environ = build_environ(method="GET", path="/healthz")
    status, headers, body = run_request(app, environ)
    assert status == 401


def test_health_public_allows_without_key(exports_root):
    config = GatewayConfig(
        exports_root=exports_root,
        api_key="secret",
        version=None,
        cache_mode="revalidate",
        health_public=True,
    )
    app = GatewayApplication(config)
    environ = build_environ(method="GET", path="/healthz")
    status, headers, body = run_request(app, environ)
    assert status == 200
    assert body == b"ok\n"
    header_map = headers_to_dict(headers)
    assert header_map["cache-control"] == "no-store, max-age=0"


def test_cache_modes(exports_root):
    write_export(exports_root, "mode.zip", b"binary")

    for mode, expected in {
        "immutable": "public, max-age=31536000, immutable",
        "no-store": "no-store",
        "bypass": "no-store",
    }.items():
        config = GatewayConfig(
            exports_root=exports_root,
            api_key="test-key",
            version=None,
            cache_mode=mode,
            health_public=False,
        )
        app = GatewayApplication(config)
        status, headers, body = run_request(
            app,
            build_environ(
                method="GET",
                path="/exports/mode.zip",
                headers={"X-Mobius-Key": "test-key"},
            ),
        )
        assert status == 200
        header_map = headers_to_dict(headers)
        assert header_map["cache-control"] == expected


def test_gateway_config_from_environ(tmp_path):
    exports_root = tmp_path / "exports"
    env = {
        "MOBIUS_EXPORTS_ROOT": str(exports_root),
        "MOBIUS_GATEWAY_KEY": "abc",
        "MOBIUS_VERSION": "v1",
        "MOBIUS_CACHE_MODE": "IMMUTABLE",
        "MOBIUS_HEALTH_PUBLIC": "TrUe",
    }

    config = GatewayConfig.from_environ(env)
    assert config.exports_root == exports_root.resolve()
    assert config.api_key == "abc"
    assert config.version == "v1"
    assert config.cache_mode == "immutable"
    assert config.health_public is True

    with pytest.raises(ValueError):
        GatewayConfig.from_environ({
            "MOBIUS_EXPORTS_ROOT": str(exports_root),
            "MOBIUS_GATEWAY_KEY": "abc",
            "MOBIUS_CACHE_MODE": "invalid",
        })
