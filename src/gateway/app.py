import datetime as _dt
import hashlib
import os
from dataclasses import dataclass
from email.utils import format_datetime, parsedate_to_datetime
from pathlib import Path, PurePosixPath
from typing import Callable, Dict, Iterable, Iterator, List, Optional, Tuple
from urllib.parse import unquote

HTTPDate = str


_ALLOWED_CACHE_MODES = {
    "revalidate": "public, max-age=0, must-revalidate",
    "immutable": "public, max-age=31536000, immutable",
    "no-store": "no-store",
    "bypass": "no-store",
}


def _http_date_from_timestamp(timestamp: float) -> HTTPDate:
    dt = _dt.datetime.fromtimestamp(timestamp, tz=_dt.timezone.utc)
    return format_datetime(dt, usegmt=True)


def _parse_http_date(value: str) -> Optional[_dt.datetime]:
    try:
        dt = parsedate_to_datetime(value)
    except (TypeError, ValueError):
        return None
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=_dt.timezone.utc)
    return dt.astimezone(_dt.timezone.utc)


@dataclass(frozen=True)
class GatewayConfig:
    exports_root: Path
    api_key: str
    version: Optional[str] = None
    cache_mode: str = "revalidate"
    health_public: bool = False

    @classmethod
    def from_environ(cls, environ: Dict[str, str]) -> "GatewayConfig":
        try:
            root = environ["MOBIUS_EXPORTS_ROOT"]
        except KeyError as exc:
            raise KeyError("Missing MOBIUS_EXPORTS_ROOT") from exc

        try:
            api_key = environ["MOBIUS_GATEWAY_KEY"]
        except KeyError as exc:
            raise KeyError("Missing MOBIUS_GATEWAY_KEY") from exc

        cache_mode = environ.get("MOBIUS_CACHE_MODE", "revalidate").lower().strip()
        if cache_mode not in _ALLOWED_CACHE_MODES:
            raise ValueError(f"Unsupported cache mode: {cache_mode}")

        version = environ.get("MOBIUS_VERSION")
        health_public_raw = environ.get("MOBIUS_HEALTH_PUBLIC", "false").strip().lower()
        health_public = health_public_raw in {"1", "true", "yes", "on"}

        exports_root = Path(root).expanduser()
        try:
            exports_root = exports_root.resolve(strict=False)
        except RuntimeError:
            exports_root = exports_root.absolute()

        return cls(
            exports_root=exports_root,
            api_key=api_key,
            version=version,
            cache_mode=cache_mode,
            health_public=health_public,
        )


