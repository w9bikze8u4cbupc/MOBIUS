# G7 Compatibility Governance

## Purpose

G7 introduces an explicit compatibility matrix between MOBIUS and GENESIS
contracts to prevent silent failure when versions drift.

This ensures:
- GENESIS does not emit feedback for MOBIUS versions it does not understand.
- MOBIUS does not apply GENESIS feedback whose contract versions are unknown.

## Scope

Covers the following contracts and versions:

- `MobiusExportBundle`
- G0–G6 contracts
- MOBIUS app version

## Invariants

1. **Explicit Matrix**
   - All supported combinations must be listed in `genesis_mobius_compat_matrix_v1.0.0.json`.
   - Implicit assumptions are forbidden.

2. **Semantic Versioning**
   - PATCH versions (x.y.Z) are considered binary-compatible within a minor version.
   - MINOR or MAJOR changes require explicit entries in the matrix.

3. **Fail Closed**
   - If compatibility is unknown, systems must treat it as INCOMPATIBLE by default
     (read-only display is allowed, application of hints is not).

4. **Non-breaking Display**
   - Operator-facing UI may still display feedback bundles for inspection, even if
     they are not auto-applied.

## Lifecycle

- Matrix is updated whenever any of the following change:
  - MobiusExportBundle contract major/minor version.
  - Any G0–G6 contract major/minor version.
  - MOBIUS app major/minor version.

- On changes:
  - Matrix version is bumped (e.g., 1.0.1 → 1.1.0).
  - CI verifies that all deployed combinations are covered.

## CI

- Simple structural check to ensure:
  - Matrix JSON is well-formed.
  - At least one supported row exists.

## Ownership

- Joint ownership between MOBIUS maintainers and GENESIS maintainers.
