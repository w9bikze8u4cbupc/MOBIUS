"""Tests for the WSGI export gateway."""
from __future__ import annotations

import hashlib
import os
import sys
import time
from io import BytesIO
from pathlib import Path
from typing import Callable, Iterable
from wsgiref.util import setup_testing_defaults
import zipfile

import pytest

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

import gateway
from gateway.application import GatewayApplication

StartResponse = Callable[[str, list[tuple[str, str]]], Callable[[bytes], object]]
ResponseIterable = Iterable[bytes]


def call_app(
    app: Callable[[dict[str, object], StartResponse], ResponseIterable],
    path: str,
    *,
    method: str = "GET",
    headers: dict[str, str] | None = None,
) -> tuple[str, dict[str, str], bytes]:
    environ: dict[str, object] = {}
    setup_testing_defaults(environ)
    environ["REQUEST_METHOD"] = method
    environ["PATH_INFO"] = path
    environ["wsgi.input"] = BytesIO(b"")
    environ["CONTENT_LENGTH"] = "0"
    if headers:
        for key, value in headers.items():
            environ[key] = value

    captured: dict[str, object] = {}
    write_chunks: list[bytes] = []

    def start_response(status: str, response_headers: list[tuple[str, str]], exc_info=None):  # type: ignore[override]
        captured["status"] = status
        captured["headers"] = list(response_headers)
        return write_chunks.append

    app_iter = app(environ, start_response)
    try:
        response_chunks = list(app_iter)
    finally:
        close = getattr(app_iter, "close", None)
        if callable(close):
            close()

    header_map = {name: value for name, value in captured.get("headers", [])}
    body = b"".join(write_chunks + response_chunks)
    return str(captured.get("status", "")), header_map, body


