# Phase E — Storyboard Governance

Phase E upgrades the storyboard generator from heuristics to a contract-driven system similar to ARC.  Every scene, motion, overlay, and timing is explicitly declared in `docs/spec/storyboard_contract.json`, validated by `scripts/check_storyboard.cjs`, and surfaced as JUnit XML inside CI.

## Contract Highlights
- **Scene Schema** – Scenes must contain deterministic IDs, duration rounded to the governed increment, a `motion` block that references an allowed primitive, and hashes for every referenced asset.
- **Cross-Step Determinism** – Scenes link back to ingestion outline entries via `sourceId`.  No scene can reference an unknown outline or asset.
- **Timing Discipline** – Durations round to the increment defined in the contract (`timing.frameQuantumMs`).  Motions share the same rule.
- **Overlay Limits** – All overlays are declared with bounding boxes, z-order, and deterministic text hashes.  Randomization is forbidden without an explicit seed in the manifest.

## Validators
- `src/validators/storyboardValidator.js` centralizes schema checks.
- `scripts/check_storyboard.cjs` emits CI-friendly output and optional JUnit.

## Pipeline Integration
`src/storyboard/generator.js` consumes the Phase E1 ingestion payload (see `docs/governance/INGESTION_GOVERNANCE.md` and `docs/spec/ingestion_contract.json`) alongside the storyboard contract to produce `storyboard_manifest.json`.  The generator:
1. Hydrates motion primitives defined in the contract.
2. Aligns each scene to a canonical ingestion outline entry.
3. Produces a storyboard hash manifest so downstream rendering can assert determinism before Phase F begins.

The governance files double as a rollout pack for Phase E reviewers.  They describe how to add new primitives (contract change + tests) without regressing determinism.
