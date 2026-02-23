# Phase F Complete: Script Authority Model

**Status**: ✅ COMPLETE  
**Date**: 2026-02-02  
**Phase**: F.1-F.3

## Executive Summary

Phase F implements the Script Authority Model, ensuring tutorial scripts are derived artifacts with explicit operator authority. Scripts are generated as candidates, validated for consistency with confirmed ingestion data, and require operator confirmation before becoming authoritative. The system enforces non-bypassable gating and prevents contradictions with confirmed ingestion.

## What Was Built

### Core Infrastructure

1. **ScriptArtifact Model** (`src/utils/scriptArtifact.js`)
   - Versioned, diffable script artifacts with provenance
   - 13 structured segment types for future storyboard mapping
   - Hash-based provenance tracking (prompt + inputs)
   - Status lifecycle: CANDIDATE → AUTHORITATIVE

2. **Consistency Validator** (`src/utils/scriptConsistency.js`)
   - Validates scripts against confirmed ingestion report
   - Fuzzy component matching (plurals, synonyms, case-insensitive)
   - ERROR violations block confirmation
   - WARNING violations allow confirmation but flag issues

3. **Database Layer** (`src/api/db.js`)
   - `script_artifacts` JSON column with migration
   - Append-only candidate storage (never overwrites)
   - Transactional confirmation with gate update
   - Context-aware gate satisfaction checking

### API Endpoints

4. **Script Generation** (`POST /api/projects/:id/script/generate`)
   - Requires ingestion gates satisfied
   - Generates script using OpenAI GPT-4
   - Parses into structured segments
   - Validates consistency and returns violations
   - Saves as candidate (never overwrites)

5. **Script Listing** (`GET /api/projects/:id/script/candidates`)
   - Returns all script candidates for a project
   - Includes status, violations, warnings, metadata

6. **Authoritative Script** (`GET /api/projects/:id/script/authoritative`)
   - Returns the confirmed authoritative script
   - 404 if no authoritative script exists

7. **Script Confirmation** (`POST /api/projects/:id/script/confirm`)
   - Confirms candidate as authoritative
   - Blocks if ERROR-level violations exist
   - Updates `CONFIRM_SCRIPT` gate transactionally
   - Marks other candidates as non-authoritative

### Frontend

8. **ScriptReview Component** (`client/src/components/ScriptReview.js`)
   - Lists all candidates with status badges
   - Displays violations (red) and warnings (yellow)
   - Shows authoritative script (if exists)
   - Allows confirmation with notes
   - Blocks confirmation if violations present
   - Blocks navigation until authoritative script confirmed
   - Status banner (green=ready, yellow=action required)

### Testing

9. **Integration Tests** (`tests/integration/script-gates.test.js`)
   - 15 test cases covering:
     - Gate enforcement on generation
     - Candidate creation and persistence
     - Unknown component detection
     - Append-only behavior
     - Confirmation workflow
     - Violation blocking
     - Downstream gating (TTS blocked)
     - API endpoint responses

10. **Unit Tests** (`tests/unit/scriptConsistency.test.js`)
    - 12 test cases covering:
      - Unknown component detection
      - Fuzzy matching (plurals, synonyms, case)
      - Generic term allowance
      - Missing component warnings
      - Backward compatibility
      - Punctuation handling

### Documentation

11. **Script Authority Guide** (`docs/script-authority.md`)
    - Complete schema documentation
    - Workflow diagrams
    - Error code reference
    - Fuzzy matching rules
    - Frontend integration guide
    - Testing coverage
    - Migration path

12. **Progress Tracker** (`PHASE_F_PROGRESS.md`)
    - Detailed implementation checklist
    - Design decisions
    - Locked invariants
    - Next phase roadmap

## Locked Invariants

These invariants are **structurally enforced** and cannot be bypassed:

1. **No Overwrite**: Scripts are append-only. Generating a new script creates a new candidate, never overwrites existing ones.

2. **Provenance Required**: Every script artifact has `promptHash`, `inputsHash`, `model`, and `createdAt` for reproducibility.

3. **Consistency Validation**: All scripts validated against confirmed ingestion report. Unknown components = ERROR.

4. **Explicit Confirmation**: Scripts remain candidates until operator explicitly confirms. No auto-promotion.

5. **Gate Enforcement**: `CONFIRM_SCRIPT` gate required when candidates exist. Downstream operations (TTS, storyboard, render) blocked until satisfied.

6. **Transactional Confirmation**: Confirming a script and updating gate state is atomic. Partial failures roll back.

7. **Violation Blocking**: Scripts with ERROR-level violations cannot be confirmed. Operator must resolve violations first.

## Integration with Existing Systems

### Ingestion Gates (Phase 3)
- Reuses existing gate infrastructure
- `CONFIRM_SCRIPT` gate added to gate definitions
- Context-aware gate requirements (only required when candidates exist)
- Same error codes and enforcement patterns

### Storage Canonicalization (Phase 1)
- Scripts stored in database JSON column (not filesystem)
- Follows canonical storage patterns for any file artifacts
- Respects locked storage milestone invariants

### Middleware
- Reuses `enforceGates` middleware
- Added script-specific error codes
- No new middleware required

## Workflow Example

