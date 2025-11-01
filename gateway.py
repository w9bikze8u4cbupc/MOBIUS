"""WSGI export gateway for serving build artifacts and checksum manifests.

This module exposes :data:`application` for WSGI servers such as gunicorn or
uWSGI.  The gateway streams immutable ZIP archives as well as their companion
SHA-256 manifest files while enforcing API key authentication, cache
directives, and conditional requests.
"""
from __future__ import annotations

import hashlib
import os
import urllib.parse
from datetime import datetime, timezone
from email.utils import format_datetime, parsedate_to_datetime
from pathlib import Path
from typing import Callable, Iterable, Iterator, Tuple

# Public exports -----------------------------------------------------------------

__all__ = ["application"]

# Configuration -------------------------------------------------------------------

DEFAULT_EXPORT_ROOT = Path.cwd() / "exports"

ALLOWED_EXTENSIONS = {".zip", ".sha256"}


class HTTPException(Exception):
    """Raised to short-circuit request handling with an HTTP response."""

    status: str
    headers: Tuple[Tuple[str, str], ...]
    body: bytes

    def __init__(self, status: str, headers: Iterable[Tuple[str, str]], body: bytes) -> None:
        super().__init__(status)
        self.status = status
        self.headers = tuple(headers)
        self.body = body


def _get_export_root() -> Path:
    root_env = os.environ.get("MOBIUS_EXPORT_ROOT")
    root = Path(root_env).expanduser() if root_env else DEFAULT_EXPORT_ROOT
    return root.resolve()


def _is_truthy(value: str | None) -> bool:
    if value is None:
        return False
    return value.lower() not in {"", "0", "false", "no"}


EXPORT_ROOT = _get_export_root()
API_KEY = os.environ.get("MOBIUS_API_KEY")
HEALTH_REQUIRES_KEY = _is_truthy(os.environ.get("MOBIUS_HEALTH_REQUIRE_KEY"))
BUILD_VERSION = os.environ.get("MOBIUS_BUILD_VERSION", "unknown")


# Utility helpers -----------------------------------------------------------------

def _read_header(environ: dict, name: str) -> str | None:
    key = f"HTTP_{name.upper().replace('-', '_')}"
    return environ.get(key)


def _parse_query(environ: dict) -> dict[str, list[str]]:
    query = environ.get("QUERY_STRING", "")
    if not query:
        return {}
    return urllib.parse.parse_qs(query, keep_blank_values=True)


def _require_api_key(environ: dict) -> None:
    if API_KEY is None:
        return

    provided = _read_header(environ, "X-API-Key")
    if provided is None:
        provided = _parse_query(environ).get("key", [None])[0]

    if provided != API_KEY:
        headers = (
            ("Content-Type", "application/json"),
            ("Cache-Control", "no-store"),
            ("WWW-Authenticate", "API-Key"),
        )
        raise HTTPException("401 Unauthorized", headers, b'{"error":"unauthorized"}')


def _ensure_within_root(target: Path) -> Path:
    resolved = target.resolve(strict=False)
    try:
        resolved.relative_to(EXPORT_ROOT)
    except ValueError as exc:
        raise HTTPException(
            "403 Forbidden",
            (("Content-Type", "application/json"), ("Cache-Control", "no-store")),
            b'{"error":"path_traversal"}',
        ) from exc

    if not resolved.exists():
        raise HTTPException(
            "404 Not Found",
            (("Content-Type", "application/json"), ("Cache-Control", "no-store")),
            b'{"error":"not_found"}',
        )

    return resolved


def _validate_extension(path: Path) -> None:
    if path.suffix not in ALLOWED_EXTENSIONS and not path.name.endswith(".zip.sha256"):
        raise HTTPException(
            "415 Unsupported Media Type",
            (("Content-Type", "application/json"), ("Cache-Control", "no-store")),
            b'{"error":"unsupported_extension"}',
        )


def _format_content_disposition(filename: str) -> str:
    safe_name = filename.replace("\r", "").replace("\n", "")
    ascii_name_bytes = safe_name.encode("ascii", "ignore")
    ascii_name = ascii_name_bytes.decode("ascii") if ascii_name_bytes else "download"
    ascii_name = ascii_name.replace('"', "'")

    disposition = f'attachment; filename="{ascii_name}"'

    if ascii_name != safe_name:
        quoted = urllib.parse.quote(safe_name.encode("utf-8"))
        disposition += f"; filename*=UTF-8''{quoted}"

    return disposition


def _strong_etag(stat_result, extra: str | None = None) -> str:
    token = f"{stat_result.st_mtime_ns:x}-{stat_result.st_size:x}"
    if extra:
        token = f"{token}-{extra}"
    return f'"{token}"'


def _format_last_modified(stat_result) -> str:
    dt = datetime.fromtimestamp(stat_result.st_mtime, tz=timezone.utc)
    return format_datetime(dt, usegmt=True)


