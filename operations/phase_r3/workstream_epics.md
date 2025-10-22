# Phase R3 Workstream Epics

## WS1 — Distribution Automation
- **Epic Goal:** Deliver tutorial artifacts automatically with compliant manifests and audit-ready evidence.
- **Key Deliverables:**
  - Automated manifest generator (WS1-1).
  - Upload and verification pipeline (WS1-2).
  - Evidence bundling improvements integrated with ci:evidence rerun.

## WS2 — Analytics Telemetry
- **Epic Goal:** Provide actionable insights on tutorial engagement via robust telemetry.
- **Key Deliverables:**
  - KPI instrumentation schema (WS2-1).
  - Backend collectors + storage for events (WS2-2).
  - Dashboard requirements ready for Sprint 2.

## WS3 — Multilingual Hardening
- **Epic Goal:** Produce deterministic bilingual tutorials leveraging the new prompt-builder and translation fallbacks.
- **Key Deliverables:**
  - Prompt-builder multilingual extension (WS3-1).
  - Regression suite for translation accuracy (WS3-2).
  - Sanitization upgrade follow-up (OPS2).

## Dependency Map
- OPS1 and OPS2 dependencies tracked in readiness ledger.
- Telemetry sanitization upgrade affects WS2, coordinate with registry availability.
