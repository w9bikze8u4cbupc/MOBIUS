# Phase R3 Kickoff Runbook

## Session Logistics
- **Scheduled**: 2024-07-15 @ 15:00 UTC (aligns with T+5 milestone)
- **Reference Brief**: [Phase R3 Kickoff Brief](./R3_KICKOFF_BRIEF.md)
- **Bridge**: Secure Zoom bridge (OPS room 3)
- **Collaboration Surfaces**: Miro board + Confluence action log + Epic tracker spreadsheet

## Pre-Session Checklist
1. Confirm OPS1 evidence refresh and OPS2 sanitization patch drafts are in review folders.
2. Verify placeholder bundle replacement plan documented in the readiness ledger.
3. QA team finalizes npm test dry-run waiver/plan memo.
4. Distribute agenda and expectations to all attendees 24 hours prior.

## Workstream Owner Assignments
| Workstream | Scope Snapshot | Provisional Owner | Pre-Work Expectations |
|------------|----------------|-------------------|------------------------|
| WS1 | Telemetry hardening (metrics coverage, alerting thresholds) | Priya Desai | Bring updated instrumentation diff, list of infra dependencies, and effort validation.|
| WS2 | Translation fallback resiliency | Miguel Ortiz | Provide locale fallback matrix, caching strategy, and risk assessment on external translators.|
| WS3 | Evidence automation + audit tooling | Morgan Lee | Present OPS1 rerun status, checksum manifest approach, and dependency on registry access.|

## Live Epic Tracker Template
| Epic | Owner | Status (Live) | Risk Level | Next Action | Evidence Link | Audit Surface |
|------|-------|---------------|------------|-------------|---------------|---------------|
| EP-301 Telemetry Revamp | Priya Desai | Pending Kickoff | Medium | Capture final scope approval during checkpoint | `evidence://ep-301/decision-log` | Telemetry pipelines + Grafana dashboards |
| EP-302 Translation Fallback | Miguel Ortiz | Pending Kickoff | Medium | Document fallback acceptance criteria | `evidence://ep-302/brief` | Localization service configs |
| EP-303 Audit Automation | Morgan Lee | Pending Kickoff | High | Attach OPS1 rerun artifacts post-meeting | `evidence://ep-303/ops1` | Evidence store + readiness ledger |

> **Facilitator Note**: Update the Status/Risk/Next Action columns in real time. Record evidence links immediately after decisions to maintain audit continuity.

## During the Session
1. **Kickoff** (5 min): facilitator reiterates objectives, confirms quorum, and highlights remediation targets.
2. **Decision Checkpoints** (Telemetry, Translation): capture decisions directly in the epic tracker and flag follow-up tasks in the action log.
3. **Workstream Deep Dive**: each owner validates effort estimates, dependencies, and mitigation plans; record any blockers.
4. **Action Assignment**: align owners to evidence packaging tasks (sanitizer manifest, readiness recalibration, npm test dry run).
5. **Closing Summary**: confirm next milestones (T+2, T+4, T+5, T+7) and restate readiness score target (≥820/1000).

## Post-Session Actions
- Publish sanitized meeting notes with checksum and link them to the readiness ledger.
- Trigger npm test dry run or log waiver (if not executable) within 24 hours.
- Queue ledger recalibration review once OPS1/OPS2 artifacts are validated.
- Ensure placeholders (e.g., `phase_r2_docs_stub.zip`) are replaced and documented before T+7 governance check.
