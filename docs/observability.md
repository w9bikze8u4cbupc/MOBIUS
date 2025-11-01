# Observability

The MOBIUS gateway now exposes a consistent telemetry surface backed by
Prometheus metrics, OpenTelemetry exporters, and structured audit logging. This
page summarises how to configure these features and how operational teams should
collect the resulting data.

## Metrics

The gateway publishes a Prometheus-compatible metrics feed and (optionally) an
OTLP exporter for upstream collectors.

### Prometheus endpoint

* **Path:** `GET /metrics`
* **WSGI app:** `src/gateway/app.py` exports `metrics_application` which can be
  mounted as a standalone WSGI endpoint when running under a router such as
  nginx or uwsgi.
* **Content type:** `text/plain; version=0.0.4`

The endpoint reports:

* `mobius_digest_verifications_total` – labelled by `status`, `artifact_kind`,
  and `source` to track manifest or artifact verification results.
* `mobius_cdn_fetch_total` – labelled by `provider`, `cache_status`, and
  `status_code` to understand CDN cache behaviour.
* The same counters are exposed to OpenTelemetry under the metric names
  `mobius.digest.verifications` and `mobius.cdn.fetches` for downstream OTLP
  exporters.

Enable/disable the Prometheus exporter with the `PROMETHEUS_METRICS_ENABLED`
boolean environment variable (defaults to `true`). When deploying behind a
reverse proxy ensure the metrics endpoint is protected with network controls or
basic authentication as required by your environment.

### OpenTelemetry

Set `OTLP_METRICS_ENDPOINT` to a `grpc://` or `https://` endpoint to enable OTLP
metric export. Additional configuration:

| Variable | Description |
| --- | --- |
| `OTLP_METRICS_ENABLED` | Explicitly force-enable or disable OTLP emission. When omitted it defaults to `true` only if `OTLP_METRICS_ENDPOINT` is set. |
| `OTLP_METRICS_HEADERS` | JSON object of headers (e.g. `{ "x-honeycomb-team": "..." }`). |
| `OTLP_METRICS_TIMEOUT` | Timeout in seconds for exporter RPCs. |
| `OTLP_RESOURCE_ATTRIBUTES` | JSON object of resource attributes appended to emitted metrics. |

The gateway uses the OpenTelemetry SDK; collectors can scrape the Prometheus
endpoint and/or receive OTLP traffic depending on deployment constraints.

## Audit logging

The module `mobius.observability.audit` implements JSONL audit logging with
optional SHA256 signing.

### Storage

By default audit records are written to `./logs/audit.jsonl`. Override the
location by setting `GATEWAY_AUDIT_PATH` or passing a custom storage backend
that implements the `append(record)` method. A simple file-backed storage class
(`JSONLStorage`) is provided along with a helper (`build_default_storage`).

### Signing

Configure `GATEWAY_AUDIT_SIGNING_SECRET` with a shared secret to enable record
signing. The signer produces HMAC-SHA256 digests that can be verified offline
using the helper methods in `mobius.observability.audit.DigestSigner`.

### Request logging

The WSGI middleware (`ObservabilityMiddleware`) and the optional FastAPI
middleware automatically append JSONL records for every request, including
request IDs, latency, and user-agent information. Any failure to write audit
entries is logged but does not break the request flow.

### Digest verification and CDN records

Call `emit_digest_verification` or `emit_cdn_transfer` from application code to
log verification outcomes and CDN fetch attempts. These helpers fan out to both
the audit log and metric backends so operations teams receive consistent event
streams.

## Retention and shipping

* **Retention:** Store JSONL audit files for a minimum of 30 days in production
  environments. Rotate files daily or when they exceed 200 MB. A simple cron job
  or logrotate rule targeting `logs/audit.jsonl` is sufficient.
* **Shipping:** Tail the JSONL file with your preferred shipper (e.g. Fluent
  Bit, Vector). Configure the shipper to parse each line as JSON, forward it to
  your SIEM, and remove the `signature` field only after verification.
* **Metrics:** Scrape `/metrics` every 15 seconds. When using OTLP push, deploy
  an OpenTelemetry Collector or managed SaaS endpoint that accepts the `grpc`
  protocol.

Following this configuration ensures consistent observability across both WSGI
and FastAPI entrypoints and gives operators actionable metrics for digest and
CDN behaviour.
