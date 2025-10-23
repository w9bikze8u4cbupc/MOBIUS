# OPS1 Evidence Replacement Playbook

This runbook equips the OPS1 operations pod to replace redacted preview worker evidence once external access is restored. All steps assume coordination with the Preview Platform readiness program manager.

## Preconditions
- ✅ External archive gateway credentials for OPS1 confirmed by Security.
- ✅ Replacement artefacts validated by Preview QA and stored in the secure drop location.
- ✅ Downtime window and communication plan acknowledged by Customer Support and Trust & Safety.
- ✅ Preview Worker deployment remains in "deploy-ready" state per Phase F record.

## Execution Steps
1. Announce start of evidence replacement in the #preview-worker-ops channel with timestamp.
2. Retrieve validated artefacts from the secure drop (`s3://preview-worker/evidence/replace/`).
3. For each affected tenant:
   - Stop evidence ingestion jobs via the Preview Worker console.
   - Upload replacement artefacts to the tenant-specific bucket.
   - Restart ingestion jobs and monitor initial metrics.
4. Record completion status in the readiness delta register.
5. Notify Preview QA for spot verification.

## Verification Checklist
- [ ] Replacement artefacts checksum verified against QA manifest.
- [ ] Preview Worker ingestion latency < 5% deviation from baseline for 30 minutes post replacement.
- [ ] Customer Support runbook acknowledgement received.
- [ ] Readiness delta register updated with timestamp, operator initials, and metric impact.

## Operator Log Template
```
Date:
Operator:
Tenants touched:
Artefact source:
Checksum validation:
Issues encountered:
Next review checkpoint:
```
