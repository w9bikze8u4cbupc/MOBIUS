# Phase E Hardening Rollout Pack

Phase F completed rendering determinism. Phase E extends that rigor to ingestion + storyboard inputs.

## Artifacts
| Area | Artifact |
| --- | --- |
| Governance | `docs/governance/INGESTION_GOVERNANCE.md`, `docs/governance/STORYBOARD_GOVERNANCE.md` |
| Contracts | `docs/spec/ingestion_contract.json`, `docs/spec/storyboard_contract.json` |
| Validators | `scripts/check_ingestion.cjs`, `scripts/check_storyboard.cjs` |
| Hash Manifests | `manifest.assets` (ingestion), `storyboard.hashManifest` |
| Tests | `tests/ingestion/pipeline.test.js` |

## CI Hooks
- `npm run ingestion:validate -- --manifest <manifest> --junit tests/reports/ingestion-contract.xml`
- `npm run storyboard:check -- --storyboard <manifest> --junit tests/reports/storyboard-contract.xml`

Add these commands to the CI matrix (Phase E) so Phase F rendering jobs only start when both pass.

## Determinism Expectations
1. All rulebook headings, components, and TOC entries are contract governed.
2. OCR fallbacks are recorded and hashed.
3. Storyboard scenes align 1:1 with ingestion outline and only use approved motion primitives.

Version bump suggestion: Phase E v1.0.0 once integrated downstream.
