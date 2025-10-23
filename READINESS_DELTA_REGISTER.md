# Readiness Delta Register

This register tracks outstanding items preventing the Preview Worker deployment from reaching full readiness.

| Metric | Value |
| --- | --- |
| **Current readiness score** | **720 / 1000** |
| **Last updated** | 2025-10-23 16:32 UTC |

## Acknowledgements

| Stakeholder | Artifact | Timestamp (UTC) | Follow-up cadence | Notes |
| --- | --- | --- | --- | --- |
| OPS1 | Notarization transcript | _Pending_ | Daily check-in @ 16:00 | Awaiting external operator handoff |
| OPS2 | Rollback window confirmation | _Pending_ | Twice daily (09:00, 21:00) | Need confirmed maintenance window |
| Security | Security sign-off | _Pending_ | Daily sync @ 18:00 | Review completes after vulnerability scan |

## Comms Reminders

- Post daily summary in `#launch-ops` with any score changes or blockers.
- Tag `@preview-release` group when new evidence lands for ingestion.
- Escalate via on-call bridge if follow-up cadence is missed by more than 1 hour.
