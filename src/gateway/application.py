from __future__ import annotations

import hashlib
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from email.utils import format_datetime, parsedate_to_datetime
from http import HTTPStatus
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple
from urllib.parse import unquote, quote


DEFAULT_CHUNK_SIZE = 65536


@dataclass(frozen=True)
class GatewayConfig:
    """Configuration for :class:`GatewayApplication`."""

    root: Path
    api_key: Optional[str]
    health_public: bool
    version: Optional[str]
    cache_mode: str
    sha256_chunk: int

    @staticmethod
    def _as_bool(value: Optional[str]) -> bool:
        if value is None:
            return False
        value = value.strip().lower()
        return value in {"1", "true", "yes", "on"}

    @classmethod
    def from_environ(cls, environ: Optional[Dict[str, str]] = None) -> "GatewayConfig":
        env = os.environ if environ is None else environ
        root = Path(env.get("MOBIUS_EXPORT_ROOT", ".")).expanduser().resolve()
        api_key = env.get("MOBIUS_GATEWAY_KEY")
        health_public = cls._as_bool(env.get("MOBIUS_HEALTH_PUBLIC"))
        version = env.get("MOBIUS_VERSION")
        cache_mode = env.get("MOBIUS_CACHE_MODE", "revalidate").strip().lower()
        chunk_raw = env.get("MOBIUS_SHA256_CHUNK")
        chunk_size = DEFAULT_CHUNK_SIZE
        if chunk_raw:
            try:
                parsed = int(chunk_raw)
            except ValueError:
                parsed = DEFAULT_CHUNK_SIZE
            if parsed > 0:
                chunk_size = parsed
        return cls(
            root=root,
            api_key=api_key,
            health_public=health_public,
            version=version,
            cache_mode=cache_mode,
            sha256_chunk=chunk_size,
        )

    def cache_control_header(self) -> str:
        if self.cache_mode == "immutable":
            return "public, max-age=31536000, immutable"
        if self.cache_mode == "no-store":
            return "no-store"
        return "public, max-age=0, must-revalidate"


