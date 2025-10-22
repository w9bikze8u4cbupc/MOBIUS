# Phase R3 Kickoff Brief & Runbook

## Session Logistics
- **Date/Time**: TBD (proposed: Wednesday 10:00–11:30)
- **Location**: Hybrid (Zoom + Conf Room Delta)
- **Facilitator**: Program Ops (Jordan Lee)
- **Required Attendees**: OPS1, OPS2, Engineering leads, QA, Product, Release Management
- **Pre-Reads**: Phase F deployment record, OPS2 sanitization blueprint, Preview worker readiness summary

## Decision Cadence
- Establish bi-weekly checkpoint with decision logs published within 24 hours.
- Maintain rapid escalation lane for blockers exceeding 48 hours.
- Capture all go/no-go decisions in the R3 epic tracker with owner acknowledgements.

## Workstream DRIs
| Workstream | DRI | Focus |
|------------|-----|-------|
| Deployment Hardening | OPS1 (Rivera) | Evidence continuity, notarization windows |
| Sanitization Restoration | OPS2 (Nguyen) | DOMPurify reinstatement, regression automation |
| Platform Integration | Engineering (Sato) | Rollout across preview worker and client surfaces |
| Quality Assurance | QA (Smith) | Regression harness, cross-environment validation |
| Stakeholder Comms | Product Ops (Martinez) | Release notes, customer advisories |

## Epic-Tracker Schema
- **Epic ID**: `R3-<Workstream>-<Sequence>`
- **Fields**:
  - Owner (DRI)
  - Readiness Score Reference
  - Latest Decision Log Link
  - Risk Rating (Green/Yellow/Red)
  - Evidence Package Location (immutable storage path)
  - Next Recalibration Date
- **Status Updates**: Auto-generated weekly summary plus manual updates after major checkpoints.

## Communication Plan
- Daily async updates via #phase-r3 Slack channel (by 4 PM local).
- Weekly sync (Mondays 11 AM) with rotating note-taker and published minutes.
- Incident escalation: Pager rotation -> OPS bridge -> Executive briefing (if severity ≥2).
- Artifact distribution: Confluence hub with signed PDFs, Git repo links, and recorded walkthroughs.

## Runbook Actions
1. Confirm attendee list and distribute pre-reads 24 hours in advance.
2. Set up shared decision log template and ensure access rights.
3. Align each DRI on evidence expectations and reporting cadence.
4. Schedule follow-up checkpoints and invite relevant stakeholders.
5. Track action items post-session with due dates and accountability owners.
