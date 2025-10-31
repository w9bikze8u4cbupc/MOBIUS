# MOBIUS Gateway CDN & Edge Configuration

## CDN & Edge Configuration

### Cloudflare
- **Cache key**: exclude the `X-Mobius-Key` header so cached assets are shared.
- **Revalidation**: enable Origin Cache Control to respect `Cache-Control`, `ETag`, and `Last-Modified` headers from the gateway.
- **Conditional requests**: ensure `If-None-Match` and `If-Modified-Since` headers are forwarded to the origin.
- **Origin responses**: allow `304 Not Modified` responses to flow back to clients.

### CloudFront
- **Cache policy**: start from *Managed-CachingDisabled* or create a custom policy that excludes headers (especially `X-Mobius-Key`), omits cookies, and forwards only required query parameters.
- **Compression**: enable compression support and honor origin-provided caching headers.
- **Origin request policy**: include `If-None-Match` and `If-Modified-Since` when forwarding requests to the origin.

### Client usage
```bash
# Initial fetch (expected cache miss)
curl -H "X-Mobius-Key: $MOBIUS_API_KEY" -I https://cdn.example.com/exports/alpha.zip

# Conditional fetch using ETag
curl -H "X-Mobius-Key: $MOBIUS_API_KEY" -H 'If-None-Match: "abc123"' -I https://cdn.example.com/exports/alpha.zip
```

### Integrity verification
```bash
curl -sH "X-Mobius-Key: $MOBIUS_API_KEY" https://origin.example.com/exports/alpha.zip.sha256 > alpha.zip.sha256
sha256sum -c <<<"$(cat alpha.zip.sha256)  alpha.zip"
```

### Health checks
- `/healthz` returns `status`, `version`, `cache_mode`, and `time`.
- Protect the endpoint by default; set `MOBIUS_HEALTH_PUBLIC=1` only when anonymous access is required.
