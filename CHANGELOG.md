# Changelog

## v0.87.0 - Observability GA

* Added a lightweight Prometheus exporter and audit logger under the
  `mobius.observability` package.
* Wired the gateway WSGI application to expose `/metrics` and emit digest
  verification audit events without impacting request latency.
* Added pytest coverage for metrics exposure, signed audit records, and
  resilience to audit write failures.
* Published operational runbooks including edge protection snippets and
  logrotate guidance.
* Introduced `scripts/verify_audit_signatures.py` to validate HMAC signatures
  offline.
