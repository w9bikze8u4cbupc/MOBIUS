# OPS2 Sanitization Restoration Blueprint

The blueprint captures how the OPS2 partner will restore sanitization coverage for Preview Worker payload handling once they have system access. This document is scoped to internal readiness only; all execution steps remain with OPS2.

## Current State Summary
- DOMPurify helper hotfix remains unmerged in production due to access restrictions.
- Regression harness coverage is frozen at pre-rerun levels awaiting OPS2 sign-off.
- CI evidence bundles and notifier hooks require external regeneration before we can lift the deployment hold.

## Execution Handoff Checklist
The following activities must be executed by the external OPS2 operations team. Internal owners track status and capture evidence once OPS2 delivers artifacts.

| Work Item | Description | External Owner | Internal Follow-Up |
| --- | --- | --- | --- |
| DOMPurify helper merge | Merge the sanitized DOMPurify helper into production, verify dependency tree, and push release tag. | OPS2 application maintainer | Confirm helper version reflected in dependency manifest and capture diff. |
| Regression harness run | Execute the full regression harness against rerun payload fixtures. Capture logs and attach to the evidence bundle. | OPS2 QA lead | Review harness output and record pass/fail summary in readiness log. |
| CI evidence bundle | Regenerate CI evidence bundle with notarized artifacts after rerun ingestion. | OPS2 build engineer | Store bundle path in readiness summary and cross-link ledger entry. |
| Notifier hook | Re-enable notifier hook for sanitization drift alerts in production. | OPS2 reliability owner | Validate alert firing in staging and acknowledge receipt. |

> All operational steps above remain **pending external execution**. Do not mark tasks complete until OPS2 submits evidence through the approved channel.

## Coordination Notes
- Internal readiness lead to provide OPS2 with the rerun payload fixture manifest and DOMPurify helper diff package.
- Capture updates during the twice-weekly readiness sync and log status changes in the Readiness Delta Register.
- Escalate blockers to governance if OPS2 cannot secure change window during the current milestone.
