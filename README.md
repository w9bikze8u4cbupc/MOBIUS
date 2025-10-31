# Mobius Gateway Service

This repository contains a gateway responsible for serving pre-rendered export bundles.
It ships with a lightweight, FastAPI-compatible HTTP interface that keeps the
project fully self-contained for offline builds while focusing on safe, auditable
delivery of `.zip` artifacts.

## Features

- API key protected download endpoints using the `X-Mobius-Key` header.
- Offline-friendly dependency installation by caching built wheels in CI.
- Strict filename validation that only allows ZIP archives with safe names.
- Rich HTTP metadata (`ETag`, `Last-Modified`, `Accept-Ranges`, `Content-Disposition`)
  to integrate cleanly with proxies and CDNs.
- Structured audit logging that captures method, status code, client IP, and user agent.
- Security headers (`X-Content-Type-Options`, `Referrer-Policy`) on every response.

## Running locally

1. Ensure you have Python 3.10+ and Node.js 20 installed.
2. Install the Python dependencies using the cached wheelhouse (generated automatically
   in CI) or directly via pip:

   ```bash
   python -m pip install --upgrade pip
   pip install -r requirements.txt
   ```

3. Export an API key for local development:

   ```bash
   export MOBIUS_API_KEY=dev-secret
   export EXPORTS_DIR=$PWD/exports
   export LOG_DIR=$PWD/logs
   mkdir -p "$EXPORTS_DIR" "$LOG_DIR"
   ```

4. Start the FastAPI-compatible server:

   ```bash
   python -m src.gateway.server
   ```

5. Upload or copy a `.zip` artifact into `exports/` and download it with the required
   header:

   ```bash
   curl -H "X-Mobius-Key: $MOBIUS_API_KEY" \
        -O \
        -J \
        http://localhost:8000/exports/rapport_%C3%A9chantillon.zip
   ```

   The response includes both `filename=` and `filename*=` parameters to ensure Unicode
   compatibility across browsers and CDNs.

## Docker Compose

A ready-to-run Docker Compose file is provided. It mounts the local `exports` directory
as read-only and persists audit logs to `./logs`:

```bash
docker compose up --build
```

Update the `MOBIUS_API_KEY` environment variable in `docker-compose.yml` before running
in production.

## Testing

Python tests cover the gateway endpoints, audit logging, and header behavior:

```bash
pytest
```

Node-based tooling remains available for the existing rendering pipeline and can be
exercised with `npm test`.

For Unicode regression testing, the suite includes a scenario equivalent to:

```python
fn = "rapport_échantillon.zip"
response = client.get(f"/exports/{fn}", headers={"X-Mobius-Key": "secret"})
assert "filename*=" in response.headers["Content-Disposition"]
```

This ensures cross-platform downloads preserve non-ASCII filenames.
