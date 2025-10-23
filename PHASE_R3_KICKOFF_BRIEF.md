# Phase R3 Kickoff Brief

The Phase R3 readiness checkpoint ensures all external dependencies are scheduled before preview worker activation. Use this brief when aligning with partner teams.

## Checkpoint Dependencies
- **OPS1 Evidence Replacement** – Blocked until OPS1 completes the runbook in `docs/ops1_evidence_replacement_playbook.md`.
- **OPS2 Sanitization Restoration** – Dependent on OPS2 completing the blueprint in `OPS2_SANITIZATION_RESTORATION_BLUEPRINT.md`.
- **Security Token Issuance** – External Security team to release shared credentials before OPS1/OPS2 execution windows.

## Runbook Alignment
- Readiness delta register (see `PREVIEW_WORKER_DEPLOYMENT_READINESS_SUMMARY.md`) is the single source of truth for outstanding actions.
- Phase F deployment record references both OPS runbooks; updates must stay in sync across documents.
- Any change in sequencing requires program manager approval and updated entries in the readiness tracker.

## Required Artifacts for External Partners
- OPS1 evidence replacement operator log (post-execution).
- OPS2 sanitization validation report with checksum results.
- Security confirmation email or ticket ID authorizing access use.

Document decisions and timestamps in the readiness delta register immediately after each stand-up.
