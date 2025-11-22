# G4 Clarity & Insight Governance

## Purpose

The G4 Clarity & Insight layer converts tutorial metrics and visualization
(G2 + G3) into explicit, deterministic feedback for GENESIS and the Orb UI.

It defines how we:
- Normalize clarity-related scores.
- Classify issues (pacing, captions, motion, density).
- Produce grades and human-readable summaries.

## Scope

Inputs:
- `GenesisMobiusSnapshot` (structure + scenes).
- `GenesisMobiusQualitySnapshot` (G2 metrics).
- `G3 visualization bundle` (globalMetrics/overlays).

Outputs:
- `G4 clarity/insight bundle` conforming to:
  `docs/spec/g4_clarity_insight_contract_v1.0.0.json`.

## Invariants

1. **Determinism**
   - No randomness or non-deterministic sources.
   - Same inputs → identical G4 bundle.

2. **Contract Compliance**
   - G4 bundles must satisfy the G4 contract.
   - Any behavior change requires:
     - Contract version bump.
     - Doc + validator updates.
     - CI job updates and golden refresh (if used).

3. **Monotonic Stability**
   - Small metric variations should not flip grades erratically.
   - Thresholds are coarse-grained and documented in code.

4. **Non-Destructiveness**
   - G4 does not mutate or reinterpret G2/G3 inputs.
   - It only reads and derives.

## Lifecycle

1. GENESIS constructs:
   - `GenesisMobiusSnapshot` (G1).
   - `GenesisMobiusQualitySnapshot` (G2).
   - G3 visualization bundle.

2. G4 engine:
   - `build_clarity_insight_from_g3(...)` is invoked.
   - Produces a governed G4 bundle.

3. Validation:
   - `scripts/check_g4_clarity_insight.py` validates:
     - Structural fields.
     - Value ranges (0..1).
     - Grade/issue enums.

4. Consumption:
   - Orb UI (e.g. info badges, overlays).
   - Kernel narrative/analysis modules.
   - Future cross-tutorial analytics (G5).

## Failure Handling

- CI:
  - If G4 validation fails, CI fails with JUnit output.
  - Debug bundles/fixtures stored under `artifacts/g4_clarity_insight_debug/`.

- Runtime:
  - Ingest layer may opt to defer insights if G4 building fails.
  - Prefer fail-closed: no insights rather than misleading ones.

## CI and Promotion

- CI job `g4-clarity-insight-governance`:
  - Runs on Linux/macOS/Windows.
  - Executes:
    - `python scripts/check_g4_clarity_insight.py tests/fixtures/g4/sample_g4_bundle.json --junit-out artifacts/junit/g4_clarity.xml`
    - `pytest tests/test_g4_clarity_insight_*.py`

- Changes to G4 logic:
  - Require G4 contract version bump.
  - Tests updated.
  - CI green before merge.

## Ownership

- Primary: GENESIS clarity/insight maintainers.
- Secondary: MOBIUS-GENESIS integration maintainers (G0–G3).
