# Phase R3 Kickoff Brief & Runbook

This brief establishes the kickoff logistics, decision checkpoints, workstream assignments, and epic-tracker schema for Phase R3 of the Preview Worker program.

## Kickoff Logistics
- **Date & Time**: 2024-05-13 @ 16:00 UTC
- **Location**: Hybrid (Zoom bridge `ops-r3-bridge` + SF War Room 2A)
- **Facilitator**: L. Moreno (Program Lead)
- **Scribe**: D. Cho (Delivery Operations)
- **Attendance**: OPS1/OPS2 leads, Platform Engineering triad, QA automation owner, Compliance liaison

## Agenda
1. Phase R2 retrospective highlights (15 minutes)
2. OPS1 evidence continuity review (10 minutes)
3. OPS2 sanitization restoration alignment (15 minutes)
4. R3 roadmap walkthrough and milestone confirmation (20 minutes)
5. Risk register refresh & mitigation assignments (10 minutes)
6. Open floor / parking lot (10 minutes)

## Decision Checkpoints
- **Checkpoint 1 – Evidence Lock (2024-05-15)**: Verify OPS1 rerun artifacts notarized and ledger-synced.
- **Checkpoint 2 – Sanitization Retrofit (2024-05-20)**: DOMPurify helper merged with regression suite green on both platforms.
- **Checkpoint 3 – Epic Schema Freeze (2024-05-22)**: Epic-tracker schema locked with baseline burndown metrics.
- **Checkpoint 4 – Release Gate (2024-05-27)**: All R3 workstreams exit criteria satisfied; go/no-go vote recorded.

## Workstream Owners
- **Evidence Continuity**: S. Patel (OPS1) with analyst M. Alvarez
- **Sanitization Restoration**: T. Huang (OPS2) with dev pairing J. Woods
- **Automation & Tooling**: R. Singh (Platform Eng) covering regression harness upgrades
- **Compliance & Audit**: F. Ibrahim (Compliance liaison) ensuring ledger updates & retention policies
- **Program Operations**: D. Cho tracking RAID log and stakeholder comms

## Live Epic-Tracker Schema
| Field | Description | Example |
| --- | --- | --- |
| `epic_id` | Unique Phase R3 epic identifier | `R3-OPS2-RESTORE` |
| `workstream` | Associated workstream | `Sanitization Restoration` |
| `owner` | Primary DRI | `T. Huang` |
| `status` | Standardized status (`Not Started`, `In Progress`, `Blocked`, `Complete`) | `In Progress` |
| `checkpoint_alignment` | Upcoming checkpoint impacting the epic | `Checkpoint 2 – Sanitization Retrofit` |
| `evidence_bundle` | Latest evidence package reference | `ops2-sanitization/v1.0.0` |
| `next_action` | Time-bound next step with owner | `Run DOMPurify helper regression – due 2024-05-16 (J. Woods)` |
| `risks` | High-level risk summary + mitigation | `DOMPurify regression flake – rerun with seed lock` |
| `notes` | Freeform updates | `Awaiting security sign-off` |

## Runbook
1. Distribute kickoff deck and R3 backlog snapshot 24 hours prior to meeting.
2. Capture live decisions in the epic tracker using the schema above; update status immediately after each agenda item.
3. After Checkpoint 2, publish sanitization regression diffs alongside OPS2 evidence bundle metadata.
4. Submit checkpoint outcomes and risk updates to the program RAID log within 2 hours of each checkpoint meeting.
5. Trigger release gate dry run on 2024-05-25 to validate readiness inputs before Checkpoint 4.

## Communication Plan
- Daily async standups in `#preview-worker-r3` Slack channel (post by 15:00 UTC)
- Weekly stakeholder digest every Thursday with checkpoint status and burndown metrics
- Immediate escalation path via `ops-incident@mobius.io`

## Success Criteria
- All checkpoints passed on schedule with evidence bundles notarized.
- Sanitization regression suite stable (no flaky failures across 5 consecutive runs).
- Epic-tracker schema adopted by 100% of workstreams with up-to-date entries.
- Release gate approval with zero blocking risks outstanding.
