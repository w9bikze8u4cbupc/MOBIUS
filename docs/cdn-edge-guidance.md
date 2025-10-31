# CDN configuration for the export gateway

Deploying the WSGI gateway behind a CDN requires a few targeted settings so that
cached ZIP exports and checksum manifests stay consistent and secure.

## Cache-key isolation

* Exclude `X-Mobius-Key` (and any other origin-only authentication header) from
  the cache key. The origin enforces the key and responses are identical for
  authorised clients, so including the header would fragment the cache
  unnecessarily.
* Retain the request path and `Accept-Encoding` because the gateway advertises
  `Vary: Accept-Encoding` for gzip/brotli awareness.

## Validator passthrough

* Always forward `If-None-Match` and `If-Modified-Since` headers to the origin so
  that conditional revalidation can produce `304 Not Modified` responses.
* Permit `ETag` and `Last-Modified` headers from the origin to flow through
  unchanged—these values are derived from the on-disk artefacts and are the
  source of truth for cache validation.

## Response headers to preserve

* `Content-Disposition` (including the RFC 5987 `filename*` parameter) and
  `Content-Type` should not be altered; they ensure accurate filenames and
  download behaviour for Unicode artefacts.
* `Cache-Control` should also be passed through so that gateway-side overrides
  such as `immutable` or `no-store` reach clients.
* Allow `304 Not Modified` responses to bubble up to clients; they carry the
  same validators and reduce origin load.

## Cache-control modes

The gateway understands three cache modes (configured via
`MOBIUS_CACHE_MODE`):

* `revalidate` (default) – `public, max-age=0, must-revalidate`
* `immutable` – `public, max-age=31536000, immutable`
* `no-store` – `no-store`

Choose the mode that matches the release workflow for the exported artefacts.
