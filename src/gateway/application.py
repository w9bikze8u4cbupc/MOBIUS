"""WSGI application that streams export artifacts and checksum metadata."""

from __future__ import annotations

import hashlib
import os
from datetime import datetime, timezone
from email.utils import format_datetime, parsedate_to_datetime
from pathlib import Path
from typing import Callable, Iterable, List, Mapping, MutableMapping, Optional, Tuple
from urllib.parse import quote
from wsgiref.util import FileWrapper

StartResponse = Callable[[str, List[Tuple[str, str]]], Callable[[bytes], None]]
HeaderList = List[Tuple[str, str]]


def _http_date_from_timestamp(timestamp: float) -> str:
    """Return an RFC 7231 HTTP-date string for ``timestamp``."""

    dt = datetime.fromtimestamp(timestamp, tz=timezone.utc)
    return format_datetime(dt, usegmt=True)


def _parse_if_modified_since(value: str) -> Optional[datetime]:
    try:
        dt = parsedate_to_datetime(value)
    except (TypeError, ValueError, IndexError):
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _sanitise_ascii_filename(filename: str) -> str:
    ascii_safe = []
    for char in filename:
        if char == '"':
            ascii_safe.append("'")
        elif 32 <= ord(char) <= 126:
            ascii_safe.append(char)
        else:
            ascii_safe.append("_")
    candidate = "".join(ascii_safe)
    return candidate or "download"


def _build_content_disposition(filename: str, disposition: str) -> str:
    ascii_name = _sanitise_ascii_filename(filename)
    encoded = quote(filename, safe="")
    return f"{disposition}; filename=\"{ascii_name}\"; filename*=UTF-8''{encoded}"


