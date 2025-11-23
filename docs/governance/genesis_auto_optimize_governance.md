# GENESIS Auto-Optimize Governance

## Purpose

Automate iterative re-runs of a tutorial until GENESIS quality goals are met,
within strict safety bounds.

## Inputs

- ProjectId
- Existing Mobius project assets
- GENESIS artifacts (G3–G6) and quality goals

## Behavior

- Iteratively:
  1. Render tutorial via MOBIUS pipeline.
  2. Run GENESIS evaluation (G2–G6).
  3. Check quality goals (grade, clarity, distance).
  4. If not satisfied, adjust config safely and retry.

- Terminates when:
  - Goals are satisfied, or
  - Max iterations reached, or
  - Any hard error occurs.

## Safety

- Max iterations: default 5.
- Max WPM adjustment per run: ±20.
- CPS/motion never exceed governed caps.
- No changes are persisted outside the project’s config scope.
- If goals remain unmet at limit, system fails closed and surfaces that fact.

## Modes

- Only runs when:
  - GENESIS mode is `ACTIVE` or `ADVISORY`.
  - Compatibility check passes (contracts aligned).

## Observability

- Each iteration logged to `logs/genesis_auto_optimize.jsonl`.
- Final status recorded (success / exhausted / error).

## Ownership

- GENESIS ↔ MOBIUS integration maintainers.
