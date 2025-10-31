# CDN Edge Configuration Guidance

This gateway relies on HTTP validators (ETag, Last-Modified) and transparent conditional
requests to keep edge caches coherent. Use the checklist below when rolling the WSGI
export service out behind a CDN such as Cloudflare or CloudFront.

## Cache Key & Authentication

- Forward the `X-Mobius-Key` header to the origin but **exclude it from the cache key**.
  The gateway blocks requests without the key, so caching the header would prevent
  reuse across authenticated clients.
- Keep `Accept-Encoding` in the cache key so gzip/brotli variants remain isolated.
- Use origin shield or authenticated pull if available; the service is read-only and
  uses API keys for access control.

## Validator Passthrough

- Do **not** strip `If-None-Match`, `If-Match`, or `If-Modified-Since`; the application
  emits strong ETags and precise `Last-Modified` timestamps for edge revalidation.
- Allow `304 Not Modified` responses from origin to propagate to clients unchanged.
  They carry the same validator headers and maintain cache freshness efficiently.

## Header Preservation

- Preserve `Content-Disposition` on both ZIP and `.sha256` responses. The header uses
  RFC 5987 encoding so Unicode filenames continue to download correctly from the edge.
- Maintain `Content-Type` values verbatim. `.sha256` signatures should remain
  `text/plain; charset=utf-8` to avoid MIME sniffing.
- Expose `Accept-Ranges: bytes`, `ETag`, `Last-Modified`, and `Cache-Control` headers
  to clients; some CDN defaults hide them unless explicitly allowed.

## Cache Lifetimes

- Default deployments use `public, max-age=0, must-revalidate`. Ensure the CDN honours
  the directive and forwards conditional requests even when content is cached.
- If `MOBIUS_CACHE_MODE=immutable` is enabled, respect the long-lived immutable policy
  and avoid overriding it with shorter TTLs unless necessary for compliance.

## Additional Hardening

- Disable HTML caching on the `/healthz` endpoint; the gateway returns a short
  `no-store` response intended for liveness probes.
- If the CDN offers response header transforms, consider adding
  `X-Mobius-Version` to observability dashboards and ensure log scrubbing retains it.
- For `.sha256` bodies, a `Content-Security-Policy: sandbox` header is optional but
  can mitigate the risk of inline rendering by aggressive clients.
