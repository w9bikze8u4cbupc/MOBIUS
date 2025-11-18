## Continuous Integration

- [CI Audio Metrics Pipeline Summary](CI_AUDIO_METRICS_PIPELINE_SUMMARY.md)

## Phase E Hardening

Phase E stabilizes ingestion, storyboard generation, and determinism ahead of rendering:

- Governance docs live in `docs/governance/` with machine-readable contracts in `docs/spec/`.
- Validators (`scripts/check_ingestion.cjs`, `scripts/check_storyboard.cjs`) expose CI-ready JUnit artifacts and power the new npm scripts `ingestion:validate` and `storyboard:check`.
- Deterministic ingestion + storyboard implementations are covered by Jest tests under `tests/ingestion/`.
