"""WSGI application for serving export bundles.

This module exposes a single ``application`` callable compatible with WSGI
servers.  It authenticates requests using the ``X-Mobius-Key`` header and
serves ``.zip`` files from a configured export root.  Responses are tailored
for CDN usage with explicit cache directives and strict path validation.
"""

from __future__ import annotations

import json
import logging
import mimetypes
import os
from collections.abc import Callable, Iterable
from datetime import datetime, timezone
from email.utils import format_datetime
from pathlib import Path
from typing import Optional
from urllib.parse import quote, unquote
from wsgiref.util import FileWrapper

logger = logging.getLogger(__name__)

HTTP_200 = "200 OK"
HTTP_401 = "401 Unauthorized"
HTTP_404 = "404 Not Found"
HTTP_405 = "405 Method Not Allowed"
HTTP_500 = "500 Internal Server Error"

_StartResponse = Callable[[str, list[tuple[str, str]], Optional[tuple]], Callable[[bytes], object]]


class ConfigurationError(RuntimeError):
    """Raised when required environment configuration is missing."""


class GatewayError(RuntimeError):
    """Raised for request level errors such as failed authentication."""

    def __init__(self, status: str, message: str = "") -> None:
        super().__init__(message)
        self.status = status


_LEGACY_WARNED: set[str] = set()
_CACHE_CONTROL_TABLE = {
    "revalidate": "public, max-age=0, must-revalidate",
    "immutable": "public, max-age=31536000, immutable",
    "no-store": "no-store",
}


def _cache_control_value(mode: str) -> str:
    """Return the cache-control header for the configured cache mode."""

    return _CACHE_CONTROL_TABLE.get(mode, _CACHE_CONTROL_TABLE["revalidate"])


def _format_content_disposition(filename: str, disposition: str = "attachment") -> str:
    """Build a RFC 6266 compliant ``Content-Disposition`` header."""

    quoted = quote(filename, safe="")
    return f"{disposition}; filename=\"{filename}\"; filename*=UTF-8''{quoted}"


def _http_date(path: Path) -> str:
    stat_result = path.stat()
    ts = stat_result.st_mtime
    dt = datetime.fromtimestamp(ts, tz=timezone.utc)
    return format_datetime(dt, usegmt=True)


def _get_env_compat(primary: str, legacy: Optional[str] = None) -> str:
    """Fetch an environment variable, falling back to a legacy alias."""

    value = os.getenv(primary)
    if value:
        return value
    if legacy:
        legacy_value = os.getenv(legacy)
        if legacy_value:
            if legacy not in _LEGACY_WARNED:
                logger.warning("Using legacy env %s; please migrate to %s", legacy, primary)
                _LEGACY_WARNED.add(legacy)
            return legacy_value
    raise ConfigurationError(f"Environment variable {primary} must be set")


def _not_found(start_response: _StartResponse) -> Iterable[bytes]:
    start_response(HTTP_404, [("Content-Length", "0"), ("Cache-Control", "no-store")])
    return []


def _method_not_allowed(start_response: _StartResponse) -> Iterable[bytes]:
    start_response(
        HTTP_405,
        [
            ("Content-Length", "0"),
            ("Allow", "GET, HEAD"),
            ("Cache-Control", "no-store"),
        ],
    )
    return []


def _unauthorized(start_response: _StartResponse) -> Iterable[bytes]:
    start_response(
        HTTP_401,
        [
            ("Content-Length", "0"),
            ("WWW-Authenticate", 'X-Mobius-Key realm="exports"'),
            ("Cache-Control", "no-store"),
        ],
    )
    return []


def _health_response(start_response: _StartResponse, version: Optional[str]) -> Iterable[bytes]:
    payload = {"status": "ok"}
    if version:
        payload["version"] = version
    body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    start_response(
        HTTP_200,
        [
            ("Content-Type", "application/json"),
            ("Content-Length", str(len(body))),
            ("Cache-Control", "no-store"),
        ],
    )
    return [body]


def _require_api_key(environ: dict[str, str], expected: Optional[str]) -> None:
    provided = environ.get("HTTP_X_MOBIUS_KEY")
    if not expected or not provided or provided != expected:
        raise GatewayError(HTTP_401, "Unauthorized")


def _serve_file(
    *,
    path: Path,
    method: str,
    cache_mode: str,
    start_response: _StartResponse,
) -> Iterable[bytes]:
    cache_header = _cache_control_value(cache_mode)
    mime_type, _ = mimetypes.guess_type(path.name)
    content_type = mime_type or "application/octet-stream"
    size = path.stat().st_size
    headers = [
        ("Content-Type", content_type),
        ("Content-Length", str(size)),
        ("Content-Disposition", _format_content_disposition(path.name)),
        ("Cache-Control", cache_header),
        ("Last-Modified", _http_date(path)),
    ]
    start_response(HTTP_200, headers)
    if method == "HEAD":
        return []
    return FileWrapper(path.open("rb"))


def application(environ: dict[str, str], start_response: _StartResponse) -> Iterable[bytes]:
    method = environ.get("REQUEST_METHOD", "GET").upper()
    if method not in {"GET", "HEAD"}:
        return _method_not_allowed(start_response)

    try:
        root = Path(_get_env_compat("MOBIUS_EXPORT_ROOT", "MOBIUS_EXPORTS_ROOT")).resolve()
        if not root.is_dir():
            raise ConfigurationError("MOBIUS_EXPORT_ROOT must point to a directory")
        api_key = _get_env_compat("MOBIUS_API_KEY", "MOBIUS_GATEWAY_KEY")
        cache_mode = os.getenv("MOBIUS_CACHE_MODE", "revalidate")
        version = os.getenv("MOBIUS_VERSION")
        health_public = os.getenv("MOBIUS_HEALTH_PUBLIC") == "1"
    except ConfigurationError as exc:  # pragma: no cover - defensive
        body = str(exc).encode("utf-8")
        start_response(
            HTTP_500,
            [
                ("Content-Type", "text/plain; charset=utf-8"),
                ("Content-Length", str(len(body))),
                ("Cache-Control", "no-store"),
            ],
        )
        return [body]

    path_info = environ.get("PATH_INFO", "")
    if not path_info:
        return _not_found(start_response)

    if path_info == "/healthz":
        if not health_public:
            try:
                _require_api_key(environ, api_key)
            except GatewayError:
                return _unauthorized(start_response)
        return _health_response(start_response, version)

    try:
        _require_api_key(environ, api_key)
    except GatewayError:
        return _unauthorized(start_response)

    if not path_info.startswith("/exports/"):
        return _not_found(start_response)

    decoded = unquote(path_info)
    if not decoded or decoded.endswith("/"):
        return _not_found(start_response)

    relative = Path(decoded[len("/exports/"):])
    if any(part in {"", ".", ".."} for part in relative.parts):
        return _not_found(start_response)

    safe_path = (root / relative).resolve()
    try:
        safe_path.relative_to(root)
    except ValueError:
        return _not_found(start_response)

    if safe_path.suffix != ".zip":
        return _not_found(start_response)

    if not safe_path.exists() or not safe_path.is_file():
        return _not_found(start_response)

    return _serve_file(path=safe_path, method=method, cache_mode=cache_mode, start_response=start_response)


__all__ = [
    "ConfigurationError",
    "GatewayError",
    "application",
]
