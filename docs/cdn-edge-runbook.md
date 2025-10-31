# Export Gateway CDN Runbook

This guide documents the minimum CDN configuration required to safely front the
Mobius export gateway (`src/gateway/app.py`). The service is a simple WSGI
application that serves build artifacts under `/exports/` and health probes at
`/healthz`.

## Cache keys

* **Ignore `X-Mobius-Key`:** strip the API key header from cache keys.
* **Include the path and query:** `/exports/{name}.zip` and `/exports/{name}.zip.sha256`
  produce different responses. The health check should not be cached.
* **Honor validators:** the origin emits strong `ETag` and `Last-Modified`
  headers; allow the CDN to return `304` when they match.

## TTLs and cache modes

The origin advertises three cache-control modes via the `MOBIUS_CACHE_MODE`
setting:

| Mode        | Cache-Control                                   | Notes                                   |
| ----------- | ------------------------------------------------ | --------------------------------------- |
| revalidate  | `public, max-age=0, must-revalidate`             | default; forces conditional revalidation |
| immutable   | `public, max-age=31536000, immutable`            | use for release channels with frozen bits |
| no-store    | `no-store`                                       | bypass CDN storage entirely             |

Respect the directive supplied by the origin and avoid overriding TTLs.

## Header passthrough

* Preserve the following response headers end-to-end: `Content-Disposition`,
  `Content-Length`, `Content-Type`, `ETag`, `Last-Modified`,
  `Cache-Control`, `Accept-Ranges`, `Vary`, and `X-Mobius-Version`.
* Do not strip `Vary: Accept-Encoding`; it keeps gzip aware caches honest.
* `X-Mobius-Version` mirrors the deployed build. Surface it in dashboards.

## Health checks

* `/healthz` is key-gated by default. When the `MOBIUS_HEALTH_PUBLIC` flag is
  enabled it becomes a public, uncached text response.
* Health responses are always `Cache-Control: no-store`.

## Failure modes

* Unauthorized requests return `401` with `WWW-Authenticate: X-Mobius-Key`.
* Path traversal attempts return `404` to avoid leaking the filesystem layout.
* Missing artifacts return `404` without caching.

## Logging

The gateway itself is intentionally minimal and does not emit logs. Capture
access logs at the CDN or ingress layer if request tracing is required.
