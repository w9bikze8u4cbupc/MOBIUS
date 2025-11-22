# G6 MOBIUS Feedback Governance

## Purpose

G6 converts GENESIS tutorial evaluations (G4, G5) into deterministic,
machine-usable feedback that MOBIUS can apply to future tutorial generations.

This is the official bridge for closed-loop optimization:
MOBIUS → GENESIS → feedback → MOBIUS.

## Inputs

- A single G4 clarity/insight bundle for a tutorial.
- A G5 analytics bundle including that tutorial’s comparison row.

## Outputs

- One G6 feedback bundle per tutorial:
  - `summary` (grade, clarity, distanceFromCentroid)
  - `recommendations` (structured issues with priority)
  - `mobiusHints` (parameter ranges and boolean toggles)

## Invariants

1. Determinism
   - Same G4 + G5 inputs → identical G6 bundle.
   - No randomness or external state.

2. Contract Compliance
   - Bundles must satisfy `g6_mobius_feedback_contract_v1.0.0.json`.
   - Any behavioral change requires:
     - Version bump.
     - Doc + validator update.
     - CI updates.

3. Non-Intrusiveness
   - G6 does not mutate MOBIUS exports.
   - It emits hints; MOBIUS applies or ignores them based on its own governance.

4. Safety Bias
   - When in doubt, feedback should bias toward safer:
     - Lower motion load.
     - Lower caption density.
     - Clearer pacing.

## Lifecycle

1. GENESIS builds:
   - G4 bundle per tutorial.
   - G5 analytics bundle for a collection.

2. G6:
   - `build_mobius_feedback_for_tutorial()` called per tutorial.
   - Produces G6 feedback bundles.

3. Validation:
   - G6 validator (future) checks bundles in CI.
   - MOBIUS-side ingestion validates contract name/version.

## Ownership

- Primary: GENESIS analytics / optimization.
- Secondary: MOBIUS pipeline maintainers (subtitle/audio/motion governance).
