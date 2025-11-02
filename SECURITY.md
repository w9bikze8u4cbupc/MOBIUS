# Security Notes

This document captures the security-facing behaviours introduced with the v0.10.0 "Ready & Observed" release train.

## API Keys

- Gateway API keys are validated using bearer tokens. When `health_public` is disabled the `/healthz` and `/readyz` endpoints require a valid gateway key.
- API keys should be rotated regularly. During rotation, configure the new value in parallel with the old one and remove the legacy key once traffic confirms the cutover.

## Preview Tokens

- Ephemeral preview tokens are issued with a configurable TTL (`PREVIEW_TOKEN_TTL_SECONDS`, default 300 seconds).
- When `REDIS_URL` is provided, issued tokens are persisted in Redis using keys prefixed with `preview:`; otherwise the application falls back to an in-memory store suited for development use.
- Static preview tokens can be supplied through the `STATIC_PREVIEW_TOKEN` environment variable for emergency access paths.

## Rate Limiting

- CDN event ingestion endpoints should be protected by upstream rate limiting (e.g. API gateway, CDN configuration). Defaults are intentionally permissive; tune to match deployment constraints.

## Headers and CORS

- `Vary: Authorization, X-Preview-Token` is attached to preview-protected responses to ensure correct caching semantics.
- CORS is currently configured for `http://localhost:3000` during development. Review before exposing the API to production workloads.

## Data Stores

- Redis credentials are sourced from the `mobius-redis` secret and injected via `REDIS_URL`. Ensure secrets are provisioned with restricted RBAC and rotated alongside application credentials.
