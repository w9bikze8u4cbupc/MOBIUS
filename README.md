# MOBIUS Gateway (Phase G1)

This repository contains a lightweight Python gateway built on top of a minimal FastAPI-compatible shim.  It serves export ZIP archives, enforces authentication and rate limiting, and exposes production-ready observability endpoints designed for offline environments.

## Endpoints

| Endpoint | Description |
| --- | --- |
| `GET /exports/{name}` | Streams a validated `.zip` from `EXPORTS_DIR`. Requires `X-Mobius-Key` header matching `MOBIUS_API_KEY`. |
| `HEAD /exports/{name}` | Returns metadata (`Content-Length`, `Content-Type`) for a `.zip` without sending the body. |
| `GET /exports/list` | Reads `EXPORTS_DIR/index.json` and returns the `artifacts` array filtered to safe `.zip` filenames. Responds with `404` if the index is missing and `500` if the file is invalid. |
| `GET /metrics` | Emits Prometheus text-format counters and histograms for request counts, latency buckets, and bytes served. Protected by the API key unless `MOBIUS_METRICS_PUBLIC=1`. |

### Registry index format

The `/exports/list` endpoint never performs filesystem enumeration in production.  It expects a pre-generated JSON index stored at `EXPORTS_DIR/index.json`:

```json
{
  "artifacts": ["alpha.zip", "beta.zip"]
}
```

Only filenames that match the hardened `SAFE_ZIP` pattern (`[A-Za-z0-9_.-]+\.zip`) are returned to clients.

### Metrics

Metrics are dependency-free and compatible with Prometheus scraping.  The gateway tracks:

* total requests and response counts per status family
* cumulative bytes streamed from `/exports`
* a fixed latency histogram (`gateway_request_duration_seconds_bucket`)

Enable anonymous access by setting `MOBIUS_METRICS_PUBLIC=1`; otherwise provide the standard API key header when scraping.

### Rate limiting

A token-bucket middleware protects the gateway.  Configuration is provided through environment variables:

* `RL_ENABLE` – set to `0`/`false` to disable the middleware (default `1`).
* `RL_BURST` – maximum burst size in tokens (default `60`).
* `RL_RATE_PER_SEC` – steady-state refill rate per second (default `1.0`).

Buckets are keyed by API key when present, falling back to the client IP address.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `MOBIUS_API_KEY` | Required authentication secret for all protected endpoints. |
| `EXPORTS_DIR` | Absolute path to the directory containing export archives and `index.json`. |
| `LOG_DIR` | Destination for audit log files. |
| `MOBIUS_METRICS_PUBLIC` | When truthy (`1`, `true`, `yes`, `on`), allows unauthenticated access to `/metrics`. |
| `RL_ENABLE` | Enables the rate limit middleware when truthy (defaults to enabled). |
| `RL_BURST` | Token bucket capacity. |
| `RL_RATE_PER_SEC` | Token refill rate per second. |

## Local development

1. Ensure Python 3.11 is available.
2. Run the test suite:

   ```bash
   pytest
   ```

3. Provide exports under the directory specified by `EXPORTS_DIR`.  Only well-formed `.zip` archives are served.

## Docker Compose example

The following snippet demonstrates how to wire the gateway with the new observability and rate-limiting controls:

```yaml
version: "3.9"
services:
  gateway:
    build: .
    environment:
      - EXPORTS_DIR=/app/exports
      - LOG_DIR=/app/logs
      - MOBIUS_API_KEY=change-me
      - RL_ENABLE=1
      - RL_BURST=120
      - RL_RATE_PER_SEC=2
      - MOBIUS_METRICS_PUBLIC=0
    volumes:
      - ./exports:/app/exports:ro
      - ./logs:/app/logs
    ports:
      - "8000:8000"
```

Adjust the command/entrypoint to match your deployment strategy (for example, pointing to a Uvicorn-compatible runner when integrating with a full Python runtime).

## Running offline

All dependencies live within this repository, including a FastAPI-compatible shim, making the gateway suitable for offline CI and air-gapped environments.
