"""Threaded HTTP server that delegates to the lightweight gateway app."""

from __future__ import annotations

import asyncio
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import ClassVar, Tuple
from urllib.parse import urlsplit

from .app import GatewayApp
from .types import Request, Response


class GatewayRequestHandler(BaseHTTPRequestHandler):
    """Handle HTTP requests by dispatching them to the configured app."""

    app: ClassVar[GatewayApp]

    def _dispatch(self) -> None:
        method = self.command or "GET"
        headers = {k: v for k, v in self.headers.items()}
        parsed = urlsplit(self.path)
        path_only = parsed.path or "/"
        client: Tuple[str, int] = (self.client_address[0], self.client_address[1])
        request = Request(method, path_only, headers=headers, client=client)
        response = asyncio.run(self.app.dispatch(request))
        self._send_response(response)

    def _send_response(self, response: Response) -> None:
        self.send_response(response.status_code)
        for key, value in response.headers.items():
            self.send_header(key, value)
        if "Content-Length" not in response.headers:
            self.send_header("Content-Length", str(len(response.body)))
        self.end_headers()
        if response.body:
            self.wfile.write(response.body)

    # Delegate to the shared dispatch routine for the verbs we care about.
    def do_GET(self) -> None:  # noqa: N802 - match BaseHTTPRequestHandler signature
        self._dispatch()

    def do_HEAD(self) -> None:  # noqa: N802
        self._dispatch()

    def do_POST(self) -> None:  # noqa: N802
        self._dispatch()

    def log_message(self, format: str, *args: object) -> None:  # noqa: A003 - match base class
        """Silence the default stderr logging to keep CI output clean."""

        return


def run(app: GatewayApp, host: str = "127.0.0.1", port: int = 8000) -> None:
    """Run the threaded HTTP server until interrupted."""

    handler = type("ConfiguredGatewayHandler", (GatewayRequestHandler,), {})
    handler.app = app
    server = ThreadingHTTPServer((host, port), handler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:  # pragma: no cover - CLI convenience
        pass
    finally:
        server.server_close()
