# Readiness Delta Register

**Current Readiness Score:** 720 / 1000

This register tracks outstanding external dependencies, internal follow-ups, and evidence intake tasks required to unlock the remaining readiness points for the preview worker deployment.

## External Dependencies

| Dependency | Owning Team | Tracking Ticket | Status | Evidence Required | Notes |
| --- | --- | --- | --- | --- | --- |
| OPS1 notarized evidence swap | OPS1 Operations | CHG-48271 | ⚠️ Awaiting notarized swap execution | Notarization transcript, operator log | Withhold readiness points until notarized swap is executed and logged in ServiceNow. |
| OPS2 sanitization restoration | OPS2 Operations | CHG-48304 | ⚠️ Sanitization work pending | Sanitized fixture set, QA validation report, IAM policy update log | OPS2 must complete restoration, upload artifacts, and close the change ticket. |
| Shared token release | Security | SEC-5432 | 🔒 Blocked | Token release confirmation, rotation details, closure notice | Governance treats this as a hard dependency; both OPS runbooks are blocked until tokens are released. |

## Immediate Internal Orders

- **Distribute the docs.** Send the OPS1 playbook, OPS2 blueprint, and kickoff brief to the named external leads. Record each acknowledgement below.
  - [ ] OPS1 lead acknowledgement recorded
  - [ ] OPS2 lead acknowledgement recorded
  - [ ] Security lead acknowledgement recorded
- **Stand-up cadence.** Reserve stand-up agenda slots to poll status on CHG-48271, CHG-48304, and SEC-5432. Update the "Last Polled" field when new information is captured.
  - Last polled CHG-48271:
  - Last polled CHG-48304:
  - Last polled SEC-5432:
- **Evidence hooks ready.** Prepare repository placeholders for incoming artifacts so notarization transcripts, sanitization reports, and token release confirmations can be committed immediately upon receipt.

## Evidence Intake Checklist

Use the directories under `evidence/` to stage artifacts as soon as they arrive.

| Evidence Path | Contents to Upload |
| --- | --- |
| `evidence/OPS1/` | Notarized swap transcript, operator log, closure confirmation for CHG-48271 |
| `evidence/OPS2/` | Sanitized fixtures, QA validation results, IAM policy update notes, closure confirmation for CHG-48304 |
| `evidence/Security/` | Shared token release confirmation, rotation details, closure confirmation for SEC-5432 |

After all three confirmations have been received and recorded, update this register and the readiness score to reflect 1000 / 1000 status.
