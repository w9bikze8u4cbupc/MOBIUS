# CDN Staging Manifests

This directory contains vendor-specific manifests for staging environments. Each manifest normalises cache keys, configures observability headers, and documents behaviour for rotated preview tokens.

## Files

- `cloudflare.staging.json` – Deploy with [`wrangler publish`](https://developers.cloudflare.com/workers/wrangler/).
- `akamai.staging.json` – Importable via Akamai Property Manager as an advanced metadata snippet.

## Cache Key Normalisation

Both manifests strip volatile query parameters (`utm_*`, `ref`, `previewToken`) from the cache key while retaining the pathname and host. This mirrors the preview token rotation flow introduced in the web client.

## Observability Headers

Responses include the following headers so CDN hit/miss ratios can be exported through the new `/api/observability/cdn` endpoint:

- `X-Mobius-Cache-Key` – normalised cache key hash.
- `X-Mobius-Cache-Status` – vendor-specific cache result folded into `hit`, `miss`, or `bypass`.
- `X-Mobius-Edge` – the responding PoP identifier when provided by the CDN.

These headers feed the webhook payload schema expected by `recordCdnMetric` in `src/observability/cdnMetrics.js`.