class GatewayApplication:
    """Serve export artifacts and checksum files over WSGI."""

    DEFAULT_CACHE_MODE = "revalidate"
    CACHE_CONTROL_POLICIES = {
        "revalidate": "public, max-age=0, must-revalidate",
        "immutable": "public, max-age=31536000, immutable",
        "no-store": "no-store",
    }

    def __init__(
        self,
        export_root: Path | str,
        *,
        api_key: Optional[str] = None,
        cache_mode: Optional[str] = None,
        version: Optional[str] = None,
        health_public: bool = False,
    ) -> None:
        self.export_root = Path(export_root).resolve()
        self.api_key = api_key
        self.cache_mode = (cache_mode or self.DEFAULT_CACHE_MODE).lower()
        if self.cache_mode not in self.CACHE_CONTROL_POLICIES:
            raise ValueError(f"Unsupported cache mode: {self.cache_mode}")
        self.version = version
        self.health_public = health_public

    @classmethod
    def from_environ(cls, environ: Optional[Mapping[str, str]] = None) -> "GatewayApplication":
        env = environ or os.environ
        root = env.get("MOBIUS_EXPORT_ROOT")
        if not root:
            raise RuntimeError("MOBIUS_EXPORT_ROOT is required")
        api_key = env.get("MOBIUS_API_KEY")
        cache_mode = env.get("MOBIUS_CACHE_MODE")
        version = env.get("MOBIUS_VERSION")
        health_public = env.get("MOBIUS_HEALTH_PUBLIC", "0").lower() in {"1", "true", "yes"}
        return cls(
            root,
            api_key=api_key,
            cache_mode=cache_mode,
            version=version,
            health_public=health_public,
        )

    def __call__(self, environ: MutableMapping[str, object], start_response: StartResponse) -> Iterable[bytes]:
        method = environ.get("REQUEST_METHOD", "GET")
        if method not in {"GET", "HEAD"}:
            start_response("405 Method Not Allowed", [("Allow", "GET, HEAD")])
            return []

        path = environ.get("PATH_INFO", "")
        if not isinstance(path, str):
            path = str(path)

        if not self._is_authorised(path, environ):
            return self._unauthorised(start_response)

        if path == "/healthz":
            return self._serve_health(method, start_response)

        if path.startswith("/exports/"):
            return self._serve_export(method, path, environ, start_response)

        start_response("404 Not Found", [("Content-Type", "text/plain; charset=utf-8")])
        return [b"Not Found"] if method == "GET" else []

    def _is_authorised(self, path: str, environ: Mapping[str, object]) -> bool:
        if path == "/healthz" and self.health_public:
            return True
        if self.api_key is None:
            return True
        provided = environ.get("HTTP_X_MOBIUS_KEY")
        if isinstance(provided, bytes):
            provided = provided.decode()
        return provided == self.api_key

    def _unauthorised(self, start_response: StartResponse) -> Iterable[bytes]:
        start_response(
            "401 Unauthorized",
            [
                ("Content-Type", "text/plain; charset=utf-8"),
                ("WWW-Authenticate", "Mobius"),
                ("Cache-Control", "no-store"),
            ],
        )
        return [b"Unauthorized"]

    def _serve_health(self, method: str, start_response: StartResponse) -> Iterable[bytes]:
        headers = [
            ("Content-Type", "text/plain; charset=utf-8"),
            ("Cache-Control", "no-store"),
        ]
        if self.version:
            headers.append(("X-Mobius-Version", self.version))

        start_response("200 OK", headers)
        return [b"ok\n"] if method == "GET" else []

    def _serve_export(
        self,
        method: str,
        path: str,
        environ: Mapping[str, object],
        start_response: StartResponse,
    ) -> Iterable[bytes]:
        requested = path[len("/exports/") :]
        if not requested:
            start_response("404 Not Found", [("Content-Type", "text/plain; charset=utf-8")])
            return [b"Not Found"] if method == "GET" else []

        if requested.endswith(".zip"):
            return self._serve_zip(method, requested, environ, start_response)
        if requested.endswith(".zip.sha256"):
            return self._serve_sha256(method, requested, environ, start_response)

        start_response("404 Not Found", [("Content-Type", "text/plain; charset=utf-8")])
        return [b"Not Found"] if method == "GET" else []

    def _resolve_path(self, relative: str) -> Optional[Path]:
        unsafe = Path(relative)
        candidate = (self.export_root / unsafe).resolve()
        try:
            candidate.relative_to(self.export_root)
        except ValueError:
            return None
        return candidate

    def _serve_zip(
        self,
        method: str,
        requested: str,
        environ: Mapping[str, object],
        start_response: StartResponse,
    ) -> Iterable[bytes]:
        file_path = self._resolve_path(requested)
        if file_path is None or not file_path.is_file():
            start_response("404 Not Found", [("Content-Type", "text/plain; charset=utf-8")])
            return [b"Not Found"] if method == "GET" else []

        digest = self._digest_for_path(file_path)
        stat = file_path.stat()
        last_modified = _http_date_from_timestamp(stat.st_mtime)
        etag = f'"{digest}"'

        base_headers = self._common_headers(last_modified, etag)
        base_headers.append(("Vary", "Accept-Encoding"))
        base_headers.append(("Accept-Ranges", "bytes"))
        base_headers.append(("Content-Type", "application/zip"))
        base_headers.append(
            ("Content-Disposition", _build_content_disposition(file_path.name, "attachment"))
        )
        if self.version:
            base_headers.append(("X-Mobius-Version", self.version))

        if self._is_not_modified(etag, stat.st_mtime, environ):
            start_response("304 Not Modified", base_headers)
            return []

        headers = list(base_headers)
        headers.append(("Content-Length", str(stat.st_size)))

        start_response("200 OK", headers)
        if method == "HEAD":
            return []

        return FileWrapper(open(file_path, "rb"))

    def _serve_sha256(
        self,
        method: str,
        requested: str,
        environ: Mapping[str, object],
        start_response: StartResponse,
    ) -> Iterable[bytes]:
        zip_name = requested[: -len(".sha256")]
        zip_path = self._resolve_path(zip_name)
        if zip_path is None or not zip_path.is_file():
            start_response("404 Not Found", [("Content-Type", "text/plain; charset=utf-8")])
            return [b"Not Found"] if method == "GET" else []

        digest = self._digest_for_path(zip_path)
        stat = zip_path.stat()
        last_modified = _http_date_from_timestamp(stat.st_mtime)
        etag = f'"{digest}-sha"'

        base_headers = self._common_headers(last_modified, etag)
        base_headers.append(("Vary", "Accept-Encoding"))
        base_headers.append(("Accept-Ranges", "bytes"))
        base_headers.append(("Content-Type", "text/plain; charset=utf-8"))
        base_headers.append(
            (
                "Content-Disposition",
                _build_content_disposition(zip_path.name + ".sha256", "inline"),
            )
        )
        if self.version:
            base_headers.append(("X-Mobius-Version", self.version))

        if self._is_not_modified(etag, stat.st_mtime, environ):
            start_response("304 Not Modified", base_headers)
            return []

        body = f"{digest}  {zip_path.name}\n".encode("utf-8")
        headers = list(base_headers)
        headers.append(("Content-Length", str(len(body))))

        start_response("200 OK", headers)
        return [] if method == "HEAD" else [body]

    def _common_headers(self, last_modified: str, etag: str) -> HeaderList:
        headers = [
            ("Last-Modified", last_modified),
            ("ETag", etag),
            ("Cache-Control", self.CACHE_CONTROL_POLICIES[self.cache_mode]),
        ]
        return headers

    def _is_not_modified(
        self,
        etag: str,
        mtime: float,
        environ: Mapping[str, object],
    ) -> bool:
        if_none_match = environ.get("HTTP_IF_NONE_MATCH")
        if isinstance(if_none_match, bytes):
            if_none_match = if_none_match.decode()
        if if_none_match:
            etag_values = [tag.strip() for tag in if_none_match.split(",") if tag.strip()]
            if etag in etag_values or "*" in etag_values:
                return True

        ims = environ.get("HTTP_IF_MODIFIED_SINCE")
        if isinstance(ims, bytes):
            ims = ims.decode()
        if ims:
            parsed = _parse_if_modified_since(ims)
            if parsed is not None:
                resource_time = datetime.fromtimestamp(mtime, tz=timezone.utc)
                if resource_time <= parsed:
                    return True
        return False

    def _digest_for_path(self, path: Path) -> str:
        with open(path, "rb") as fh:
            digest = hashlib.file_digest(fh, "sha256")
        return digest.hexdigest()
