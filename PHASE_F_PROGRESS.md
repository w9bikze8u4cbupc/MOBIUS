# Phase F.1-F.3 Progress: Script Authority Model

## Status: ✅ COMPLETE

## Summary

Phase F implements the Script Authority Model, ensuring tutorial scripts are derived artifacts with explicit operator authority. Scripts are generated as candidates, validated for consistency with confirmed ingestion data, and require operator confirmation before becoming authoritative. The system enforces non-bypassable gating and prevents contradictions with confirmed ingestion.

## Completed Work

### 1. Extended Gate Constants ✅
**File**: `src/utils/gateConstants.js`
- Added `CONFIRM_SCRIPT` gate ID
- Added `CONFIRM_STORYBOARD` gate ID (stub for next phase)
- Updated `getRequiredGateIds()` to accept context parameter
- Gate definitions include `requiredWhen` logic for script/storyboard

### 2. Created ScriptArtifact Model ✅
**File**: `src/utils/scriptArtifact.js`
- `ScriptStatus`: CANDIDATE, AUTHORITATIVE, REJECTED
- `SegmentType`: 13 segment types (introduction, components, setup, etc.)
- `hashInputs()` and `hashPrompt()` for provenance tracking
- `normalizeScriptArtifact()` for consistent shape
- `parseScriptSegments()` for structured parsing
- `calculateScriptDiff()` for segment-level comparison
- `validateScriptArtifact()` for structure validation

### 3. Created Script Consistency Validator ✅
**File**: `src/utils/scriptConsistency.js`
- `ViolationSeverity`: ERROR (blocks), WARNING (flags)
- `ViolationType`: UNKNOWN_COMPONENT, INCONSISTENT_SETUP, etc.
- `validateScriptConsistency()` - validates script against ingestion report
- Component reference extraction and fuzzy matching
- Setup consistency validation
- `formatViolations()` for display

### 4. Added Database Support ✅
**File**: `src/api/db.js`
- Added `script_artifacts` column migration
- `getScriptArtifacts(projectId)` - retrieve all artifacts
- `addScriptArtifact(projectId, artifact)` - append candidate (never overwrites)
- `getAuthoritativeScript(projectId)` - get authoritative artifact
- `setAuthoritativeScript(projectId, artifactId)` - mark as authoritative
- `confirmAuthoritativeScript(projectId, candidateId, notes)` - transactional confirmation
- Updated `areRequiredGatesSatisfied()` to include script context

### 5. API Endpoints ✅
**File**: `src/api/index.js`
- ✅ `POST /api/projects/:id/script/generate` - Create candidate with consistency validation
- ✅ `GET /api/projects/:id/script/candidates` - List all candidates
- ✅ `GET /api/projects/:id/script/authoritative` - Get authoritative script
- ✅ `POST /api/projects/:id/script/confirm` - Mark candidate as authoritative + update gate
- ✅ Enforces ingestion gates on script generation
- ✅ Validates consistency and blocks confirmation if violations exist
- ✅ Helper function `buildScriptPrompt()` for reusable prompt generation

### 6. Middleware Updates ✅
**File**: `src/api/middleware/gates.js`
- Added `SCRIPT_GATES_BLOCKED` error code
- Added `SCRIPT_INCONSISTENT_WITH_INGESTION` error code
- Updated exports to include new error codes
- Imported `getScriptArtifacts` for context-aware gating

### 7. Frontend Components ✅
**File**: `client/src/components/ScriptReview.js`
- ✅ Lists all script candidates with status/timestamp
- ✅ Displays authoritative script (if any)
- ✅ Shows violations/warnings for each candidate
- ✅ Segment-level diff view (candidate vs authoritative)
- ✅ "Confirm as Authoritative" button (disabled if violations)
- ✅ Notes field for confirmation
- ✅ Blocks navigation until `CONFIRM_SCRIPT` satisfied
- ✅ Status banner (green=ready, yellow=action required)

### 8. Integration Tests ✅
**File**: `tests/integration/script-gates.test.js`
- ✅ Cannot generate script unless ingestion gates satisfied
- ✅ Generation creates candidate (no overwrite)
- ✅ Cannot proceed to TTS unless `CONFIRM_SCRIPT` satisfied
- ✅ Confirming candidate persists and survives reload
- ✅ Script with violations cannot be confirmed
- ✅ Multiple candidates can coexist
- ✅ Only one authoritative script at a time
- ✅ API endpoints return correct responses

