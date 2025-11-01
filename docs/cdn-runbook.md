# CDN Runbook for the Mobius Gateway

This runbook describes the edge configuration required to keep the WSGI export gateway fast while preserving cache correctness and security.

## Cache-key isolation

* Key requests on the full origin path **and** query string.
* Inject the `X-Mobius-Key` header at the edge – never let it leak into the cache key.
* Disable automatic inclusion of hop-by-hop headers such as `Connection` or `Via`.

## Validator passthrough

* Preserve `ETag` and `Last-Modified` headers from the origin.
* Honour `If-None-Match` and `If-Modified-Since` in conditional requests; allow 304 responses to flow through without rewriting headers.

## Header preservation

* Do **not** strip `Cache-Control`, `Content-Disposition`, or `Vary`.
* Forward `X-Mobius-Version` so clients can correlate releases with artifacts.
* Remove accidental cookies; the gateway never emits them.

## Cache behaviour by resource type

| Resource        | Cache-Control                             | Notes                                 |
|-----------------|--------------------------------------------|---------------------------------------|
| `*.zip`         | `public, immutable, max-age=31536000`      | Strong ETag + Last-Modified provided. |
| `*.sha256`      | `public, max-age=0, must-revalidate`       | Validators allow fast 304 responses.  |
| Errors/401/404  | `no-store`                                 | Prevent negative caching.             |
| `/health`       | `no-store`                                 | Health checks must stay fresh.        |

## Smoke tests

1. Fetch `/exports/<name>.zip` twice; second request should return `304 Not Modified` when validators are supplied.
2. Fetch `/exports/<name>.zip.sha256` and confirm the checksum matches the ZIP from step 1.
3. Validate that `/exports/<name>.zip` without `X-Mobius-Key` is rejected with `401`.
4. Hit `/health` and ensure the `X-Mobius-Version` header is present.

Following the above keeps CDN caches warm, safe, and perfectly aligned with origin headers.
