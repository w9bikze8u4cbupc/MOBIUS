# OPS2 Sanitization Restoration Blueprint

This blueprint coordinates the OPS2 data hygiene squad as they reinstate sanitized preview worker fixtures. All tasks remain pending external delivery until OPS2 obtains the required access tokens.

## Execution Handoff Checklist
- 🔒 Access tokens for the sanitization pipeline requested from Security (status: pending external delivery).
- 📦 Sanitized fixture bundle `preview-worker-sanitized-fixtures.tar.gz` awaiting pickup in the secure drop.
- 🧭 Preview Worker deployment guide acknowledged by OPS2 lead.
- 📣 Communications partner briefed on expected customer impact window.

## Coordination Guardrails
- Maintain synchronous updates in #preview-worker-ops while sanitization is in-flight.
- Defer any production data manipulations until OPS1 confirms evidence replacement completion.
- Escalate anomalies exceeding baseline error rate (+2%) directly to the readiness program manager.
- Capture every checkpoint in the readiness delta register with owner, timestamp, and pending status.

## Pending Operational Tasks (External)
| Task | Owner | Dependency | Status |
| --- | --- | --- | --- |
| Restore sanitized fixtures to preview buckets | OPS2 | OPS1 completion signal | Pending external delivery |
| Validate sanitization hashes vs. QA manifest | OPS2 | Security token issuance | Pending external delivery |
| File execution evidence in audit repository | OPS2 | Fixture validation | Pending external delivery |

## Coordination Notes
OPS2 should treat this document as the authoritative runbook once access is granted. Update statuses directly in the readiness delta register to keep Phase F and Phase R3 records aligned.
