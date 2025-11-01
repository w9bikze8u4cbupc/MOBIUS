# Export Gateway CDN Runbook

## Overview
The export gateway (`gateway.application`) streams build artifacts from `MOBIUS_EXPORT_ROOT`. ZIP archives are immutable and cached for a year, while checksum manifests are always revalidated to surface newly published digests. All responses require the shared `MOBIUS_API_KEY` unless otherwise noted.

## Cache Keys & Validators
- **Cache key**: `<scheme>://<host><path>` — authentication headers must be excluded from any CDN cache key derivation.
- **Validators**:
  - `ETag`: Derived from the ZIP's `mtime_ns` and size, optionally mixed with the checksum digest.
  - `Last-Modified`: Mirrors the ZIP's `mtime`.
- CDNs should forward `If-None-Match` and `If-Modified-Since` from the edge to origin and honour `304 Not Modified` responses.

## Cache-Control Modes
| Asset Type | Cache-Control | Notes |
| ---------- | ------------- | ----- |
| `*.zip` | `public, immutable, max-age=31536000` | Immutable; safe for long-term caching. |
| `*.zip.sha256` / `*.sha256` | `public, max-age=0, must-revalidate` | Revalidate to pick up new checksums. |
| Errors (`401`, `403`, `404`) | `no-store` | Prevent negative caching. |

The gateway always sets `Vary: Accept-Encoding` for successful artifact responses.

## Required Header Forwarding
- Forward inbound `If-None-Match`, `If-Modified-Since`, `Range` (reserved for future use) to the origin.
- Preserve `ETag`, `Last-Modified`, `Cache-Control`, `Content-Disposition`, and `X-Mobius-Version` headers on cached responses.

## Authentication
- Origin expects `X-API-Key: <MOBIUS_API_KEY>` or `?key=<MOBIUS_API_KEY>`.
- 401 responses include `WWW-Authenticate: API-Key` and `Cache-Control: no-store`.
- Health endpoint authentication is optional and controlled via `MOBIUS_HEALTH_REQUIRE_KEY`.

## Health Checks
- `GET /health`
  - Response: `{"status":"ok","version":"<build>"}`
  - Headers: `Cache-Control: no-store`, `X-Mobius-Version: <build>`
  - When `MOBIUS_HEALTH_REQUIRE_KEY` is truthy, include the API key header.

## Smoke Tests
Run from the CDN edge or tooling host:

```bash
curl -sS -D - -o /tmp/sample.zip \
  -H "X-API-Key: $MOBIUS_API_KEY" \
  "https://gateway.example.com/sample.zip"

curl -sS -D - -o /tmp/sample.zip.sha256 \
  -H "X-API-Key: $MOBIUS_API_KEY" \
  "https://gateway.example.com/sample.zip.sha256"
```

Use `curl -I` with `-H 'If-None-Match: <etag>'` to confirm `304 Not Modified` behaviour. Validate the checksum by comparing `sha256sum /tmp/sample.zip` with the manifest contents.

## Incident Response
1. **401/403 spikes**: Verify API key distribution and CDN authentication forwarding.
2. **Stale checksum**: Ensure CDN honours revalidation directives; purge checksum object if necessary.
3. **Unexpected 404**: Check artifact presence under `MOBIUS_EXPORT_ROOT` and confirm traversal protection is not triggered by bad paths.
4. **Health failures**: Inspect gateway logs, confirm version header, and validate environment variables.

Escalate to the release engineering team if the gateway returns repeated 5xx responses or if CDN cache purge fails.
