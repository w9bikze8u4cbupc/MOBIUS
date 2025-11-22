# G5 Cross-Tutorial Analytics Governance

## Purpose
G5 introduces a governed analytics layer allowing GENESIS to evaluate tutorials
relative to each other, detect trends, and recommend pipeline improvements.

## Inputs
- N ≥ 2 G4 clarity/insight bundles.
- Optional metadata (timestamps, complexity classes, versions).

## Outputs
- G5 analytics bundle following the G5 contract.
- Deterministic comparisons, clustering, drift metrics, and recommendations.

## Determinism
- No randomness; clustering uses deterministic k=3 seeded centroids (fixed initialization).
- Analytic ordering: sort tutorial IDs lexicographically before processing.
- Numeric rounding: fixed to 1e-6 precision during intermediate calculations.

## Invariants
- All values in aggregateMetrics must be ∈ [0,1].
- Z-scores capped to [-3, +3].
- Distances must be ≥ 0.
- Flags must follow canonical codes.

## Drift
Drift is computed by comparing the average of the most recent third of tutorials
vs. the first third (lex-sorted by tutorialId or timestamp).

## Clustering
- Fixed k=3 clusters.
- Initialization: first three tutorials (sorted) form initial centroids.
- Lloyd iterations: exactly 5 passes (no random seed).

## Recommendations
Severity: info | warn | error.
Codes follow pattern: CAPS_SNAKE_CASE.

## CI & Validation
Validator: scripts/check_g5_cross_tutorial_analytics.py
CI job: g5-cross-tutorial-analytics-governance (3-OS matrix)

## Ownership
GENESIS Analytics subsystem.
