"""Response classes for the FastAPI stub."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict


class Response:
    def __init__(
        self,
        content: bytes | str | None = None,
        *,
        status_code: int = 200,
        headers: Dict[str, str] | None = None,
        media_type: str = "application/octet-stream",
    ) -> None:
        if content is None:
            body = b""
        elif isinstance(content, bytes):
            body = content
        else:
            body = content.encode("utf-8")
        self.content = body
        self.status_code = status_code
        self.headers: Dict[str, str] = dict(headers or {})
        self.headers.setdefault("Content-Type", media_type)
        self.media_type = media_type

    @property
    def text(self) -> str:
        return self.content.decode("utf-8")


class JSONResponse(Response):
    def __init__(self, content: Any, *, status_code: int = 200, headers: Dict[str, str] | None = None) -> None:
        body = json.dumps(content)
        super().__init__(body, status_code=status_code, headers=headers, media_type="application/json")


class FileResponse(Response):
    def __init__(self, path: Path, *, media_type: str = "application/octet-stream", headers: Dict[str, str] | None = None) -> None:
        data = Path(path).read_bytes()
        super().__init__(data, status_code=200, headers=headers, media_type=media_type)


__all__ = ["Response", "JSONResponse", "FileResponse"]
