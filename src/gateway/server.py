from __future__ import annotations

import asyncio
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from fastapi import Request

from .app import create_app


class GatewayHandler(BaseHTTPRequestHandler):
    app = create_app()

    def do_GET(self) -> None:  # pragma: no cover - integration helper
        self._handle("GET")

    def do_HEAD(self) -> None:  # pragma: no cover - integration helper
        self._handle("HEAD")

    def _handle(self, method: str) -> None:
        headers = {k: v for k, v in self.headers.items()}
        request = Request(method, self.path, headers=headers, client=(self.client_address[0], self.client_address[1]))
        response = asyncio.run(self.app.dispatch(request))
        body = response.body if method == "GET" else b""
        status = response.status_code
        self.send_response(status)
        for key, value in response.headers.items():
            header_key = "Content-Length" if key.lower() == "content-length" else key
            self.send_header(header_key, value)
        self.end_headers()
        if body:
            self.wfile.write(body)


def run(host: str = "0.0.0.0", port: int = 8000) -> None:  # pragma: no cover - CLI helper
    server = ThreadingHTTPServer((host, port), GatewayHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:  # pragma: no cover
        pass
    finally:
        server.server_close()


if __name__ == "__main__":  # pragma: no cover
    run()