```
1. Operator confirms ingestion data
   ├─ CONFIRM_METADATA: ✅
   └─ CONFIRM_COMPONENTS: ✅

2. Generate script candidate
   POST /api/projects/1/script/generate
   ├─ Validates ingestion gates
   ├─ Generates script with GPT-4
   ├─ Parses into segments
   ├─ Validates consistency
   └─ Returns candidate with violations

3. Review candidate in UI
   ├─ ScriptReview component loads
   ├─ Shows violations: "Unknown component: Mystery Widget"
   └─ Confirm button disabled

4. Fix violations (regenerate or edit ingestion)
   ├─ Add "Mystery Widget" to confirmed components
   └─ Regenerate script

5. Confirm clean candidate
   POST /api/projects/1/script/confirm
   ├─ Checks for violations (none)
   ├─ Marks as authoritative
   ├─ Updates CONFIRM_SCRIPT gate
   └─ Returns success

6. Proceed to TTS
   POST /api/projects/1/tts
   ├─ enforceGates checks CONFIRM_SCRIPT
   ├─ Gate satisfied ✅
   └─ TTS generation proceeds
```

## Error Handling

### Generation Errors
- `INGESTION_GATES_BLOCKED` (409): Ingestion gates not satisfied
- `NO_INGESTION_REPORT` (400): No ingestion report found

### Confirmation Errors
- `SCRIPT_HAS_VIOLATIONS` (409): Blocking violations exist
- `CANDIDATE_NOT_FOUND` (404): Invalid candidate ID

### Downstream Errors
- `INGESTION_GATES_BLOCKED` (409): CONFIRM_SCRIPT gate not satisfied

## Testing Results

### Integration Tests
- ✅ All 15 tests passing
- ✅ Gate enforcement verified
- ✅ Persistence verified
- ✅ Violation blocking verified
- ✅ Downstream gating verified

### Unit Tests
- ✅ All 12 tests passing
- ✅ Fuzzy matching verified
- ✅ Violation detection verified
- ✅ Backward compatibility verified

## Files Created

```
src/utils/scriptArtifact.js          - Script artifact model
src/utils/scriptConsistency.js       - Consistency validator
client/src/components/ScriptReview.js - Frontend component
tests/integration/script-gates.test.js - Integration tests
tests/unit/scriptConsistency.test.js  - Unit tests
docs/script-authority.md              - Documentation
PHASE_F_PROGRESS.md                   - Progress tracker
PHASE_F_COMPLETE_SUMMARY.md           - This file
```

## Files Modified

```
src/utils/gateConstants.js           - Added CONFIRM_SCRIPT gate
src/api/db.js                        - Added script artifact helpers
src/api/index.js                     - Added script endpoints
src/api/middleware/gates.js          - Added script error codes
```

## Backward Compatibility

### Existing Projects Without Scripts
- `CONFIRM_SCRIPT` gate not required (backward compatible)
- Gate only required when script candidates exist
- No migration needed

### Existing Projects With Legacy Scripts
- Legacy scripts in `projects.script` column ignored
- Generate new candidate from legacy script
- Confirm as authoritative
- Legacy column remains for reference

## Performance Considerations

### Database
- JSON column for script artifacts (efficient for small-medium projects)
- Indexed project ID for fast lookups
- Transactional confirmation prevents race conditions

### API
- Script generation is async (OpenAI call)
- Candidate listing is fast (single DB query)
- Consistency validation is in-memory (fast)

### Frontend
- Lazy loading of full script text (details/summary)
- Candidate list pagination (future enhancement)
- Optimistic UI updates on confirmation

## Security Considerations

### Input Validation
- Project ID validated (integer, exists)
- Candidate ID validated (UUID, exists)
- Notes sanitized (max length, no HTML)

### Authorization
- Single-user assumption (no auth yet)
- Future: role-based access control

### Data Integrity
- Transactional confirmation prevents partial updates
- Provenance hashes prevent tampering
- Append-only prevents data loss

## Next Steps

### Phase G: Storyboard Authority
- Map script segments to visual storyboard frames
- `CONFIRM_STORYBOARD` gate activation
- Segment-level timing and visual cues
- Storyboard consistency with authoritative script

### Future Enhancements
- Multi-language script support
- Collaborative review workflow
- Script versioning and rollback
- Automated violation resolution suggestions

## References

- [Script Authority Documentation](docs/script-authority.md)
- [Phase F Progress Tracker](PHASE_F_PROGRESS.md)
- [Ingestion Gates Milestone](INGESTION_GATES_MILESTONE_LOCK.md)
- [Storage Canonicalization](STORAGE_MILESTONE_COMPLETE.md)
- [Phase 3 Complete Summary](PHASE3_COMPLETE_SUMMARY.md)

## Conclusion

Phase F successfully implements the Script Authority Model with:
- ✅ Non-bypassable gating
- ✅ Consistency enforcement
- ✅ Append-only candidates
- ✅ Explicit operator authority
- ✅ Comprehensive testing
- ✅ Complete documentation

The system is production-ready and locked as a milestone. All invariants are structurally enforced and cannot be bypassed. Scripts are now derived artifacts with explicit operator authority, preventing "plausible but wrong" auto-acceptance.
