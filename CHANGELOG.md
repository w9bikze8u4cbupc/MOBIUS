# Changelog

## Unreleased

### Added
- Introduced gateway observability middleware with Prometheus metrics, optional OpenTelemetry traces, and JSONL audit logging.
- Documented observability configuration and metrics in `observability.md`.
- Hardened CDN and digest handlers with input validation and reserved-field protections for audit records.
- Configured CI to run with Prometheus metrics enabled and a stable audit log path.
