# Changelog

## Unreleased

### Added
- Introduced a WSGI export gateway that serves authenticated ZIP artifacts and SHA-256 manifests with strong HTTP validators and cache policies.
- Documented CDN integration practices, cache strategy, and operational runbook for the export gateway.
- Added pytest coverage for the gateway, including authentication, conditional requests, checksum validation, Unicode filenames, and health endpoint behavior.
