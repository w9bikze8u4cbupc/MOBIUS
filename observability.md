# Gateway Observability

This repository ships a WSGI middleware that exposes Prometheus metrics, optional OpenTelemetry traces, and JSONL audit logs for gateway events. The middleware is enabled automatically when importing `src.gateway.app.application`.

## Metrics

When `GATEWAY_PROMETHEUS_ENABLED=1` the middleware registers the following metrics using `prometheus_client`:

| Metric | Type | Labels | Description |
| --- | --- | --- | --- |
| `gateway_requests_total` | Counter | `route`, `method`, `status`, `service`, `version` | Number of requests handled. |
| `gateway_request_duration_seconds` | Histogram | `route`, `method`, `status`, `service`, `version` | Latency distribution for handled requests. |
| `gateway_artifact_bytes_total` | Counter | `route`, `service`, `version` | Bytes emitted per route. |
| `gateway_digest_verifications_total` | Counter | `result`, `service`, `version` | Digest verification attempts segmented by result. |
| `gateway_cdn_events_total` | Counter | `provider`, `cache_status`, `status`, `service`, `version` | CDN transfer events recorded by the gateway. |

The `/metrics` endpoint is exposed as a standalone WSGI app and bypasses gateway authentication. When running the gateway with multiple Gunicorn workers enable Prometheus multiprocess support by exporting `PROMETHEUS_MULTIPROC_DIR` and ensuring the directory is writable before the process forks.

## Tracing

OpenTelemetry tracing is disabled by default. Enable it with:

```bash
env GATEWAY_OTLP_ENABLED=1 GATEWAY_OTLP_ENDPOINT=http://otel-collector:4317 \
    GATEWAY_SERVICE=mobius-gateway GATEWAY_VERSION=v0.87.1 \
    python -m gunicorn src.gateway.app:application
```

When tracing is enabled the middleware initialises a `TracerProvider` with OTLP exporter and annotates spans with the request route and method.

## Audit Logging

Audit entries are emitted for HTTP requests, digest verification attempts, and CDN transfer events. Logs are persisted as JSONL files with stable key ordering and optional HMAC signatures.

* `GATEWAY_AUDIT_PATH` – Path to the audit file or directory. If the value has a suffix it is used as the JSONL file name; otherwise the middleware writes to `<path>/audit.jsonl`.
* `GATEWAY_AUDIT_HMAC_SECRET` – Optional shared secret used to sign each record with HMAC-SHA256.

Stored records contain reserved fields: `type`, `timestamp`, and `signature`. Extra fields passed via the API are filtered to avoid overwriting these keys. Failures to append audit entries are logged but do not interrupt request handling.

## Environment summary

* `GATEWAY_PROMETHEUS_ENABLED=0|1`
* `GATEWAY_PROMETHEUS_PORT=9464`
* `GATEWAY_OTLP_ENABLED=0|1`
* `GATEWAY_OTLP_ENDPOINT`
* `GATEWAY_SERVICE`
* `GATEWAY_VERSION`
* `GATEWAY_AUDIT_PATH`
* `GATEWAY_AUDIT_HMAC_SECRET`

Audit retention can be managed outside the process by rotating or deleting the JSONL file.