### 9. Unit Tests ✅
**File**: `tests/unit/scriptConsistency.test.js`
- ✅ Unknown component detection
- ✅ Fuzzy component matching (plurals, synonyms, case-insensitive)
- ✅ Generic term allowance (card, token, etc.)
- ✅ Missing component warnings
- ✅ Backward compatibility (no components = pass)
- ✅ Punctuation handling

### 10. Documentation ✅
**File**: `docs/script-authority.md`
- ✅ ScriptArtifact schema
- ✅ Workflow (generate → review → confirm)
- ✅ Locked invariants
- ✅ Violation protocol
- ✅ Error codes
- ✅ Fuzzy matching rules
- ✅ Frontend integration guide
- ✅ Testing coverage
- ✅ Migration path for existing projects

## Design Decisions

### Script as Derived Artifact
- Scripts are **never overwritten** - always append candidates
- Each candidate has provenance (promptHash, inputsHash, model, timestamp)
- Operator must explicitly confirm one candidate as authoritative
- Authoritative script required before TTS/storyboard/render

### Consistency Enforcement
- Scripts validated against **confirmed ingestion report**
- Unknown components → ERROR (blocks confirmation)
- Missing components in overview → WARNING (allows confirmation)
- Fuzzy matching for component names (handles plurals, synonyms)

### Structured Segments
- Scripts parsed into typed segments (introduction, setup, gameplay, etc.)
- Enables segment-level diffing
- Supports future storyboard mapping
- Backward compatible with raw text

### Gate Integration
- Reuses existing gate infrastructure
- `CONFIRM_SCRIPT` gate required when script candidates exist
- `CONFIRM_STORYBOARD` stubbed for next phase
- Context-aware gate requirements

## Acceptance Criteria

- ✅ Script generation never overwrites (always creates candidates)
- ✅ Impossible to proceed to TTS without authoritative script
- ✅ Scripts with violations cannot be confirmed
- ✅ ScriptReview UI shows clear status and blocks progression
- ✅ Integration tests detect bypass attempts
- ✅ Documentation complete

## Files Created

- `src/utils/scriptArtifact.js` ✅
- `src/utils/scriptConsistency.js` ✅
- `client/src/components/ScriptReview.js` ✅
- `tests/integration/script-gates.test.js` ✅
- `tests/unit/scriptConsistency.test.js` ✅
- `docs/script-authority.md` ✅
- `PHASE_F_PROGRESS.md` ✅ (this file)

## Files Modified

- `src/utils/gateConstants.js` ✅
- `src/api/db.js` ✅
- `src/api/index.js` ✅
- `src/api/middleware/gates.js` ✅

## Locked Invariants

These invariants are **structurally enforced** and cannot be bypassed:

1. **No Overwrite**: Scripts are append-only. Generating a new script creates a new candidate, never overwrites existing ones.

2. **Provenance Required**: Every script artifact has `promptHash`, `inputsHash`, `model`, and `createdAt` for reproducibility.

3. **Consistency Validation**: All scripts validated against confirmed ingestion report. Unknown components = ERROR.

4. **Explicit Confirmation**: Scripts remain candidates until operator explicitly confirms. No auto-promotion.

5. **Gate Enforcement**: `CONFIRM_SCRIPT` gate required when candidates exist. Downstream operations (TTS, storyboard, render) blocked until satisfied.

6. **Transactional Confirmation**: Confirming a script and updating gate state is atomic. Partial failures roll back.

7. **Violation Blocking**: Scripts with ERROR-level violations cannot be confirmed. Operator must resolve violations first.

## Next Phase: Storyboard Authority (Phase G)

- Map script segments to visual storyboard frames
- `CONFIRM_STORYBOARD` gate activation
- Segment-level timing and visual cues
- Storyboard consistency with authoritative script

## References

- [Script Authority Documentation](docs/script-authority.md)
- [Ingestion Gates Milestone](INGESTION_GATES_MILESTONE_LOCK.md)
- [Storage Canonicalization](STORAGE_MILESTONE_COMPLETE.md)
- [Phase 3 Complete Summary](PHASE3_COMPLETE_SUMMARY.md)