def _check_conditionals(environ: dict, etag: str, last_modified: str) -> bool:
    inm = _read_header(environ, "If-None-Match")
    if inm:
        client_etags = {token.strip() for token in inm.split(',') if token.strip()}
        if etag in client_etags or "*" in client_etags:
            return True

    ims = _read_header(environ, "If-Modified-Since")
    if ims:
        try:
            ims_dt = parsedate_to_datetime(ims)
            last_dt = parsedate_to_datetime(last_modified)
        except (TypeError, ValueError):
            return False
        if ims_dt is None or last_dt is None:
            return False
        if ims_dt.tzinfo is None:
            ims_dt = ims_dt.replace(tzinfo=timezone.utc)
        if last_dt.tzinfo is None:
            last_dt = last_dt.replace(tzinfo=timezone.utc)
        if last_dt <= ims_dt:
            return True
    return False


def _guess_mime(path: Path) -> str:
    if path.suffix == ".zip" or path.name.endswith(".zip"):
        return "application/zip"
    return "text/plain; charset=utf-8"


def _iter_file(path: Path) -> Iterator[bytes]:
    with path.open("rb") as handle:
        while True:
            chunk = handle.read(64 * 1024)
            if not chunk:
                break
            yield chunk


def _sha256_digest(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _checksum_payload(zip_path: Path) -> tuple[bytes, str]:
    digest = _sha256_digest(zip_path)
    filename = zip_path.name
    payload = f"{digest}  {filename}\n".encode("utf-8")
    return payload, digest


def _serve_health(environ: dict, start_response: Callable) -> Iterable[bytes]:
    if HEALTH_REQUIRES_KEY:
        _require_api_key(environ)

    body = ("{" f'"status":"ok","version":"{BUILD_VERSION}"' "}").encode("utf-8")
    headers = (
        ("Content-Type", "application/json"),
        ("Cache-Control", "no-store"),
        ("X-Mobius-Version", BUILD_VERSION),
    )
    start_response("200 OK", list(headers))
    return [body]


def _serve_artifact(environ: dict, start_response: Callable, path: Path) -> Iterable[bytes]:
    method = environ.get("REQUEST_METHOD", "GET").upper()
    if method not in {"GET", "HEAD"}:
        raise HTTPException(
            "405 Method Not Allowed",
            (("Allow", "GET, HEAD"), ("Cache-Control", "no-store")),
            b"",
        )

    _require_api_key(environ)
    _validate_extension(path)

    if path.name.endswith(".sha256"):
        zip_candidate = path.with_suffix("")
        if zip_candidate.suffix != ".zip":
            zip_candidate = path.with_suffix(".zip")
        zip_path = _ensure_within_root(zip_candidate)
        payload, digest = _checksum_payload(zip_path)
        stat_result = zip_path.stat()
        content = payload
        etag = _strong_etag(stat_result, digest)
        last_modified = _format_last_modified(stat_result)
        cache_control = "public, max-age=0, must-revalidate"
        content_length = str(len(content))
        mime = "text/plain; charset=utf-8"
        iterator: Iterable[bytes]
        if method == "HEAD":
            iterator = []
        else:
            iterator = [content]
    else:
        file_path = _ensure_within_root(path)
        stat_result = file_path.stat()
        etag = _strong_etag(stat_result)
        last_modified = _format_last_modified(stat_result)
        cache_control = "public, immutable, max-age=31536000"
        content_length = str(stat_result.st_size)
        mime = _guess_mime(file_path)
        if method == "HEAD":
            iterator = []
        else:
            iterator = _iter_file(file_path)

    vary_header = ("Vary", "Accept-Encoding")

    if _check_conditionals(environ, etag, last_modified):
        headers = (
            ("Cache-Control", cache_control),
            ("ETag", etag),
            ("Last-Modified", last_modified),
            ("Accept-Ranges", "bytes"),
            vary_header,
        )
        start_response("304 Not Modified", list(headers))
        return []

    headers = [
        ("Content-Type", mime),
        ("Cache-Control", cache_control),
        ("ETag", etag),
        ("Last-Modified", last_modified),
        ("Content-Disposition", _format_content_disposition(path.name)),
        ("Accept-Ranges", "bytes"),
        vary_header,
    ]
    if method == "HEAD":
        headers.append(("Content-Length", content_length))
    else:
        headers.append(("Content-Length", content_length))
    start_response("200 OK", headers)
    return iterator


def application(environ, start_response: Callable) -> Iterable[bytes]:
    path_info = environ.get("PATH_INFO", "")
    if not path_info.startswith("/"):
        path_info = "/" + path_info

    if path_info in {"/", ""}:
        exception = HTTPException(
            "404 Not Found",
            (("Content-Type", "application/json"), ("Cache-Control", "no-store")),
            b'{"error":"not_found"}',
        )
        start_response(exception.status, list(exception.headers))
        return [exception.body]

    if path_info.startswith("/health"):
        try:
            return _serve_health(environ, start_response)
        except HTTPException as exc:  # pragma: no cover - defensive
            start_response(exc.status, list(exc.headers))
            return [exc.body]

    relative = path_info.lstrip("/")
    target = EXPORT_ROOT / relative

    try:
        return _serve_artifact(environ, start_response, target)
    except HTTPException as exc:
        start_response(exc.status, list(exc.headers))
        body = exc.body
        if environ.get("REQUEST_METHOD", "GET").upper() == "HEAD":
            body = b""
        return [body]


