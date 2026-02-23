# Ingestion Gates Milestone - LOCKED

## Status: 🔒 LOCKED - Phase 3 Complete

## Overview

Ingestion truth gates are now **structurally unavoidable** in both backend and frontend. This milestone is LOCKED and any deviation is considered a regression requiring explicit proposal and rollback plan.

## Locked Invariants

### 1. No Downstream Work Without Confirmed Gates ✅

**Invariant**: All downstream operations (script generation, voice/TTS, storyboard, render, export) MUST enforce ingestion gates.

**Implementation**:
- `enforceGates` middleware applied to `/summarize` and `/tts` endpoints
- Future downstream endpoints MUST use `enforceGates` middleware
- Centralized gate check via `areRequiredGatesSatisfied(projectId)` in `db.js`

**Enforcement**:
- Server returns 409 Conflict with `INGESTION_GATES_BLOCKED` error code
- Integration tests fail if gates are bypassed
- Regression tests detect partial confirmations

**Forbidden**:
- ❌ Adding downstream endpoints without `enforceGates`
- ❌ Bypassing gate checks in route handlers
- ❌ Silent auto-confirmation of gates
- ❌ Client-side-only gate checks (server is authoritative)

### 2. Standardized Error Code and Payload ✅

**Invariant**: All gate-blocked responses use the same error code and structured payload.

**Implementation**:
- Error code: `INGESTION_GATES_BLOCKED` (standardized)
- Payload shape:
  ```json
  {
    "error": "Operation blocked by ingestion truth gates",
    "code": "INGESTION_GATES_BLOCKED",
    "blockedReasons": [
      {
        "gateId": "confirm_metadata",
        "title": "Confirm Game Metadata",
        "reason": "Awaiting operator confirmation"
      }
    ],
    "requiredGateIds": ["confirm_metadata", "confirm_components"],
    "actionRequired": "Complete ingestion review and confirm all required gates",
    "reviewUrl": "/ingestion-review"
  }
  ```

**Enforcement**:
- `GateBlockedError` class in `middleware/gates.js`
- All blocked responses use `.toJSON()` method
- Frontend renders payload verbatim

**Forbidden**:
- ❌ Custom error codes for gate blocking
- ❌ Inconsistent payload shapes
- ❌ Missing `blockedReasons` or `requiredGateIds`

### 3. Centralized Gate Check ✅

**Invariant**: All gate satisfaction checks use the centralized helper `areRequiredGatesSatisfied(projectId)`.

**Implementation**:
- Single source of truth in `src/api/db.js`
- Used by middleware, route handlers, and tests
- Consistent logic across all code paths

**Enforcement**:
- Integration tests verify consistency
- No duplicate gate check logic allowed

**Forbidden**:
- ❌ Inline gate checks in route handlers
- ❌ Duplicate gate satisfaction logic
- ❌ Client-side gate checks as authoritative

### 4. Frontend Hard Lock ✅

**Invariant**: Frontend displays clear BLOCKING vs READY status and disables downstream actions until gates satisfied.

**Implementation**:
- Prominent status banner in `IngestionReview.js`
- "Continue" button disabled until satisfied
- Server-provided gate status is authoritative
- Clear visual distinction (red border for blocked, green for ready)

**Enforcement**:
- UI fetches gate status from server
- No client-side bypass mechanisms
- Blocked reasons displayed verbatim from server

**Forbidden**:
- ❌ Client-side gate satisfaction checks as authoritative
- ❌ Hidden or unclear gate status
- ❌ Enabled downstream actions when gates unsatisfied

### 5. No Auto-Confirmation ✅

**Invariant**: Gates MUST be explicitly confirmed by operator. No automatic confirmation based on confidence scores or any other heuristic.

**Implementation**:
- All gates start as PENDING
- Operator must click "Confirm" or "Correct" for each gate
- High confidence does not bypass confirmation

**Enforcement**:
- Gate states persist with explicit status
- No code path auto-confirms gates
- Integration tests verify manual confirmation required

**Forbidden**:
- ❌ Auto-confirming high-confidence fields
- ❌ Bulk confirmation without review
- ❌ Skipping gates based on thresholds

### 6. Backward Compatibility ✅

**Invariant**: Projects without ingestion reports are not blocked (backward compatibility).

**Implementation**:
- `checkGates()` returns `{ satisfied: true, noReport: true }` for projects without reports
- NULL `ingestion_report` column treated as "gates not applicable"
- Existing projects continue to work

**Enforcement**:
- Integration tests verify backward compatibility
- Migration strategy documented

**Forbidden**:
- ❌ Blocking old projects without reports
- ❌ Forcing report generation for existing projects
- ❌ Breaking changes to project schema

