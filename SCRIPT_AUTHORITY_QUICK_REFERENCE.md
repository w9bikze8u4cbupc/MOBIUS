# Script Authority Quick Reference

**Phase F Complete** | **Status**: ✅ LOCKED MILESTONE

## TL;DR

Scripts are **derived artifacts** with **explicit operator authority**. They're generated as candidates, validated for consistency, and require confirmation before becoming authoritative. No auto-acceptance, no overwrites, no bypasses.

## API Endpoints

```bash
# Generate script candidate (requires ingestion gates)
POST /api/projects/:id/script/generate
Body: { rulebookText, gameName, metadata, components, language }
Returns: { artifact, canConfirm, violations, warnings }

# List all candidates
GET /api/projects/:id/script/candidates
Returns: { candidates: [...], count }

# Get authoritative script
GET /api/projects/:id/script/authoritative
Returns: { script } or 404

# Confirm candidate as authoritative
POST /api/projects/:id/script/confirm
Body: { candidateId, notes }
Returns: { authoritative, gateStates } or 409 if violations
```

## Workflow

```
1. Confirm ingestion → 2. Generate script → 3. Review violations → 4. Confirm → 5. Proceed to TTS
```

## Violations

| Type | Severity | Blocks? | Example |
|------|----------|---------|---------|
| `unknown_component` | ERROR | ✅ Yes | Script mentions "Mystery Widget" not in confirmed components |
| `missing_required_component` | WARNING | ❌ No | Component overview only mentions 3 of 10 components |

## Error Codes

| Code | Status | Meaning |
|------|--------|---------|
| `INGESTION_GATES_BLOCKED` | 409 | Ingestion gates not satisfied |
| `SCRIPT_HAS_VIOLATIONS` | 409 | Script has blocking violations |
| `NO_AUTHORITATIVE_SCRIPT` | 404 | No authoritative script exists |

## Locked Invariants

1. **No Overwrite** - Scripts are append-only
2. **Provenance Required** - Every script has hash-based provenance
3. **Consistency Validation** - Unknown components = ERROR
4. **Explicit Confirmation** - No auto-promotion
5. **Gate Enforcement** - CONFIRM_SCRIPT required when candidates exist
6. **Transactional** - Confirmation is atomic
7. **Violation Blocking** - ERROR violations block confirmation

## Frontend Component

```jsx
import ScriptReview from './components/ScriptReview';

<ScriptReview 
  projectId={projectId} 
  onComplete={() => navigate('/tts')} 
/>
```

## Testing

```bash
# Run integration tests
npm test tests/integration/script-gates.test.js

# Run unit tests
npm test tests/unit/scriptConsistency.test.js
```

## Files

```
src/utils/scriptArtifact.js          - Model
src/utils/scriptConsistency.js       - Validator
src/api/index.js                     - Endpoints
client/src/components/ScriptReview.js - UI
docs/script-authority.md              - Full docs
```

## Common Issues

### "Cannot generate script"
→ Check ingestion gates are satisfied (`CONFIRM_METADATA`, `CONFIRM_COMPONENTS`)

### "Cannot confirm script"
→ Check for ERROR-level violations (unknown components)

### "TTS blocked"
→ Confirm a script candidate as authoritative first

## Next Phase

**Phase G**: Storyboard Authority - Map script segments to visual frames
