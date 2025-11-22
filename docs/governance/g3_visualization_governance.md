# G3 Tutorial Visualization Governance

## Purpose

The G3 Tutorial Visualization layer turns Mobius tutorials into deterministic Orb overlays
so GENESIS can "see" tutorial structure, pacing, density, motion load, captions, and clarity.
This document defines invariants, lifecycle, and failure handling.

## Scope

- Inputs:
  - `MobiusExportBundle` (Phase G0)
  - `GenesisMobiusSnapshot` (Phase G1)
  - `GenesisMobiusQualitySnapshot` (Phase G2)

- Outputs:
  - `GenesisMobiusVisualizationSnapshot` (this phase)
  - Orb overlay payloads consumed by OrbCanvas and KernelState

## Invariants

1. **Determinism**
   - No randomness, timers, or environment-dependent branching.
   - Same inputs → identical visualization JSON and overlay payloads.

2. **Geometry Safety**
   - All radii ∈ [0.28, 0.92].
   - Angles ∈ [0, 2π].
   - No inverted bands (radiusOuter ≥ radiusInner).

3. **Contract Compliance**
   - Visualization JSON MUST satisfy
     `docs/spec/g3_tutorial_visualization_contract_v1.0.0.json`.
   - Any behavioral change requires:
     - Contract version bump.
     - Doc update.
     - Validator update.
     - CI job and golden update (if applicable).

4. **Lens Stability**
   - Timeline sampling fixed at 30 Hz.
   - Scene↔angle mapping stable across runs and OSes.

## Lifecycle

1. Ingestion:
   - `GenesisMobiusSnapshot` and `GenesisMobiusQualitySnapshot` constructed (G1, G2).

2. Visualization Build:
   - `build_tutorial_visualization(...)` called with snapshots.
   - Returns `GenesisMobiusVisualizationSnapshot`.

3. Validation:
   - `check_g3_visualization.py` validates:
     - Contract compliance.
     - Geometry constraints.
     - Value ranges (WPM, CPS, motionLoad, clarityScore, etc.).

4. Consumption:
   - OrbCanvas renders overlays.
   - KernelState and NarrativeSequenceState read global metrics.

## Failure Handling

- On validator failure in CI:
  - Job exits with non-zero status.
  - JUnit XML emitted with failure details.
  - Visualization artifacts saved under `artifacts/g3_visualization_debug/`.

- At runtime:
  - Visualization builder raises a structured exception.
  - GENESIS may fall back to a minimal, non-orbital representation (e.g., list-only).

## CI and Promotion

- CI job `g3-visualization-governance`:
  - Runs on Linux, macOS, Windows.
  - Executes:
    - `python scripts/check_g3_visualization.py --sample tests/fixtures/g3/*.json`
    - `pytest tests/test_g3_visualization_*.py`
  - Publishes JUnit.

- Any change to G3 behavior:
  - Requires contract version bump (e.g., 1.0.1).
  - Update this doc and validator.
  - Re-run CI and refresh any golden baselines.

## Ownership

- Primary owners: GENESIS core team (Orb, Kernel, NarrativeSequence).
- Secondary owners: MOBIUS integration maintainers (G0–G2).