class GatewayApplication:
    def __init__(self, config: GatewayConfig):
        self.config = config
        self._root = config.exports_root
        try:
            self._root_resolved = self._root.resolve(strict=False)
        except RuntimeError:
            self._root_resolved = self._root.absolute()

    def __call__(self, environ: Dict[str, str], start_response: Callable) -> Iterable[bytes]:
        method = environ.get("REQUEST_METHOD", "GET").upper()
        if method not in {"GET", "HEAD"}:
            return self._method_not_allowed(start_response)

        path_info = environ.get("PATH_INFO", "") or "/"
        path_info = unquote(path_info)

        if path_info == "/healthz":
            return self._handle_health(method, environ, start_response)

        if not self._is_authorized(environ):
            return self._unauthorized(start_response)

        if not path_info.startswith("/exports/"):
            return self._not_found(start_response)

        return self._handle_exports(method, path_info, environ, start_response)

    def _is_authorized(self, environ: Dict[str, str]) -> bool:
        provided = environ.get("HTTP_X_MOBIUS_KEY")
        return provided == self.config.api_key

    def _handle_health(self, method: str, environ: Dict[str, str], start_response: Callable) -> Iterable[bytes]:
        if not self.config.health_public and not self._is_authorized(environ):
            return self._unauthorized(start_response)

        headers = [
            ("Content-Type", "text/plain; charset=utf-8"),
            ("Cache-Control", "no-store, max-age=0"),
        ]
        body = b"ok\n"
        status = "200 OK"
        if method == "HEAD":
            body_iter: Iterable[bytes] = []
        else:
            body_iter = [body]
        start_response(status, headers)
        return body_iter

    def _handle_exports(self, method: str, path_info: str, environ: Dict[str, str], start_response: Callable) -> Iterable[bytes]:
        relative = PurePosixPath(path_info)
        if any(part == ".." for part in relative.parts):
            return self._not_found(start_response)

        export_relative = PurePosixPath(*relative.parts[2:])
        if export_relative.name == "":
            return self._not_found(start_response)

        is_digest = False
        if export_relative.suffix == ".sha256":
            is_digest = True
            export_relative = export_relative.with_suffix("")

        if export_relative.suffix != ".zip":
            return self._not_found(start_response)

        file_path = (self._root / Path(*export_relative.parts)).resolve(strict=False)
        if not str(file_path).startswith(str(self._root_resolved)):
            return self._not_found(start_response)

        if not file_path.exists() or not file_path.is_file():
            return self._not_found(start_response)

        digest = self._sha256(file_path)
        stat_result = file_path.stat()
        etag = f'"{digest}"'
        last_modified = _http_date_from_timestamp(stat_result.st_mtime)

        if self._is_not_modified(environ, etag, stat_result.st_mtime):
            headers = self._build_common_headers(etag, last_modified)
            headers.append(("Cache-Control", _ALLOWED_CACHE_MODES[self.config.cache_mode]))
            if self.config.version:
                headers.append(("X-Mobius-Version", self.config.version))
            start_response("304 Not Modified", headers)
            return []

        if is_digest:
            body_bytes = self._build_digest_body(digest, export_relative)
            headers = self._build_common_headers(etag, last_modified)
            headers.extend(
                [
                    ("Content-Type", "text/plain; charset=utf-8"),
                    ("Content-Length", str(len(body_bytes))),
                    ("Cache-Control", _ALLOWED_CACHE_MODES[self.config.cache_mode]),
                    (
                        "Content-Disposition",
                        self._content_disposition(export_relative.name + ".sha256"),
                    ),
                ]
            )
            status = "200 OK"
            if method == "HEAD":
                body_iter: Iterable[bytes] = []
            else:
                body_iter = [body_bytes]
        else:
            headers = self._build_common_headers(etag, last_modified)
            headers.extend(
                [
                    ("Content-Type", "application/zip"),
                    ("Content-Length", str(stat_result.st_size)),
                    ("Cache-Control", _ALLOWED_CACHE_MODES[self.config.cache_mode]),
                    ("Content-Disposition", self._content_disposition(export_relative.name)),
                ]
            )
            status = "200 OK"
            if method == "HEAD":
                body_iter = []
            else:
                body_iter = self._stream_file(file_path)

        if self.config.version:
            headers.append(("X-Mobius-Version", self.config.version))

        start_response(status, headers)
        return body_iter

    def _stream_file(self, path: Path, chunk_size: int = 65536) -> Iterator[bytes]:
        with path.open("rb") as handle:
            while True:
                chunk = handle.read(chunk_size)
                if not chunk:
                    break
                yield chunk

    def _build_common_headers(self, etag: str, last_modified: HTTPDate) -> List[Tuple[str, str]]:
        return [
            ("ETag", etag),
            ("Last-Modified", last_modified),
            ("Vary", "Accept-Encoding"),
            ("Accept-Ranges", "bytes"),
        ]

    def _is_not_modified(self, environ: Dict[str, str], etag: str, mtime: float) -> bool:
        if_none_match = environ.get("HTTP_IF_NONE_MATCH")
        if if_none_match:
            etags = [tag.strip() for tag in if_none_match.split(",")]
            if etag in etags or "*" in etags:
                return True

        if_modified_since = environ.get("HTTP_IF_MODIFIED_SINCE")
        if if_modified_since:
            since_dt = _parse_http_date(if_modified_since)
            if since_dt is not None:
                resource_dt = _dt.datetime.fromtimestamp(mtime, tz=_dt.timezone.utc)
                resource_dt = resource_dt.replace(microsecond=0)
                since_dt = since_dt.replace(microsecond=0)
                if resource_dt <= since_dt:
                    return True
        return False

    def _build_digest_body(self, digest: str, export_relative: PurePosixPath) -> bytes:
        filename = str(export_relative)
        if os.sep != "/":
            filename = filename.replace(os.sep, "/")
        line = f"{digest}  {filename}\n"
        return line.encode("utf-8")

    def _content_disposition(self, filename: str) -> str:
        ascii_name = filename.encode("ascii", "ignore").decode("ascii")
        if not ascii_name:
            ascii_name = "download"
        quoted_ascii = ascii_name.replace("\\", "\\\\").replace("\"", r"\"")
        utf8_bytes = filename.encode("utf-8")
        encoded_utf8 = "".join(
            f"%{byte:02X}" if not (0x30 <= byte <= 0x39 or 0x41 <= byte <= 0x5A or 0x61 <= byte <= 0x7A or byte in (0x2D, 0x2E, 0x5F, 0x7E)) else chr(byte)
            for byte in utf8_bytes
        )
        return f"attachment; filename=\"{quoted_ascii}\"; filename*=UTF-8''{encoded_utf8}"

    def _sha256(self, path: Path) -> str:
        digest = hashlib.sha256()
        with path.open("rb") as handle:
            for chunk in iter(lambda: handle.read(65536), b""):
                digest.update(chunk)
        return digest.hexdigest()

    def _not_found(self, start_response: Callable) -> Iterable[bytes]:
        headers = [("Content-Type", "text/plain; charset=utf-8"), ("Cache-Control", "no-store")]
        start_response("404 Not Found", headers)
        return [b"not found\n"]

    def _unauthorized(self, start_response: Callable) -> Iterable[bytes]:
        headers = [
            ("Content-Type", "text/plain; charset=utf-8"),
            ("WWW-Authenticate", 'X-Mobius-Key realm="exports"'),
            ("Cache-Control", "no-store"),
        ]
        start_response("401 Unauthorized", headers)
        return [b"unauthorized\n"]

    def _method_not_allowed(self, start_response: Callable) -> Iterable[bytes]:
        headers = [
            ("Content-Type", "text/plain; charset=utf-8"),
            ("Allow", "GET, HEAD"),
            ("Cache-Control", "no-store"),
        ]
        start_response("405 Method Not Allowed", headers)
        return [b"method not allowed\n"]
