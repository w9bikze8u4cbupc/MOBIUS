from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, Optional


class Headers:
    def __init__(self, initial: Optional[Dict[str, str]] = None) -> None:
        self._store: Dict[str, str] = {}
        if initial:
            for key, value in initial.items():
                self[key] = value

    def __setitem__(self, key: str, value: str) -> None:
        self._store[key.lower()] = str(value)

    def setdefault(self, key: str, value: str) -> str:
        lower = key.lower()
        if lower not in self._store:
            self._store[lower] = str(value)
        return self._store[lower]

    def __getitem__(self, key: str) -> str:
        return self._store[key.lower()]

    def get(self, key: str, default: Optional[str] = None) -> Optional[str]:
        return self._store.get(key.lower(), default)

    def items(self):  # pragma: no cover - used for debugging
        return list(self._store.items())

    def update(self, values: Dict[str, str]) -> None:
        for key, value in values.items():
            self[key] = value


class Response:
    media_type = "text/plain"

    def __init__(
        self,
        content: Any = b"",
        status_code: int = 200,
        headers: Optional[Dict[str, str]] = None,
    ) -> None:
        if isinstance(content, str):
            body = content.encode("utf-8")
        elif isinstance(content, bytes):
            body = content
        else:
            raise TypeError("Response content must be str or bytes")
        self.body = body
        self.status_code = status_code
        self.headers = Headers(headers or {})
        if "content-type" not in self.headers._store:
            self.headers.setdefault("content-type", self.media_type)

    @property
    def text(self) -> str:
        return self.body.decode("utf-8")

    def json(self) -> Any:
        return json.loads(self.text or "null")


class JSONResponse(Response):
    media_type = "application/json"

    def __init__(self, content: Any, status_code: int = 200, headers: Optional[Dict[str, str]] = None) -> None:
        body = json.dumps(content, separators=(",", ":"))
        super().__init__(body, status_code=status_code, headers=headers)


class FileResponse(Response):
    media_type = "application/octet-stream"

    def __init__(self, path: Path, status_code: int = 200, headers: Optional[Dict[str, str]] = None) -> None:
        data = path.read_bytes()
        hdrs = {"content-length": str(len(data))}
        if headers:
            hdrs.update(headers)
        super().__init__(data, status_code=status_code, headers=hdrs)
