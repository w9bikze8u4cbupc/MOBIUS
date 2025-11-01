# CDN Runbook – Mobius Export Gateway

This runbook explains how to front the export gateway WSGI service with a CDN
while preserving cache correctness, validator semantics, and authentication
requirements.

## Cache Key Composition

* **Keyed by path + API key.** Include the request path and the value of the
  `X-Mobius-Key` header. This prevents cross-tenant leakage when multiple keys
  are in use.
* **Ignore query strings.** Artifact URLs are immutable and do not rely on
  query parameters.
* **Normalize encoding.** Forward UTF-8 paths exactly as received. The gateway
  rejects traversal attempts and percent-decodes internally.

## Required Header Forwarding

Forward the following request headers to origin:

| Header | Purpose |
| --- | --- |
| `X-Mobius-Key` | API key challenge used for authentication. |
| `If-None-Match` | Enables strong validator revalidation for ZIP/manifest pairs. |
| `If-Modified-Since` | Fallback validator when `If-None-Match` is absent. |

Always forward the response headers below back to clients unchanged to preserve
validator semantics:

* `ETag`
* `Last-Modified`
* `Content-Disposition`
* `Cache-Control`
* `Vary`

## Cache Directives

Resource-specific directives are baked into the origin responses and should be
respected at the CDN edge:

* `*.zip` – `Cache-Control: public, max-age=31536000, immutable`
* `*.sha256` – `Cache-Control: public, max-age=0, must-revalidate`
* error responses (`401`, `404`, `5xx`) – `Cache-Control: no-store`

The gateway also emits strong validators (`ETag` derived from mtime/size and
`Last-Modified` from filesystem timestamps). Honor 304 responses; do not rewrite
or strip validator headers.

## Authentication

* Every request except `/health` must include a valid `X-Mobius-Key` header. A
  `401 Unauthorized` response contains a `WWW-Authenticate: X-Mobius-Key` hint.
* `/health` can be configured to allow anonymous probes by setting
  `MOBIUS_HEALTH_PUBLIC=true` at origin.

## Negative Caching

`401`, `404`, and `5xx` responses are explicitly marked `Cache-Control:
no-store`. Configure CDN rules to respect this directive to avoid negative
caching at the edge.

## Content-Disposition Preservation

Unicode filenames are exposed through both the classic `filename="…"` parameter
and RFC 5987 `filename*`. Do not strip or rewrite these headers to ensure
Unicode-safe downloads downstream.
