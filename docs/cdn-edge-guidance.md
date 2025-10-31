# CDN Edge Rollout Guidance

This gateway is designed to sit behind a CDN such as Cloudflare or CloudFront. The
following checklist keeps conditional requests, signatures, and authentication in
sync between the edge and origin.

## Cache Behaviour

* Forward `If-None-Match`, `If-Modified-Since`, and `Range` headers so that the
  origin can respond with `304 Not Modified` when validators match.
* Include the request path and query string in the cache key, but **exclude** the
  `X-Mobius-Key` header. The API key is only used for authorisation and must not
  influence cache hits.
* Honour origin validator headers (`ETag`, `Last-Modified`) and propagate `304`
  responses without rewriting them to `200`.
* Default to `Cache-Control: public, max-age=0, must-revalidate`. If
  `MOBIUS_CACHE_MODE=immutable` is enabled, the origin will emit
  `public, max-age=31536000, immutable` – cache accordingly.

## Headers to Preserve

* `Content-Disposition` and `Content-Type` (including Unicode `filename*` values).
* `Accept-Ranges: bytes` to support partial requests.
* `X-Mobius-Version` for release identification.

## Health Checks

* `/healthz` requires the `X-Mobius-Key` header unless the environment flag
  `MOBIUS_HEALTH_PUBLIC=1` is set. Configure the CDN health checker to supply the
  header or target the public mode deployment.

## Optional Enhancements

* Add a second edge rule to publish SHA-256 responses with
  `Content-Type: text/plain; charset=utf-8` to prevent gzip transformations.
* When rate limiting is introduced, forward `X-RateLimit-*` headers transparently
  to surface throttling information to clients.
* Future signature formats (for example, `.sig` files) should mirror the
  `.sha256` caching rules and conditional request handling.
