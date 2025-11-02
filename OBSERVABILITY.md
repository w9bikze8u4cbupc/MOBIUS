# Observability Guide

This document outlines the key observability surfaces that ship with Mobius v0.10.0.

## Health Probes

Two layers of liveness and readiness probes are exposed by both the Python gateway and the Node API services:

- `GET /livez` — inexpensive probe used by Kubernetes liveness checks. Returns `200 ok` without authentication.
- `GET /readyz` — readiness probe. Validates local filesystem readiness and Redis connectivity (when configured). Returns `200 ok` when healthy, otherwise `503 degraded`.
- `GET /healthz` — legacy compatibility alias. Behaviour mirrors `/readyz` while still respecting the `health_public` configuration flag on the gateway.

All probes return `Cache-Control: no-store` to prevent intermediary caching.

## Prometheus Metrics

Both services expose Prometheus metrics on `/metrics` when the optional `prom-client`/`prometheus-client` dependencies are present.

### Node API

- Endpoint: `GET /metrics`
- Default collectors: prom-client default metrics (`process_cpu_seconds_total`, `nodejs_eventloop_lag_seconds`, etc.).
- Custom counter: `http_requests_total{method="<verb>",route="<path>",code="<status>"}` counting completed HTTP requests.

### Python Gateway

- Endpoint: `GET /metrics`
- Payload provided by `prometheus-client`. When the library is not installed the endpoint returns an empty payload with the Prometheus content type, enabling optional deploy-time wiring.

## CDN Metrics API

`POST /api/observability/cdn`
: Append a CDN metric event. Events are retained in Redis when `REDIS_URL` is configured, otherwise the in-memory fallback holds the latest 500 events.

`GET /api/observability/cdn`
: Returns a snapshot containing aggregate totals, the most recent update timestamp, and the recent event list. With Redis enabled the snapshot is assembled from the `cdn:events` list.

## Dashboards

Example PromQL queries:

- Request rate: `sum(rate(http_requests_total[5m]))`
- Error ratio: `sum(rate(http_requests_total{code=~"5.."}[5m])) / sum(rate(http_requests_total[5m]))`
- CDN event throughput (Redis-backed): `count_over_time(redis_key_length{key="cdn:events"}[5m])`

These signals combine with the `/readyz` and `/livez` probes to provide robust deployment health coverage.
