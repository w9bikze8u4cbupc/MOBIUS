# Phase R3 Sprint 1 Backlog
**Sprint Window:** 2025-10-25 → 2025-11-07  
**Velocity Target:** 24 points  
**Prepared:** 2025-10-22T00:28:00Z

| ID   | Workstream | Story                                           | Points | Owner      | Acceptance Criteria |
|------|------------|--------------------------------------------------|:------:|------------|---------------------|
| WS1-1| Distribution| Implement automated package manifest generation | 5      | Unassigned | Manifest matches spec; checksum logged |
| WS1-2| Distribution| Upload automation to delivery endpoint          | 3      | Unassigned | Dry-run deploy succeeds; audit log created |
| WS2-1| Analytics   | Define KPI instrumentation schema               | 3      | Unassigned | Metrics documented; approved by stakeholders |
| WS2-2| Analytics   | Implement telemetry collectors in backend       | 5      | Unassigned | Events emitted with prompt-builder metadata |
| WS3-1| Multilingual| Extend prompt-builder for bilingual outputs     | 5      | Unassigned | Tests cover fallback; translations validated |
| WS3-2| Multilingual| Script regression suite for translations        | 3      | Unassigned | Regression pipeline passes; baseline recorded |

## Sprint Checklist
- OPS1 status confirmed before sprint start.
- Telemetry sanitization upgrade scheduled for WS2 or WS3 once registry access returns.
- Evidence logging process reviewed (leverage `evidence/` structure from Phase R2).
