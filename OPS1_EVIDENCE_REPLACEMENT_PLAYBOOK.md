# OPS1 Evidence Replacement Playbook

This playbook directs the OPS1 execution pod through the notarized evidence swap required for Preview Worker Phase F readiness. It eliminates ambiguity by enumerating prerequisites, the execution sequence, verification gates, and logging expectations so remote operators can complete the swap without further clarification.

## Preconditions
- **Validated replacement evidence package** uploaded to the secure transfer bucket (`evidence://preview-worker/phase-f/ops1-replacement.zip`).
- **Checksum manifest** (`SHA256SUMS.txt`) approved by Security and attached to the package metadata.
- **Access window** confirmed with Platform Operations—change ticket `CHG-48271` must be in "Implement" status.
- **Rollback bundle** (prior evidence snapshot and manifest) staged in cold storage for immediate restoration if verification fails.
- **Operator roster**: at least two OPS1 operators assigned (primary + verifier) with current access tokens.

## Execution Sequence
1. **Authenticate** to the secure evidence store using the rotating OPS1 service token and confirm MFA challenge success.
2. **Snapshot current evidence** by exporting the existing notarization bundle to the rollback bucket (`rollback://preview-worker/evidence/`), tagging it with the timestamp and operator initials.
3. **Ingest replacement package** by pulling the approved artifact and verifying the checksum manifest locally.
4. **Publish notarization** by placing the replacement package into the active evidence path and updating the manifest pointer.
5. **Signal completion** through the OPS1 Slack channel (`#ops1-field`) using the `evidence_swap_complete` template and include checksum results.
6. **File change confirmation** in ServiceNow change ticket `CHG-48271` with start/end times and attach the `evidence_swap.log` generated during execution.

## Verification Checklist
- [ ] Replacement package checksum matches approved manifest.
- [ ] Rollback snapshot validated (openable and matches manifest ID).
- [ ] Evidence path permissions remain `read-only` for non-OPS roles.
- [ ] ServiceNow change ticket updated with completion notes and log attachment.
- [ ] OPS1 Slack announcement acknowledged by Phase F coordinator.

## Operator Log Template
| Timestamp (UTC) | Operator | Action | Result | Notes |
| --- | --- | --- | --- | --- |
| 2024-__-__T__:__Z | Primary | Snapshot export | Success | `rollback://...` |
| 2024-__-__T__:__Z | Primary | Checksum verify | Success | `SHA256SUMS.txt` |
| 2024-__-__T__:__Z | Verifier | Evidence publish review | Pending | Awaiting confirmation |

Operators must fill every step in the shared `OPS1_Evidence_Replacement_Log.csv` stored alongside the evidence bundle. The Phase F coordinator will import this log into the Readiness Delta Register immediately after completion.

## Escalation Path
- **First contact**: OPS1 duty lead (`ops1-duty@company.com`)
- **Secondary**: Preview Worker Phase F coordinator (`preview-phasef@company.com`)
- **Emergency rollback**: Security on-call via PagerDuty (`SEC-PD-PreviewWorker`)
