# OPS2 Sanitization Restoration Blueprint

This blueprint coordinates the OPS2 remediation pod as they rebuild the sanitized preview data plane ahead of Phase R3 checkpoints. It documents every external dependency, defines coordination guardrails, and enumerates the artifacts partner teams must deliver before we can certify readiness.

## Mission Objectives
- Restore the sanitized asset set for Preview Worker validation and external attestations.
- Confirm integrity controls and access boundaries match the Security-approved baseline.
- Produce auditable evidence packages consumable by the Readiness Delta Register.

## External Dependencies
| Dependency | Owner | Required Delivery | Notes |
| --- | --- | --- | --- |
| Sanitized dataset snapshot `preview-sanitized-2024-05-15.tgz` | Data Engineering | Provide via secure S3 drop with checksum manifest | Must be refreshed post-redaction cycle R3 | 
| Access control policy bundle (`iam-preview-sanitized.json`) | IAM Team | Submit signed policy export | Include change log referencing ticket IAM-2077 |
| Sanitization QA report (`QA-SAN-R3.pdf`) | Quality Engineering | Upload to compliance drive | Must include comparison against Phase F baseline |
| Token release schedule | Security | Coordinate shared secret rotation window | Blocked until Security closes `SEC-5432` |

## Coordination Guardrails
- **Change Window**: All restoration activities occur within the Phase R3 readiness window (Tue–Thu 16:00–22:00 UTC). Deviations require Phase F coordinator approval.
- **Communication Channels**: Daily readiness stand-up with OPS2, Security, and Data Engineering; async updates recorded in the Readiness Delta Register.
- **Approval Chain**: No dataset promotion without dual sign-off from OPS2 lead and Security liaison.
- **Rollback Policy**: Maintain prior sanitized dataset in cold storage for 14 days; rollback plan documented in `STRICTER_PROTECTION_ROLLBACK_PLAN.md`.
- **Audit Trail**: Every transfer and validation step must be logged in `OPS2_Sanitization_Restore_Log.csv` and cross-linked in ServiceNow ticket `CHG-48304`.

## Execution Blueprint
1. **Validate Inputs**: Confirm receipt and checksum of all external artifacts listed above. Record confirmations in the Readiness Delta Register and ServiceNow ticket.
2. **Provision Staging Environment**: Spin up isolated namespace `preview-sanitized-r3` mirroring production resource policies.
3. **Restore Dataset**: Ingest sanitized snapshot, apply IAM policy bundle, and lock down access scopes.
4. **Run Integrity Checks**: Execute the sanitization QA test suite and capture the full report output.
5. **Obtain Sign-offs**: Collect approvals from OPS2 lead and Security liaison, attach signed checklists to the ticket, and post update in `#ops2-sanitization` channel.
6. **Promote to Active Use**: Switch Preview Worker validation jobs to the refreshed sanitized dataset and monitor for anomalies for 24 hours.

## Required Artifacts Before Advancing Checkpoints
- Signed OPS2 restoration checklist with timestamps and operator initials.
- Sanitization QA report annotated with PASS/FAIL outcomes for each control.
- IAM policy diff report showing alignment with Security baseline.
- Token release confirmation note from Security referencing `SEC-5432`.
- Updated entries in the Readiness Delta Register linking to the above evidence.

## Escalation & Support
- **Primary Contact**: OPS2 restoration lead (`ops2-restoration@company.com`)
- **Security Liaison**: `security-preview@company.com`
- **Data Engineering Coordinator**: `data-eng-preview@company.com`

All deliverables must be archived under `compliance://preview-worker/phase-r3/ops2/` with metadata tags for change window, operator, and checksum.