### 7. Persistence and Consistency ✅

**Invariant**: Gate states persist in database and survive server restarts.

**Implementation**:
- SQLite JSON columns for `ingestion_report` and `gate_states`
- Transactional updates via `updateGateStatesTransaction()`
- Consistent reads across all code paths

**Enforcement**:
- Integration tests verify persistence across restarts
- Database migrations are backward-compatible

**Forbidden**:
- ❌ In-memory-only gate states
- ❌ Non-transactional updates
- ❌ Inconsistent state across requests

## Downstream Endpoints (MUST Enforce Gates)

### Currently Enforced ✅
1. `/summarize` - Script generation (✅ enforceGates applied)
2. `/tts` - Voice/TTS generation (✅ enforceGates applied)

### Future Endpoints (MUST Enforce)
3. `/api/projects/:id/generate-storyboard` - Storyboard generation
4. `/api/projects/:id/render` - Render initiation
5. `/api/projects/:id/export` - Export operations

### Upstream Endpoints (NO Enforcement)
These create ingestion data and should NOT be gate-protected:
- `/api/explain-chunk`, `/save-project`, `/api/extract-components`
- `/extract-components`, `/save-matches`, `/upload-images`
- `/api/extract-bgg-html`, `/extract-images`, `/crop-component`
- `/extract-extra-images`, `/upload-pdf`, `/fetch-bgg-images`
- `/match-images`, `/convert-pdf-to-images`, `/start-extraction`

## Regression Detection

### Integration Tests
- ✅ Block when gates pending
- ✅ Unblock after confirmation
- ✅ Block with partial confirmations (regression test)
- ✅ Centralized helper consistency
- ✅ Standardized error code
- ✅ Gate state consistency across operations
- ✅ Mixed gate statuses prevent progression

### Manual Testing Checklist
1. Create project with ingestion
2. Attempt to access `/summarize` → Should return 409 with `INGESTION_GATES_BLOCKED`
3. Navigate to Ingestion Review UI
4. Verify "WORKFLOW BLOCKED" banner displays
5. Confirm all required gates
6. Verify "READY TO PROCEED" banner displays
7. Attempt to access `/summarize` → Should succeed
8. Restart server
9. Verify gates persist and remain satisfied

## DEV Mode Bypass

**REMOVED in Phase 3**: The `enforceGatesWithDevBypass` function is deprecated.

**Rationale**: Gates are now mandatory for production readiness. If bypass is needed for development, it must be explicit and logged, not hidden in middleware.

**Alternative**: Check `SKIP_GATES` environment variable explicitly in route handlers if needed for testing, but this should NEVER be used in production.

## Violation Response

If any of the locked invariants are violated:

1. **Immediate Action**: Revert the change
2. **Root Cause Analysis**: Determine why the violation occurred
3. **Test Update**: Add regression test to prevent recurrence
4. **Documentation**: Update this file with lessons learned
5. **Proposal Required**: Any intentional deviation requires:
   - Written proposal with justification
   - Rollback plan
   - Updated tests
   - Team review and approval

## Change Log

### Phase 3 (2026-02-02) - LOCKED
- ✅ Added centralized gate check helper (`areRequiredGatesSatisfied`)
- ✅ Standardized error code (`INGESTION_GATES_BLOCKED`)
- ✅ Applied `enforceGates` to `/summarize` and `/tts`
- ✅ Updated frontend with clear BLOCKING vs READY banner
- ✅ Extended integration tests with regression detection
- ✅ Removed DEV bypass from middleware
- ✅ Documented locked invariants

### Phase 2 (2026-02-02)
- ✅ Implemented persistence (SQLite JSON columns)
- ✅ Created API endpoints for gate management
- ✅ Built React UI components
- ✅ Added integration tests

### Phase 1 (2026-02-02)
- ✅ Implemented confidence scoring
- ✅ Created ingestion report structure
- ✅ Added validation utilities
- ✅ Updated BGG and PDF ingesters

## References

- [Ingestion Truth Gates Documentation](./docs/ingestion-truth-gates.md)
- [Phase 2 Complete Summary](./INGESTION_TRUTH_GATES_PHASE2_COMPLETE.md)
- [Phase 1 Summary](./INGESTION_HARDENING_SUMMARY.md)
- [Integration Tests](./tests/integration/ingestion-gates.test.js)
- [Gate Middleware](./src/api/middleware/gates.js)
- [Gate Constants](./src/utils/gateConstants.js)

## Approval

This milestone is LOCKED as of 2026-02-02.

**Approved by**: System Design  
**Status**: Production Ready  
**Next Review**: Only if regression detected or intentional deviation proposed
