# CDN Runbook (Phase G2 Seed)

## Objective

Prepare the MOBIUS Gateway for CDN and edge deployment, ensuring cache correctness, authentication integrity, and observability.

## Prerequisites

- MOBIUS Gateway deployed with Phase G1 features (`ETag`, `Last-Modified`, rate limiting, JSONL audits, Prometheus metrics).
- CDN capable of respecting origin cache headers and excluding request headers from cache keys.
- Access to environment variables: `MOBIUS_API_KEY`, `EXPORTS_DIR`, `LOG_DIR`, `MOBIUS_METRICS_PUBLIC`, `RL_ENABLE`, `RL_BURST`, `RL_RATE_PER_SEC`.

## Checklist

1. **Header Propagation**
   - Pass `ETag`, `Last-Modified`, and `Accept-Ranges` from origin to edge.
   - Ensure CDN honors 304 responses without stripping caching headers.

2. **Cache Key Policy**
   - Include path and method.
   - Exclude `X-Mobius-Key`; rely on CDN auth plugin or origin verification.
   - Normalize query parameters to avoid cache-busting (strip tracking params, sort remainder).

3. **Authentication**
   - Validate API key at the edge when possible; otherwise forward to origin using TLS mutual auth or header allowlist.
   - Protect `X-Mobius-Key` from logs and analytics pipelines.

4. **Rate Limiting**
   - Edge layer: optional soft throttle to absorb bursts.
   - Origin: retain token-bucket limits keyed by validated API key or client IP.

5. **Observability**
   - Configure CDN logs to include cache status (`HIT`, `MISS`, `BYPASS`) and response codes.
   - Scrape origin Prometheus endpoint; add CDN-side metrics for edge latency and error rate.

6. **Testing & Validation**
   - Smoke test downloads for Unicode filenames and ZIP allowlist enforcement.
   - Verify conditional requests: initial download returns `200`, subsequent `If-None-Match` yields `304`.
   - Confirm rate limiting behavior for burst and sustained traffic.

7. **Incident Response**
   - Document rollback procedure to bypass CDN (direct origin access) if needed.
   - Maintain contact list for CDN operator, origin SRE, and security.

## Follow-up Enhancements

- `/healthz` dashboard exposing build info, counters, and rotating summaries.
- Artifact signing with `.sig` (SHA-256 + ed25519) and edge verification.
- Automated soak tests for large ZIP delivery under CDN caching.

