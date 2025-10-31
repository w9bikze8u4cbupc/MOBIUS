# CDN Configuration Runbook

This service powers authenticated exports behind a CDN. Apply the following
rules to keep validator-driven caching intact while avoiding credential leaks.

## Cache key rules

* Use the full request path (and query string if present) for the cache key.
* **Exclude the `X-Mobius-Key` request header** from the cache key and from any
  header list that triggers cache fragmentation.
* Preserve the `Accept-Encoding` signal so gzip/brotli variants remain distinct.

## Request forwarding

* Always forward conditional headers: `If-None-Match` and `If-Modified-Since`.
  They allow the origin to emit `304 Not Modified` responses.
* Propagate `Range` headers unchanged (even though the origin does not yet
  serve partial content) so future range support will work without changes.
* Strip credentials from logs and analytics sinks.

## Response handling

* Cache responses from `/exports/*.zip` and `/exports/*.zip.sha256` according to
  the origin `Cache-Control` policy:
  * `public, max-age=0, must-revalidate` – allow caching but revalidate on every
    request.
  * `public, max-age=31536000, immutable` – serve from cache until purged.
  * `no-store` – do not cache.
* Preserve these headers verbatim: `Content-Disposition`, `Content-Type`,
  `ETag`, `Last-Modified`, `Cache-Control`, `Accept-Ranges`, `Vary`, and
  `X-Mobius-Version`.
* Do not inject or modify response bodies; the WSGI app streams large files.

## Health checks

* `/healthz` responses are `no-store` and require an API key unless
  `MOBIUS_HEALTH_PUBLIC=1`. When probing from the CDN, include the key header
  or enable the public flag for read-only environments.

## Edge verification

* Add smoke tests that fetch an export twice: first for a cache miss, then with
  `If-None-Match` to confirm a cached 304. Log the CDN cache status headers to
  verify behaviour.
* Maintain a small canary that asserts the cache key ignores `X-Mobius-Key` by
  requesting the same asset with two different keys.
