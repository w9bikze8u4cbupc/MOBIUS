from __future__ import annotations

import datetime as _dt
import hashlib
import os
from email.utils import format_datetime, formatdate, parsedate_to_datetime
from pathlib import Path, PurePosixPath
from typing import Callable, Dict, Iterable, Iterator, Optional, Tuple

WSGIStartResponse = Callable[[str, Iterable[Tuple[str, str]], Optional[Tuple]], None]


class GatewayApplication:
    """Minimal WSGI gateway for exporting build artifacts.

    Parameters mirror the MOBIUS_* environment variables so the application can be
    instantiated either directly or via :meth:`from_environ`.
    """

    def __init__(
        self,
        export_root: Path | str,
        gateway_key: Optional[str],
        *,
        health_public: bool = False,
        version: Optional[str] = None,
        cache_mode: str = "revalidate",
        sha256_chunk: int = 65536,
    ) -> None:
        self.export_root = Path(export_root).resolve()
        self.gateway_key = gateway_key
        self.health_public = health_public
        self.version = version
        self.cache_mode = cache_mode.lower()
        self.sha256_chunk = max(int(sha256_chunk), 1024)
        self._digest_cache: Dict[Path, Tuple[int, int, str]] = {}

    # ------------------------------------------------------------------
    # Application construction helpers
    # ------------------------------------------------------------------
    @classmethod
    def from_environ(cls, environ: Optional[Dict[str, str]] = None) -> "GatewayApplication":
        environ = environ or os.environ
        export_root = environ.get("MOBIUS_EXPORT_ROOT")
        if not export_root:
            raise RuntimeError("MOBIUS_EXPORT_ROOT is required")
        gateway_key = environ.get("MOBIUS_GATEWAY_KEY")
        health_public = environ.get("MOBIUS_HEALTH_PUBLIC", "false").lower() in {"1", "true", "yes"}
        version = environ.get("MOBIUS_VERSION")
        cache_mode = environ.get("MOBIUS_CACHE_MODE", "revalidate")
        sha_chunk = int(environ.get("MOBIUS_SHA256_CHUNK", "65536"))
        return cls(
            export_root=export_root,
            gateway_key=gateway_key,
            health_public=health_public,
            version=version,
            cache_mode=cache_mode,
            sha256_chunk=sha_chunk,
        )

    # ------------------------------------------------------------------
    # WSGI entry point
    # ------------------------------------------------------------------
    def __call__(self, environ: Dict[str, object], start_response: WSGIStartResponse) -> Iterator[bytes]:
        method = str(environ.get("REQUEST_METHOD", "GET")).upper()
        if method not in {"GET", "HEAD"}:
            return self._respond(start_response, "405 Method Not Allowed", [("Allow", "GET, HEAD")], b"", method)

        path = str(environ.get("PATH_INFO", "")) or "/"
        if path == "/healthz":
            return self._handle_health(environ, start_response, method)

        if path.startswith("/exports/"):
            return self._handle_export(environ, start_response, method, path)

        return self._respond(start_response, "404 Not Found", [], b"", method)

    # ------------------------------------------------------------------
    # Route handlers
    # ------------------------------------------------------------------
    def _handle_health(
        self, environ: Dict[str, object], start_response: WSGIStartResponse, method: str
    ) -> Iterator[bytes]:
        if not self.health_public and not self._is_authorized(environ):
            return self._unauthorized(start_response, method)

        headers = self._standard_headers()
        headers.extend(
            [
                ("Content-Type", "text/plain; charset=utf-8"),
                ("Cache-Control", "no-store"),
            ]
        )
        body = b"ok" if method == "GET" else b""
        return self._respond(start_response, "200 OK", headers, body, method)

    def _handle_export(
        self,
        environ: Dict[str, object],
        start_response: WSGIStartResponse,
        method: str,
        path: str,
    ) -> Iterator[bytes]:
        if not self._is_authorized(environ):
            return self._unauthorized(start_response, method)

        resource = path[len("/exports/") :]
        if not resource:
            return self._respond(start_response, "404 Not Found", [], b"", method)

        relative = PurePosixPath(resource)
        if relative.is_absolute() or ".." in relative.parts:
            return self._respond(start_response, "404 Not Found", [], b"", method)

        is_sha_request = resource.endswith(".zip.sha256")
        if not (resource.endswith(".zip") or is_sha_request):
            return self._respond(start_response, "404 Not Found", [], b"", method)

        if is_sha_request:
            zip_relative = PurePosixPath(resource[: -len(".sha256")])
            target_path = (self.export_root / zip_relative).resolve()
            if not self._is_within_root(target_path):
                return self._respond(start_response, "404 Not Found", [], b"", method)
            if not target_path.exists() or not target_path.is_file():
                return self._respond(start_response, "404 Not Found", [], b"", method)
            return self._serve_sha256(environ, zip_relative.name, target_path, start_response, method)

        target_path = (self.export_root / relative).resolve()
        if not self._is_within_root(target_path):
            return self._respond(start_response, "404 Not Found", [], b"", method)
        if not target_path.exists() or not target_path.is_file():
            return self._respond(start_response, "404 Not Found", [], b"", method)

        return self._serve_file(environ, relative.name, target_path, start_response, method)

    # ------------------------------------------------------------------
    # Authorization helpers
    # ------------------------------------------------------------------
    def _is_authorized(self, environ: Dict[str, object]) -> bool:
        if not self.gateway_key:
            return True
        provided = environ.get("HTTP_X_MOBIUS_KEY")
        return isinstance(provided, str) and provided == self.gateway_key

    def _unauthorized(self, start_response: WSGIStartResponse, method: str) -> Iterator[bytes]:
        headers = self._standard_headers()
        headers.extend([
            ("Content-Type", "text/plain; charset=utf-8"),
            ("Cache-Control", "no-store"),
            ("WWW-Authenticate", 'X-Mobius-Key realm="exports"'),
        ])
        return self._respond(start_response, "401 Unauthorized", headers, b"unauthorized", method)

    # ------------------------------------------------------------------
    # File serving helpers
    # ------------------------------------------------------------------
    def _serve_file(
        self,
        environ: Dict[str, object],
        display_name: str,
        path: Path,
        start_response: WSGIStartResponse,
        method: str,
    ) -> Iterator[bytes]:
        stat = path.stat()
        etag = self._etag_for(path)
        last_modified = _dt.datetime.fromtimestamp(stat.st_mtime, _dt.timezone.utc).replace(microsecond=0)

        if self._is_not_modified(environ, method=method, etag=etag, last_modified=last_modified):
            # The helper requires headers; respond accordingly.
            headers = self._common_file_headers(etag, last_modified, cacheable=True)
            return self._respond(start_response, "304 Not Modified", headers, b"", method)

        headers = self._common_file_headers(etag, last_modified, cacheable=True)
        headers.extend(
            [
                ("Content-Type", "application/zip"),
                ("Content-Length", str(stat.st_size)),
                ("Content-Disposition", self._build_content_disposition(display_name)),
            ]
        )

        if method == "HEAD":
            return self._respond(start_response, "200 OK", headers, b"", method)

        body_iter = self._stream_file(path)
        return self._respond(start_response, "200 OK", headers, body_iter, method)

    def _serve_sha256(
        self,
        environ: Dict[str, object],
        display_name: str,
        path: Path,
        start_response: WSGIStartResponse,
        method: str,
    ) -> Iterator[bytes]:
        digest = self._sha256(path)
        payload = f"{digest}  {display_name}\n".encode("utf-8")
        etag = '"' + hashlib.sha256(payload).hexdigest() + '"'
        stat = path.stat()
        last_modified = _dt.datetime.fromtimestamp(stat.st_mtime, _dt.timezone.utc).replace(microsecond=0)

        if self._is_not_modified(environ, method=method, etag=etag, last_modified=last_modified):
            headers = self._common_file_headers(etag, last_modified, cacheable=True)
            return self._respond(start_response, "304 Not Modified", headers, b"", method)

        headers = self._common_file_headers(etag, last_modified, cacheable=True)
        headers.extend(
            [
                ("Content-Type", "text/plain; charset=utf-8"),
                ("Content-Length", str(len(payload))),
            ]
        )

        if method == "HEAD":
            return self._respond(start_response, "200 OK", headers, b"", method)

        return self._respond(start_response, "200 OK", headers, payload, method)

    # ------------------------------------------------------------------
    # Header helpers
    # ------------------------------------------------------------------
    def _standard_headers(self) -> list[Tuple[str, str]]:
        headers: list[Tuple[str, str]] = [("Date", formatdate(usegmt=True))]
        if self.version:
            headers.append(("X-Mobius-Version", self.version))
        return headers

    def _cache_control_value(self) -> str:
        mode = self.cache_mode
        if mode == "immutable":
            return "public, max-age=31536000, immutable"
        if mode == "no-store":
            return "no-store"
        return "public, max-age=0, must-revalidate"

    def _common_file_headers(
        self, etag: str, last_modified: _dt.datetime, *, cacheable: bool
    ) -> list[Tuple[str, str]]:
        headers = self._standard_headers()
        if cacheable:
            headers.append(("Cache-Control", self._cache_control_value()))
        headers.extend(
            [
                ("ETag", etag),
                ("Last-Modified", format_datetime(last_modified, usegmt=True)),
                ("Accept-Ranges", "bytes"),
                ("Vary", "Accept-Encoding"),
            ]
        )
        return headers

    def _build_content_disposition(self, filename: str) -> str:
        ascii_fallback = self._ascii_filename(filename)
        quoted_fallback = ascii_fallback.replace("\\", "_").replace('"', "_")
        rfc5987 = self._rfc5987_value(filename)
        return f"attachment; filename=\"{quoted_fallback}\"; filename*=UTF-8''{rfc5987}"

    @staticmethod
    def _ascii_filename(filename: str) -> str:
        if filename.isascii():
            return filename
        return "".join(ch if ch.isascii() else "_" for ch in filename) or "download.zip"

    @staticmethod
    def _rfc5987_value(filename: str) -> str:
        from urllib.parse import quote

        return quote(filename, safe="")

    # ------------------------------------------------------------------
    # Conditional request helpers
    # ------------------------------------------------------------------
    def _is_not_modified(
        self,
        environ: Optional[Dict[str, object]],
        *,
        method: str,
        etag: str,
        last_modified: _dt.datetime,
    ) -> bool:
        if method not in {"GET", "HEAD"}:
            return False

        if environ is None:
            return False

        if_none_match = environ.get("HTTP_IF_NONE_MATCH") if environ else None
        if if_none_match:
            candidates = {tag.strip() for tag in str(if_none_match).split(",")}
            if etag in candidates or "*" in candidates:
                return True

        if_modified_since = environ.get("HTTP_IF_MODIFIED_SINCE") if environ else None
        if if_modified_since:
            try:
                ims_dt = parsedate_to_datetime(str(if_modified_since))
                if ims_dt and ims_dt.tzinfo is None:
                    ims_dt = ims_dt.replace(tzinfo=_dt.timezone.utc)
            except (TypeError, ValueError):
                ims_dt = None
            if ims_dt and last_modified <= ims_dt:
                return True
        return False

    # ------------------------------------------------------------------
    # Digest helpers
    # ------------------------------------------------------------------
    def _sha256(self, path: Path) -> str:
        stat = path.stat()
        cached = self._digest_cache.get(path)
        marker = (stat.st_mtime_ns, stat.st_size)
        if cached and cached[:2] == marker:
            return cached[2]

        digest = hashlib.sha256()
        with path.open("rb") as handle:
            while True:
                chunk = handle.read(self.sha256_chunk)
                if not chunk:
                    break
                digest.update(chunk)
        hex_digest = digest.hexdigest()
        self._digest_cache[path] = (marker[0], marker[1], hex_digest)
        return hex_digest

    def _etag_for(self, path: Path) -> str:
        digest = self._sha256(path)
        return '"' + digest + '"'

    def _stream_file(self, path: Path) -> Iterator[bytes]:
        chunk_size = self.sha256_chunk
        with path.open("rb") as handle:
            while True:
                chunk = handle.read(chunk_size)
                if not chunk:
                    break
                yield chunk

    # ------------------------------------------------------------------
    # Response helpers
    # ------------------------------------------------------------------
    def _respond(
        self,
        start_response: WSGIStartResponse,
        status: str,
        headers: Iterable[Tuple[str, str]],
        body: Iterable[bytes] | bytes,
        method: str,
    ) -> Iterator[bytes]:
        response_headers = list(headers)
        existing_keys = {k.lower() for k, _ in response_headers}
        for key, value in self._standard_headers():
            if key.lower() not in existing_keys:
                response_headers.append((key, value))
                existing_keys.add(key.lower())
        if "date" not in existing_keys:
            response_headers.append(("Date", formatdate(usegmt=True)))
            existing_keys.add("date")
        start_response(status, response_headers)
        if method == "HEAD" or status.startswith("304"):
            return iter(())
        if isinstance(body, (bytes, bytearray)):
            return iter([bytes(body)])
        return iter(body)

    # ------------------------------------------------------------------
    # Misc helpers
    # ------------------------------------------------------------------
    def _is_within_root(self, target: Path) -> bool:
        try:
            target.relative_to(self.export_root)
            return True
        except ValueError:
            return False

