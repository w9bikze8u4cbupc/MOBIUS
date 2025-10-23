# OPS1 Evidence Replacement Playbook

This playbook provides the internal guidance required to coordinate the evidence replacement with the external OPS1 execution team. Follow the steps below to make sure the artifact swap, notarization, and ledger update are executed cleanly and verified before handoff.

## Preconditions
- **Rerun bundle location**: Confirm the rerun bundle is staged at `s3://mobius-artifacts/preview-worker/rerun/<release-id>/` with read and write permissions for the OPS1 operations group.
- **Required credentials**: Ensure the external operator has active credentials for the artifact bucket, notarization tooling, and compliance ledger service (minimum scope: `artifact:write`, `notary:sign`, `ledger:update`).
- **Change control window**: Verify the change window has been approved and the risk acknowledgment is attached in the governance queue.
- **Integrity baseline**: Record the current hash of the production artifact and the rerun artifact for side-by-side comparison after replacement.

## Replacement Steps
1. **Initiate artifact swap**
   - Instruct OPS1 to replace the existing artifact in the production bucket with the rerun artifact bundle.
   - Confirm that retention locks or immutability flags are suspended for the duration of the swap and re-enabled immediately after the new bundle lands.
2. **Trigger notarization**
   - OPS1 launches the notarization workflow using the rerun bundle hash.
   - Capture notarization output (signature ID, timestamp, and verification URL).
3. **Update compliance ledger**
   - OPS1 records the notarization package and artifact hash pair in the governance ledger.
   - Cross-check that the ledger entry references the rerun release ticket and change window identifier.
4. **Notify internal owners**
   - OPS1 sends confirmation to the internal readiness lead and attaches the notarization transcript plus ledger entry.

## Post-Replacement Verification Checklist
- [ ] Production bucket now lists the rerun artifact bundle and associated metadata.
- [ ] Artifact hash matches the rerun bundle hash recorded during prechecks.
- [ ] Retention lock/immutability flag is reinstated on the bucket path.
- [ ] Notarization link is accessible and shows the rerun artifact signature.
- [ ] Ledger entry appears under the rerun release ticket with `status=accepted`.
- [ ] Internal audit log updated with the timestamp of verification.

## External Operator Completion Log
| Date | Operator | Artifact Hash | Notarization Link | Ledger Entry Reference | Notes |
| --- | --- | --- | --- | --- | --- |
|  |  |  |  |  |  |

> ⚠️ All execution steps must be performed by authorized OPS1 personnel with production credentials. Internal teams own verification and documentation only.
