# Mobius

This repository powers the Mobius preview and export pipeline. In addition to the existing rendering workflows, it now ships a standalone WSGI export gateway that can be deployed via `gateway.application` with Gunicorn or uWSGI to distribute build artifacts securely.

## Export Gateway
- **Entrypoint:** `gateway.application`
- **Environment:**
  - `MOBIUS_EXPORT_ROOT` – absolute path containing ZIP artifacts.
  - `MOBIUS_API_KEY` – shared secret required for artifact access.
  - `MOBIUS_HEALTH_REQUIRE_KEY` – when truthy, secures `/health`.
  - `MOBIUS_BUILD_VERSION` – surfaced via `/health` and `X-Mobius-Version`.
- **Features:** Strong `ETag`/`Last-Modified` validators, cache policies for ZIPs and checksum manifests, traversal protection, and RFC 5987 compliant `Content-Disposition` headers.

See [EXPORT_GATEWAY_CDN_RUNBOOK.md](EXPORT_GATEWAY_CDN_RUNBOOK.md) for CDN integration guidance.
