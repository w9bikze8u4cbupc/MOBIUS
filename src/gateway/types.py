"""Common request and response data structures for the gateway server."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, Mapping, Tuple


@dataclass(slots=True)
class Request:
    """An HTTP request dispatched to the lightweight gateway."""

    method: str
    path: str
    headers: Mapping[str, str]
    client: Tuple[str, int]


@dataclass(slots=True)
class Response:
    """A minimal HTTP response returned by the gateway."""

    status_code: int = 200
    body: bytes = b""
    headers: Dict[str, str] = field(default_factory=dict)

    def with_header(self, key: str, value: str) -> "Response":
        """Return a copy of the response with an additional header."""

        new_headers = dict(self.headers)
        new_headers[key] = value
        return Response(status_code=self.status_code, body=self.body, headers=new_headers)
