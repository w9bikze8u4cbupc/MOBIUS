# MOBIUS Gateway Edge Caching

This document captures the deployment guidance for Cloudflare and CloudFront when running the
MOBIUS gateway endpoints introduced in this milestone.

## Origin Behaviour

* **Exports** – `GET /exports/{file}.zip`
* **Signatures** – `GET /exports/{file}.zip.sha256`
* **Health** – `GET /healthz`

All responses use strong validators (`ETag` + `Last-Modified`) with
`Cache-Control: public, max-age=0, must-revalidate`. The origin issues `304` responses when the
conditional headers match and exposes `Accept-Ranges: bytes` to stay CDN-friendly.

API access is gated with `X-Mobius-Key`; the header must **never** participate in cache keys.

## Cloudflare

1. Create a **Cache Rule** that matches `/exports/*` and `/exports/*.sha256`.
2. Configure the rule to **respect origin cache-control** headers, forward `If-None-Match` and
   `If-Modified-Since`, and bypass cache-key inclusion for `X-Mobius-Key`.
3. Add a small Transform Rule if required to ensure `X-Mobius-Key` is only forwarded to the origin
   (not cached at the edge).
4. Allow pass-through of origin `304` responses.

## Amazon CloudFront

1. Create an **Origin Request Policy** forwarding `If-None-Match`, `If-Modified-Since`, and
   `If-Match` headers.
2. Create a **Cache Policy** that respects origin cache-control and excludes `X-Mobius-Key` from the
   cache key (add only `Accept-Encoding`).
3. Attach both policies to a behaviour that routes `/exports/*` requests to the MOBIUS gateway
   origin.
4. Enable compression and allow `304` responses to flow back to clients unchanged.

## Regression Tests

Run the offline regression suite with:

```bash
pytest tests/test_gateway.py
```

The suite verifies:

* Validator revalidation (`ETag` + `If-Modified-Since`).
* Signature retrieval matches `sha256sum`.
* API key enforcement.
* Health endpoint gating based on `MOBIUS_HEALTH_PUBLIC`.
