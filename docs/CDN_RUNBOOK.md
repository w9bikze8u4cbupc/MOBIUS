# MOBIUS Export Gateway CDN Runbook

This runbook describes the expectations for any CDN or reverse proxy that fronts
the MOBIUS export gateway. The service is a small WSGI application that streams
ZIP archives and companion checksum files from the directory specified by
`MOBIUS_EXPORT_ROOT`.

## Cache keys and request routing

* **Origin host:** route `/exports/<name>.zip` and `/exports/<name>.zip.sha256`
  requests to the gateway. Everything else can be handled normally by the CDN.
* **Cache key:** combine the path and query string only. Do **not** include the
  `X-Mobius-Key` header when constructing cache keys—this header is strictly for
  origin authentication and should never impact cache variance.
* **Encoding:** keep the `Accept-Encoding` header in both the cache key and the
  request to origin so that validators remain accurate for compressed payloads.

## Validator forwarding

The gateway produces both strong `ETag` and `Last-Modified` validators. Always
forward the following request headers to origin so that conditional requests are
honoured correctly:

* `If-None-Match`
* `If-Modified-Since`
* `Range` (for future partial content support)

Responses propagate the matching `ETag`/`Last-Modified` headers and reply with
`304 Not Modified` when appropriate.

## Response headers to preserve

Never strip or override the following headers, as they are required for correct
client behaviour and observability:

* `Content-Disposition`
* `Content-Type`
* `ETag`
* `Last-Modified`
* `Cache-Control`
* `Accept-Ranges`
* `Vary`
* `X-Mobius-Version`

## Cache-control modes

The gateway honours the `MOBIUS_CACHE_MODE` environment variable. The CDN should
respect the origin-provided `Cache-Control` directives:

* `revalidate` → `public, max-age=0, must-revalidate`
* `immutable` → `public, max-age=31536000, immutable`
* `no-store` → `no-store`

## Health checks

The `/healthz` endpoint uses `Cache-Control: no-store`. Forward the
`X-Mobius-Key` header unless the `MOBIUS_HEALTH_PUBLIC` environment variable is
set to `1`, in which case the gateway allows unauthenticated health checks.

## Smoke testing from the edge

Run the following checks against the CDN to confirm that caching and validators
behave as expected:

```bash
# First fetch (expected 200 OK)
curl -sI -H 'X-Mobius-Key: <secret>' https://cdn.example.com/exports/demo.zip

# Revalidation hit (expected 304 Not Modified)
etag=$(curl -sI -H 'X-Mobius-Key: <secret>' https://cdn.example.com/exports/demo.zip | awk -F'"' '/^ETag:/{print "\""$2"\""}')
curl -sI -H 'X-Mobius-Key: <secret>' -H "If-None-Match: $etag" https://cdn.example.com/exports/demo.zip
```

Keep an eye on the preserved headers during these calls to ensure the edge is
not modifying origin responses.
