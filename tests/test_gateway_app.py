from __future__ import annotations

import importlib
import os
import sys
from email.utils import parsedate_to_datetime
from pathlib import Path

import pytest


pytest.importorskip("fastapi")


MODULE_NAME = "services.gateway.app"


def _reload_gateway(tmp_path: Path, strong: bool) -> object:
    if strong:
        os.environ["GATEWAY_STRONG_ETAG"] = "1"
    else:
        os.environ.pop("GATEWAY_STRONG_ETAG", None)

    os.environ["EXPORTS_DIR"] = str(tmp_path)

    if MODULE_NAME in sys.modules:
        del sys.modules[MODULE_NAME]

    return importlib.import_module(MODULE_NAME)


def test_maybe_304_handles_wildcard(tmp_path):
    module = _reload_gateway(tmp_path, strong=False)
    headers = {"ETag": 'W/"123-1"'}

    response = module._maybe_304("*", headers["ETag"], headers)

    assert response is not None
    assert response.status_code == 304


def test_maybe_304_matches_multiple_tokens(tmp_path):
    module = _reload_gateway(tmp_path, strong=False)
    headers = {"ETag": 'W/"etag-value"'}

    response = module._maybe_304('"nope", W/"etag-value"', headers["ETag"], headers)

    assert response is not None
    assert response.status_code == 304


def test_cache_headers_include_last_modified(tmp_path):
    module = _reload_gateway(tmp_path, strong=False)
    file_path = tmp_path / "example.bin"
    file_path.write_bytes(b"hello world")

    headers = module._cache_headers(file_path)

    assert headers["ETag"].startswith("W/")
    assert "Last-Modified" in headers
    # Ensure the header is parseable
    assert parsedate_to_datetime(headers["Last-Modified"]) is not None


def test_cache_headers_use_strong_etag_when_enabled(tmp_path):
    module = _reload_gateway(tmp_path, strong=True)
    file_path = tmp_path / "example.bin"
    file_path.write_bytes(b"hello world")

    headers = module._cache_headers(file_path)

    assert headers["ETag"].startswith('"')
    assert not headers["ETag"].startswith("W/")

