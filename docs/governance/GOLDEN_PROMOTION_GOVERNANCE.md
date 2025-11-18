# MOBIUS Golden Promotion Governance

## Purpose

This document defines the **governed process for promoting a candidate golden snapshot** (Phase F6) into canonical golden baselines under `tests/golden/`.

Promotion is **not** an ad-hoc file copy; it is a gated operation that:

- Starts from a validated golden snapshot directory,
- Performs integrity checks,
- Updates canonical golden files in `tests/golden/…`,
- Records promotion metadata (who/when/why).

## Preconditions for promotion

A snapshot is eligible for promotion only if:

1. **Governance checks passed** for the originating run:
   - ARC / rendering consistency (F2),
   - Audio governance (F3),
   - Packaging validation (F4),
   - Orchestration consistency (F5, if applicable),
   - Golden snapshot integrity (F6).

2. A **snapshot directory** exists, e.g.:

   ```text
   out/golden/<game>/<os>/<mode>-snapshot/
     arc.json
     container.json
     frames/
     junit/
     logs/
     snapshot_manifest.json
   ```

   The snapshot’s `snapshot_manifest.json` matches the expected `(game, os, mode)`.

## Canonical golden layout

Canonical golden baselines live under:

```
tests/golden/<game>/<os>/
  frames/
  container.json
  arc.json
  logs/     # optional, if needed for triage
```

Promotion must:

- Overwrite `frames/` within this directory,
- Overwrite `container.json` and `arc.json`,
- Leave unrelated games/OS baselines untouched.

## Promotion workflow (local)

1. Ensure the snapshot has passed integrity checks:

   ```bash
   npm run golden:snapshot:check -- --dir out/golden/sushi-go/windows/full-snapshot
   ```

2. Promote:

   ```bash
   npm run golden:snapshot:promote -- --game sushi-go --os windows --mode full
   ```

3. Inspect:

   - `tests/golden/sushi-go/windows/frames/` contents,
   - `tests/golden/sushi-go/windows/container.json`,
   - `tests/golden/sushi-go/windows/arc.json`,
   - `out/golden/promotions.log` (append-only log).

4. Commit golden changes with a clear message and a PR label like `golden-update`.

## CI expectations

CI should:

- Re-run golden checks against the promoted frames,
- Surface `golden-snapshot-contract[…]` and related contracts as JUnit cases,
- Ensure that promotion reduced the diff to expected behavior (e.g., no SSIM regressions beyond thresholds).

## Audit trail

Promotion must leave an append-only entry in `out/golden/promotions.log`:

- Timestamp,
- Game / OS / mode,
- Snapshot path,
- Target path,
- Git commit hash (if available).

This allows future audits of when and why baselines changed.

## Changes and versioning

Any change to:

- Canonical golden layout,
- Promotion rules or invariants,
- Promotion tooling,

must:

- Update this document,
- Update `scripts/promote_golden_snapshot.cjs`,
- Add or update tests,
- Use PR label: `governance:golden-promotion`.