@pytest.fixture()
def gateway_setup(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> dict[str, object]:
    export_root = tmp_path / "exports"
    (export_root / "nested").mkdir(parents=True)
    sample_zip = export_root / "nested" / "sample.zip"
    with zipfile.ZipFile(sample_zip, "w") as archive:
        archive.writestr("hello.txt", "hello world\n")
    now = int(time.time())
    os.utime(sample_zip, (now, now))

    sha_path = sample_zip.with_suffix(".zip.sha256")
    digest = hashlib.sha256(sample_zip.read_bytes()).hexdigest()
    sha_path.write_text(f"{digest}  sample.zip\n", encoding="utf-8")

    unicode_zip = export_root / "nested" / "möbius résumé.zip"
    with zipfile.ZipFile(unicode_zip, "w") as archive:
        archive.writestr("greeting.txt", "hi\n")
    os.utime(unicode_zip, (now, now))

    monkeypatch.setenv("MOBIUS_EXPORT_ROOT", str(export_root))
    monkeypatch.setenv("MOBIUS_API_KEY", "test-key")
    monkeypatch.setenv("MOBIUS_VERSION", "2024.1")

    return {
        "root": export_root,
        "sample": sample_zip,
        "sha": sha_path,
        "unicode": unicode_zip,
    }


@pytest.fixture()
def gateway_app(gateway_setup: dict[str, object]) -> GatewayApplication:
    return GatewayApplication(
        export_root=gateway_setup["root"],
        api_key="test-key",
        version="2024.1",
    )


def test_zip_download_has_immutable_cache(gateway_app: GatewayApplication, gateway_setup: dict[str, object]) -> None:
    path = "/exports/" + str(Path(gateway_setup["sample"]).relative_to(gateway_setup["root"]))
    status, headers, body = call_app(
        gateway_app.application,
        path,
        headers={"HTTP_X_MOBIUS_KEY": "test-key"},
    )

    assert status == "200 OK"
    assert headers["Cache-Control"] == "public, immutable, max-age=31536000"
    assert headers["Content-Type"] == "application/zip"
    assert headers["Vary"] == "Accept-Encoding"
    assert "ETag" in headers
    assert "Last-Modified" in headers
    disposition = headers["Content-Disposition"]
    assert "filename=\"sample.zip\"" in disposition
    assert "filename*=UTF-8''sample.zip" in disposition
    assert headers["Content-Length"] == str(Path(gateway_setup["sample"]).stat().st_size)
    assert headers["X-Mobius-Version"] == "2024.1"
    assert body == Path(gateway_setup["sample"]).read_bytes()


def test_head_request_matches_get_headers(gateway_app: GatewayApplication, gateway_setup: dict[str, object]) -> None:
    relative = str(Path(gateway_setup["sample"]).relative_to(gateway_setup["root"]))
    status, headers, body = call_app(
        gateway_app.application,
        f"/exports/{relative}",
        method="HEAD",
        headers={"HTTP_X_MOBIUS_KEY": "test-key"},
    )

    assert status == "200 OK"
    assert body == b""
    assert headers["Content-Length"] == str(Path(gateway_setup["sample"]).stat().st_size)


def test_checksum_manifest_uses_revalidate_cache(gateway_app: GatewayApplication, gateway_setup: dict[str, object]) -> None:
    relative = str(Path(gateway_setup["sha"]).relative_to(gateway_setup["root"]))
    status, headers, body = call_app(
        gateway_app.application,
        f"/exports/{relative}",
        headers={"HTTP_X_MOBIUS_KEY": "test-key"},
    )

    assert status == "200 OK"
    assert headers["Cache-Control"] == "public, max-age=0, must-revalidate"
    text = body.decode("utf-8").replace("\r\n", "\n")
    assert text.endswith("  sample.zip\n")


def test_conditional_get_with_etag_returns_304(gateway_app: GatewayApplication, gateway_setup: dict[str, object]) -> None:
    relative = str(Path(gateway_setup["sample"]).relative_to(gateway_setup["root"]))
    _, headers, _ = call_app(
        gateway_app.application,
        f"/exports/{relative}",
        headers={"HTTP_X_MOBIUS_KEY": "test-key"},
    )
    etag = headers["ETag"]

    status, _, body = call_app(
        gateway_app.application,
        f"/exports/{relative}",
        headers={"HTTP_X_MOBIUS_KEY": "test-key", "HTTP_IF_NONE_MATCH": etag},
    )

    assert status == "304 Not Modified"
    assert body == b""


def test_if_modified_since_honors_second_precision(gateway_app: GatewayApplication, gateway_setup: dict[str, object]) -> None:
    relative = str(Path(gateway_setup["sample"]).relative_to(gateway_setup["root"]))
    _, headers, _ = call_app(
        gateway_app.application,
        f"/exports/{relative}",
        headers={"HTTP_X_MOBIUS_KEY": "test-key"},
    )
    last_modified = headers["Last-Modified"]

    status, _, body = call_app(
        gateway_app.application,
        f"/exports/{relative}",
        headers={
            "HTTP_X_MOBIUS_KEY": "test-key",
            "HTTP_IF_MODIFIED_SINCE": last_modified,
        },
    )

    assert status == "304 Not Modified"
    assert body == b""


def test_requests_without_key_are_rejected(gateway_app: GatewayApplication, gateway_setup: dict[str, object]) -> None:
    relative = str(Path(gateway_setup["sample"]).relative_to(gateway_setup["root"]))
    status, headers, body = call_app(
        gateway_app.application,
        f"/exports/{relative}",
        headers={},
    )

    assert status == "401 Unauthorized"
    assert headers["Cache-Control"] == "no-store"
    assert body == b"unauthorized"


def test_path_traversal_is_blocked(gateway_app: GatewayApplication) -> None:
    status, _, _ = call_app(
        gateway_app.application,
        "/exports/../secrets/hidden.zip",
        headers={"HTTP_X_MOBIUS_KEY": "test-key"},
    )

    assert status == "404 Not Found"


def test_private_health_requires_key(gateway_app: GatewayApplication) -> None:
    status, _, _ = call_app(gateway_app.application, "/health", headers={})
    assert status == "401 Unauthorized"

    status, headers, body = call_app(
        gateway_app.application,
        "/health",
        headers={"HTTP_X_MOBIUS_KEY": "test-key"},
    )

    assert status == "200 OK"
    assert headers["Cache-Control"] == "no-store"
    assert body == b"ok"


def test_public_health_allows_anonymous_access(gateway_setup: dict[str, object]) -> None:
    app = GatewayApplication(
        export_root=gateway_setup["root"],
        api_key="test-key",
        health_public=True,
        version="2024.1",
    )
    status, headers, body = call_app(app.application, "/health", headers={})
    assert status == "200 OK"
    assert headers["Cache-Control"] == "no-store"
    assert body == b"ok"


def test_unicode_filename_uses_rfc5987(gateway_app: GatewayApplication, gateway_setup: dict[str, object]) -> None:
    relative = str(Path(gateway_setup["unicode"]).relative_to(gateway_setup["root"]))
    status, headers, _ = call_app(
        gateway_app.application,
        f"/exports/{relative}",
        headers={"HTTP_X_MOBIUS_KEY": "test-key"},
    )

    assert status == "200 OK"
    disposition = headers["Content-Disposition"]
    assert "filename*=UTF-8''m%C3%B6bius%20r%C3%A9sum%C3%A9.zip" in disposition
    ascii_part = disposition.split(";")[1].split("=")[1].strip().strip('"')
    assert ascii_part


def test_module_level_application_uses_lazy_instantiation(gateway_setup: dict[str, object]) -> None:
    status, headers, body = call_app(
        gateway.application,
        "/exports/" + str(Path(gateway_setup["sample"]).relative_to(gateway_setup["root"])),
        headers={"HTTP_X_MOBIUS_KEY": "test-key"},
    )

    assert status == "200 OK"
    assert headers["Cache-Control"] == "public, immutable, max-age=31536000"
    assert body == Path(gateway_setup["sample"]).read_bytes()