class GatewayApplication:
    """Minimal dependency WSGI application for streaming export artefacts."""

    def __init__(self, config: Optional[GatewayConfig] = None) -> None:
        self.config = config or GatewayConfig.from_environ()

    # -- WSGI -----------------------------------------------------------------
    def __call__(self, environ, start_response):  # type: ignore[override]
        request_method = environ.get("REQUEST_METHOD", "GET").upper()
        if request_method not in {"GET", "HEAD"}:
            return self._method_not_allowed(start_response)

        path_info = environ.get("PATH_INFO", "")
        try:
            path = _normalise_path(path_info)
        except ValueError:
            return self._not_found(start_response)

        if not self._is_authenticated(environ, path):
            return self._unauthorised(start_response)

        if path == "healthz":
            return self._health_response(request_method, start_response)

        if path.startswith("exports/"):
            return self._handle_exports(path[len("exports/"):], request_method, environ, start_response)

        return self._not_found(start_response)

    # -- Routes ---------------------------------------------------------------
    def _health_response(self, method: str, start_response):
        body = b"ok"
        headers = self._base_headers()
        headers.extend([
            ("Content-Type", "text/plain; charset=utf-8"),
            ("Cache-Control", "no-store"),
            ("Content-Length", str(len(body))),
        ])
        start_response(f"{HTTPStatus.OK.value} {HTTPStatus.OK.phrase}", headers)
        if method == "HEAD":
            return []
        return [body]

    def _handle_exports(self, export_path: str, method: str, environ, start_response):
        if export_path.endswith(".zip.sha256"):
            base_name = export_path[:-len(".sha256")]
            return self._serve_sha256(base_name, method, environ, start_response)
        if export_path.endswith(".zip"):
            return self._serve_file(export_path, method, environ, start_response)
        return self._not_found(start_response)

    # -- Authentication -------------------------------------------------------
    def _is_authenticated(self, environ, path: str) -> bool:
        if self.config.api_key is None:
            return True
        if path == "healthz" and self.config.health_public:
            return True
        provided = environ.get("HTTP_X_MOBIUS_KEY")
        return provided == self.config.api_key

    # -- Responses ------------------------------------------------------------
    def _serve_file(self, export_path: str, method: str, environ, start_response):
        try:
            file_path = _resolve_export_path(self.config.root, export_path)
        except ValueError:
            return self._not_found(start_response)

        if not file_path.is_file():
            return self._not_found(start_response)

        try:
            metadata = _FileMetadata.from_path(file_path, self.config.sha256_chunk)
        except OSError:
            return self._not_found(start_response)

        etag = _make_etag(metadata.content_digest)
        if self._is_not_modified(etag, metadata, environ):
            return self._not_modified_response(etag, metadata, start_response)

        headers = self._base_headers()
        headers.extend([
            ("Content-Type", "application/zip"),
            ("Content-Length", str(metadata.size)),
            ("Content-Disposition", _content_disposition(file_path.name)),
            ("ETag", etag),
            ("Last-Modified", format_datetime(metadata.modified_utc, usegmt=True)),
            ("Cache-Control", self.config.cache_control_header()),
            ("Accept-Ranges", "bytes"),
        ])

        start_response(f"{HTTPStatus.OK.value} {HTTPStatus.OK.phrase}", headers)
        if method == "HEAD":
            return []
        return _stream_file(file_path, self.config.sha256_chunk)

    def _serve_sha256(self, export_path: str, method: str, environ, start_response):
        try:
            file_path = _resolve_export_path(self.config.root, export_path)
        except ValueError:
            return self._not_found(start_response)

        if not file_path.is_file():
            return self._not_found(start_response)

        try:
            metadata = _FileMetadata.from_path(file_path, self.config.sha256_chunk)
        except OSError:
            return self._not_found(start_response)

        digest_line = f"{metadata.content_digest}  {file_path.name}\n".encode("utf-8")
        etag = _make_etag(metadata.content_digest + "-sha")
        if self._is_not_modified(etag, metadata, environ):
            return self._not_modified_response(etag, metadata, start_response)

        headers = self._base_headers()
        headers.extend([
            ("Content-Type", "text/plain; charset=utf-8"),
            ("Content-Length", str(len(digest_line))),
            ("Content-Disposition", _content_disposition(f"{file_path.name}.sha256")),
            ("ETag", etag),
            ("Last-Modified", format_datetime(metadata.modified_utc, usegmt=True)),
            ("Cache-Control", self.config.cache_control_header()),
            ("Accept-Ranges", "bytes"),
        ])

        start_response(f"{HTTPStatus.OK.value} {HTTPStatus.OK.phrase}", headers)
        if method == "HEAD":
            return []
        return [digest_line]

    def _not_modified_response(self, etag: str, metadata: "_FileMetadata", start_response):
        headers = self._base_headers()
        headers.extend([
            ("ETag", etag),
            ("Last-Modified", format_datetime(metadata.modified_utc, usegmt=True)),
            ("Cache-Control", self.config.cache_control_header()),
            ("Accept-Ranges", "bytes"),
        ])
        start_response(f"{HTTPStatus.NOT_MODIFIED.value} {HTTPStatus.NOT_MODIFIED.phrase}", headers)
        return []

    def _method_not_allowed(self, start_response):
        headers = self._base_headers()
        headers.extend([
            ("Content-Type", "text/plain; charset=utf-8"),
            ("Content-Length", "0"),
            ("Allow", "GET, HEAD"),
            ("Cache-Control", "no-store"),
        ])
        start_response(f"{HTTPStatus.METHOD_NOT_ALLOWED.value} {HTTPStatus.METHOD_NOT_ALLOWED.phrase}", headers)
        return []

    def _unauthorised(self, start_response):
        body = b"unauthorised"
        headers = self._base_headers()
        headers.extend([
            ("Content-Type", "text/plain; charset=utf-8"),
            ("Content-Length", str(len(body))),
            ("Cache-Control", "no-store"),
        ])
        start_response(f"{HTTPStatus.UNAUTHORIZED.value} {HTTPStatus.UNAUTHORIZED.phrase}", headers)
        return [body]

    def _not_found(self, start_response):
        body = b"not found"
        headers = self._base_headers()
        headers.extend([
            ("Content-Type", "text/plain; charset=utf-8"),
            ("Content-Length", str(len(body))),
            ("Cache-Control", "no-store"),
        ])
        start_response(f"{HTTPStatus.NOT_FOUND.value} {HTTPStatus.NOT_FOUND.phrase}", headers)
        return [body]

    def _base_headers(self) -> List[Tuple[str, str]]:
        headers = [("Vary", "Accept-Encoding")]
        if self.config.version:
            headers.append(("X-Mobius-Version", self.config.version))
        return headers

    def _is_not_modified(self, etag: str, metadata: "_FileMetadata", environ: Dict[str, str]) -> bool:
        inm = environ.get("HTTP_IF_NONE_MATCH")
        if inm and _etag_matches(etag, inm):
            return True
        ims = environ.get("HTTP_IF_MODIFIED_SINCE")
        if ims:
            try:
                since = parsedate_to_datetime(ims)
            except (TypeError, ValueError):
                since = None
            if since:
                if since.tzinfo is None:
                    since = since.replace(tzinfo=timezone.utc)
                if metadata.modified_utc <= since:
                    return True
        return False


