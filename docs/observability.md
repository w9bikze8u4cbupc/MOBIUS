# Gateway Observability Operations Guide

The MOBIUS gateway ships with a lightweight observability substrate that
exposes Prometheus metrics, JSONL audit logs, and optional OTLP exporters.
This guide summarises deployment considerations for operators.

## Metrics exposure

* Endpoint: `GET /metrics`
* Content type: `text/plain; version=0.0.4`
* Counters:
  * `mobius_digest_verifications_total{status,artifact_kind,source}`
  * `mobius_cdn_fetch_total{provider,cache_status,status_code}`

The endpoint is enabled by default. Restrict access using network ACLs or
edge authentication. Example snippets are available under
`deploy/examples/`:

* [`nginx-metrics-protect.conf`](../deploy/examples/nginx-metrics-protect.conf)
* [`cloud-edge-metrics-protect.yaml`](../deploy/examples/cloud-edge-metrics-protect.yaml)

## Audit logging

Audit events are appended to JSONL at the path provided via
`GATEWAY_AUDIT_PATH` (defaults to `./logs/audit.jsonl`). When
`GATEWAY_AUDIT_SIGNING_SECRET` is set, each record is signed with
HMAC-SHA256.

Rotation guidance is provided in
[`deploy/examples/logrotate.d/mobius-audit`](../deploy/examples/logrotate.d/mobius-audit).

Use `scripts/verify_audit_signatures.py` to validate signatures offline:

```bash
python scripts/verify_audit_signatures.py ./logs/audit.jsonl --secret "$GATEWAY_AUDIT_SIGNING_SECRET"
```

## Environment toggles

| Variable | Description |
| --- | --- |
| `PROMETHEUS_METRICS_ENABLED` | Enable Prometheus metrics exporter (default `1`). |
| `OTLP_METRICS_ENABLED` | Reserved toggle for OTLP push (disabled when unset). |
| `OTLP_METRICS_ENDPOINT` | Endpoint for OTLP exporter (optional). |
| `OTLP_METRICS_HEADERS` | JSON encoded headers for OTLP exporter. |
| `OTLP_RESOURCE_ATTRIBUTES` | JSON encoded resource attributes for telemetry. |
| `GATEWAY_AUDIT_PATH` | Location for audit JSONL file. |
| `GATEWAY_AUDIT_SIGNING_SECRET` | Secret for HMAC signatures. |

## Log shipping

Ship audit logs via the existing observability pipeline (Vector, Fluent Bit,
or similar). Ensure the pipeline preserves ordering to simplify signature
verification.
