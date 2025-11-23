# GENESIS QA Report Governance

## Purpose

Generate a deterministic, human-readable QA report for a single tutorial
(project), explaining:

- GENESIS evaluation (grade, clarity, distance)
- Goals and compliance
- Key issues and recommendations
- High-level timeline behavior (WPM, CPS, motion)
- Any auto-optimization iterations performed

Reports are meant for operators, reviewers, and external stakeholders.

## Inputs

- G4 clarity bundle
- G5 analytics bundle (optional)
- G6 feedback bundle
- Quality goals (if defined)
- Auto-optimize log entries for that project (optional)

## Outputs

- Markdown report:
  - `output/<projectId>/genesis_qa_report_v1.0.0.md`

## Invariants

1. Determinism
   - Given the same input artifacts, the same report content is produced.

2. Read-only
   - Report generation never mutates project state or contracts.

3. Stability
   - Any structural change to the report format requires:
     - Governance doc update
     - Version bump (v1.x.x → v1.y.x)
     - CI golden refresh if applicable.

## Ownership

- GENESIS ↔ MOBIUS integration.