# -- Helpers -----------------------------------------------------------------


def _normalise_path(path_info: str) -> str:
    if not path_info:
        raise ValueError
    path = path_info.strip()
    if not path.startswith("/"):
        raise ValueError
    path = path[1:]
    if path.endswith("/") and path:
        path = path[:-1]
    decoded = unquote(path)
    if decoded.startswith("/"):
        decoded = decoded[1:]
    return decoded


def _resolve_export_path(root: Path, relative: str) -> Path:
    if "\\" in relative:
        raise ValueError
    clean_relative = Path(relative)
    if clean_relative.is_absolute():
        raise ValueError
    if any(part in {"..", "", "."} for part in clean_relative.parts):
        raise ValueError
    normalised = Path(*clean_relative.parts)
    if any(part == "" for part in normalised.parts):
        raise ValueError
    resolved = (root / normalised).resolve()
    root_resolved = root.resolve()
    try:
        resolved.relative_to(root_resolved)
    except ValueError:
        raise ValueError from None
    return resolved


@dataclass
class _FileMetadata:
    path: Path
    size: int
    modified_utc: datetime
    content_digest: str

    @classmethod
    def from_path(cls, path: Path, chunk_size: int) -> "_FileMetadata":
        stat = path.stat()
        modified = datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).replace(microsecond=0)
        digest = _compute_digest(path, chunk_size)
        return cls(path=path, size=stat.st_size, modified_utc=modified, content_digest=digest)


def _compute_digest(path: Path, chunk_size: int) -> str:
    hasher = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(chunk_size), b""):
            hasher.update(chunk)
    return hasher.hexdigest()


def _stream_file(path: Path, chunk_size: int) -> Iterable[bytes]:
    with path.open("rb") as fh:
        while True:
            data = fh.read(chunk_size)
            if not data:
                break
            yield data


def _make_etag(digest: str) -> str:
    return f'"{digest}"'


def _etag_matches(etag: str, header_value: str) -> bool:
    etags = [token.strip() for token in header_value.split(",") if token.strip()]
    for candidate in etags:
        if candidate == "*":
            return True
        if candidate.startswith("W/"):
            candidate = candidate[2:].strip()
        if candidate == etag:
            return True
    return False


def _content_disposition(filename: str) -> str:
    safe_ascii = _ascii_filename(filename)
    header = f'attachment; filename="{safe_ascii}"'
    try:
        filename.encode("ascii")
    except UnicodeEncodeError:
        header += f"; filename*=UTF-8''{quote(filename)}"
    return header


def _ascii_filename(filename: str) -> str:
    result_chars: List[str] = []
    for ch in filename:
        code = ord(ch)
        if 32 <= code < 127 and ch not in {'\\', '"'}:
            result_chars.append(ch)
        else:
            result_chars.append("_")
    ascii_name = "".join(result_chars)
    if not ascii_name:
        return "file"
    return ascii_name
