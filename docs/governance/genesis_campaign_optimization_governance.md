# GENESIS Campaign Optimization Governance

## Purpose

Rank and manage a *set* of tutorials (projects) as a campaign, based on:

- GENESIS quality evaluations (G6)
- Project-specific quality goals
- Compliance status and severity of gaps

and optionally trigger auto-optimization for selected projects.

## Inputs

- `logs/genesis_evaluations.jsonl` (per-tutorial evaluation history)
- `output/<projectId>/quality_goals.json`
- Project identifiers (implicitly from logs)

## Outputs

- A campaign plan: list of projects with:
  - latest grade / clarity / distance
  - goals (if any)
  - compliance flag
  - priority score

## Determinism

- Priority calculation must be deterministic:
  - No randomness
  - Sorting by (priorityScore desc, projectId asc)

## Safety

- Campaign optimizer never modifies tutorial content directly.
- It only:
  - Reads logs/goals
  - Computes a ranked plan
  - (Optionally) invokes the per-project auto-optimizer, which is separately governed.

## Observability

- Campaign plan is exposed via API and may be shown in the UI.
- Any automated batch optimization must be logged.

## Ownership

- GENESIS ↔ MOBIUS integration maintainers.
