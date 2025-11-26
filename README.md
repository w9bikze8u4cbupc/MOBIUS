## Continuous Integration

- [CI Audio Metrics Pipeline Summary](CI_AUDIO_METRICS_PIPELINE_SUMMARY.md)

## Phase E Hardening

Phase E stabilizes ingestion, storyboard generation, and determinism ahead of rendering:

- Governance docs live in `docs/governance/` with machine-readable contracts in `docs/spec/`.
- Validators (`scripts/check_ingestion.cjs`, `scripts/check_storyboard.cjs`) expose CI-ready JUnit artifacts and power the new npm scripts `ingestion:validate` and `storyboard:check`.
- Deterministic ingestion + storyboard implementations are covered by Jest tests under `tests/ingestion/`.

## GENESIS rollout configuration

Use environment variables to control GENESIS integration modes during deployment:

```
MOBIUS_GENESIS_MODE=OFF        # OFF | SHADOW | ADVISORY | ACTIVE
MOBIUS_GENESIS_ENABLED=true    # global kill switch
```

`OFF` is the safe default and disables GENESIS end-to-end. `SHADOW` and `ADVISORY` allow operators to observe feedback without mutating render configs, and `ACTIVE` applies compatible hints automatically.

## Gateway authentication and CORS

The Express gateway supports lightweight, environment-driven hardening for single-user production deployments:

```
MOBIUS_CORS_ORIGINS=http://localhost:3000            # Comma-separated origins; use '*' for dev wildcards
MOBIUS_API_KEYS=secret1,secret2                      # Comma-separated API keys required in production
NODE_ENV=development                                 # Production requires MOBIUS_API_KEYS to be set
```

- In development, requests are allowed without keys unless `MOBIUS_API_KEYS` is provided.
- In production, the server exits at startup if `MOBIUS_API_KEYS` is missing, and all requests (except `/health`) must present a valid `x-mobius-api-key` header or `Authorization: Bearer <key>` token.
