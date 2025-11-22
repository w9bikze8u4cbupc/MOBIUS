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
