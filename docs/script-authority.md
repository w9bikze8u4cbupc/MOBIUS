# Script Authority Model

**Status**: PHASE F.3 COMPLETE  
**Version**: 1.0  
**Last Updated**: 2026-02-02

## Overview

The Script Authority Model ensures that tutorial scripts are derived artifacts with explicit operator authority. Scripts are never auto-accepted or overwritten—they are generated as candidates, validated for consistency with confirmed ingestion data, and require operator confirmation before becoming authoritative.

## Design Principles

### 1. Scripts as Derived Artifacts
- Scripts are **generated from confirmed ingestion data**
- Each script is a **candidate** until explicitly confirmed
- Scripts are **never overwritten**—always append new candidates
- Each candidate has **provenance** (prompt hash, inputs hash, model, timestamp)

### 2. Consistency Enforcement
- Scripts validated against **confirmed ingestion report**
- Unknown components → **ERROR** (blocks confirmation)
- Missing components in overview → **WARNING** (allows confirmation)
- Fuzzy matching for component names (handles plurals, synonyms)

### 3. Operator Authority
- Operator must **explicitly confirm** one candidate as authoritative
- Authoritative script required before TTS/storyboard/render
- Confirmation updates `CONFIRM_SCRIPT` gate
- Gates are **structurally unavoidable**—no bypass mode

## ScriptArtifact Schema

```javascript
{
  id: string,                    // UUID
  projectId: number,             // Foreign key to projects table
  language: string,              // 'en', 'fr', etc.
  status: string,                // 'candidate', 'authoritative', 'rejected'
  createdAt: string,             // ISO 8601 timestamp
  model: string,                 // 'gpt-4', etc.
  promptHash: string,            // SHA-256 hash of prompt
  inputsHash: string,            // SHA-256 hash of inputs
  scriptSegments: Array<{        // Structured segments
    type: string,                // 'introduction', 'component_overview', etc.
    content: string              // Segment text
  }>,
  rawScript: string,             // Full text (backward compatibility)
  warnings: Array<object>,       // Non-blocking issues
  violations: Array<object>,     // Blocking issues
  metadata: {
    wordCount: number,
    segmentCount: number
  }
}
```

## Segment Types

Scripts are parsed into typed segments for structured diffing and future storyboard mapping:

- `introduction` - Opening and game overview
- `component_overview` - Physical components description
- `setup` - Game setup instructions
- `objective` - Win condition
- `gameplay` - Core gameplay loop
- `turn_structure` - Turn sequence
- `special_rules` - Edge cases and special rules
- `example_turn` - Walkthrough example
- `end_game` - Game end trigger
- `scoring` - Point calculation
- `tips` - Strategy advice
- `variants` - Optional rules
- `recap` - Summary and closing

## Violation Types

### ERROR (Blocks Confirmation)

#### `unknown_component`
- **Trigger**: Script references component not in confirmed components list
- **Example**: Script mentions "Mystery Widget" but ingestion only confirmed "Action Card" and "Resource Token"
- **Resolution**: Remove unknown component or add it to confirmed components

#### `inconsistent_setup`
- **Trigger**: Setup instructions contradict confirmed setup logic
- **Example**: Script says "shuffle 40 cards" but ingestion confirmed 50 cards
- **Resolution**: Correct script or update ingestion data

### WARNING (Allows Confirmation)

#### `missing_required_component`
- **Trigger**: Component overview mentions <50% of confirmed components
- **Example**: Ingestion confirmed 10 components but script only mentions 3
- **Resolution**: Expand component overview (optional)

#### `terminology_mismatch`
- **Trigger**: Script uses different terminology than ingestion
- **Example**: Ingestion says "Victory Point Token" but script says "VP Marker"
- **Resolution**: Standardize terminology (optional)

## Workflow

### 1. Generate Script Candidate

**Endpoint**: `POST /api/projects/:id/script/generate`

**Prerequisites**:
- Ingestion gates must be satisfied (`CONFIRM_METADATA`, `CONFIRM_COMPONENTS`)

**Request**:
```json
{
  "rulebookText": "...",
  "gameName": "Catan",
  "metadata": { "title": "Catan", "designer": "Klaus Teuber" },
  "components": [
    { "name": "Resource Card", "quantity": 95 },
    { "name": "Development Card", "quantity": 25 }
  ],
  "language": "en",
  "detailPercentage": 25
}
```

**Response**:
```json
{
  "success": true,
  "artifact": { /* ScriptArtifact */ },
  "canConfirm": false,
  "message": "Script generated but has blocking violations"
}
```

**Behavior**:
- Generates script using OpenAI GPT-4
- Parses into structured segments
- Validates consistency with ingestion report
- Saves as candidate (never overwrites)
- Returns violations and warnings

### 2. List Candidates

**Endpoint**: `GET /api/projects/:id/script/candidates`

**Response**:
```json
{
  "success": true,
  "candidates": [ /* Array of ScriptArtifacts */ ],
  "count": 2
}
```

### 3. Get Authoritative Script

**Endpoint**: `GET /api/projects/:id/script/authoritative`

**Response** (if exists):
```json
{
  "success": true,
  "script": { /* ScriptArtifact with status='authoritative' */ }
}
```

**Response** (if not exists):
```json
{
  "error": "No authoritative script found",
  "code": "NO_AUTHORITATIVE_SCRIPT"
}
```

### 4. Confirm Candidate as Authoritative

**Endpoint**: `POST /api/projects/:id/script/confirm`

**Request**:
```json
{
  "candidateId": "uuid-here",
  "notes": "Looks good, ready for TTS"
}
```

**Response** (success):
```json
{
  "success": true,
  "authoritative": { /* ScriptArtifact */ },
  "gateStates": { /* Updated gate states */ },
  "message": "Script confirmed as authoritative"
}
```

**Response** (blocked by violations):
```json
{
  "error": "Cannot confirm script with blocking violations",
  "code": "SCRIPT_HAS_VIOLATIONS",
  "violations": [
    {
      "type": "unknown_component",
      "severity": "error",
      "message": "Script references component 'Mystery Widget' which is not in confirmed components list",
      "field": "components",
      "value": "Mystery Widget",
      "suggestion": "Remove this component or add it to the confirmed components list"
    }
  ]
}
```

**Behavior**:
- Checks for blocking violations (ERROR severity)
- If violations exist, returns 409 Conflict
- If clean, marks candidate as authoritative
- Marks other candidates as non-authoritative
- Updates `CONFIRM_SCRIPT` gate to CONFIRMED
- Transaction ensures atomicity

## Gate Integration

### CONFIRM_SCRIPT Gate

**Gate ID**: `confirm_script`

**Required When**: Script candidates exist

**Satisfied When**: One candidate confirmed as authoritative

**Blocks**: TTS generation, storyboard generation, render initiation

**Error Code**: `INGESTION_GATES_BLOCKED` (reuses existing gate infrastructure)

## Error Codes

| Code | HTTP Status | Meaning |
|------|-------------|---------|
| `INGESTION_GATES_BLOCKED` | 409 | Ingestion gates not satisfied, cannot generate script |
| `NO_INGESTION_REPORT` | 400 | No ingestion report found, cannot validate script |
| `SCRIPT_HAS_VIOLATIONS` | 409 | Script has blocking violations, cannot confirm |
| `CANDIDATE_NOT_FOUND` | 404 | Specified candidate ID not found |
| `NO_AUTHORITATIVE_SCRIPT` | 404 | No authoritative script exists for project |
| `SCRIPT_INCONSISTENT_WITH_INGESTION` | 409 | Script contradicts confirmed ingestion data |

## Locked Invariants

These invariants are **structurally enforced** and cannot be bypassed:

1. **No Overwrite**: Scripts are append-only. Generating a new script creates a new candidate, never overwrites existing ones.

2. **Provenance Required**: Every script artifact has `promptHash`, `inputsHash`, `model`, and `createdAt` for reproducibility.

3. **Consistency Validation**: All scripts validated against confirmed ingestion report. Unknown components = ERROR.

4. **Explicit Confirmation**: Scripts remain candidates until operator explicitly confirms. No auto-promotion.

5. **Gate Enforcement**: `CONFIRM_SCRIPT` gate required when candidates exist. Downstream operations (TTS, storyboard, render) blocked until satisfied.

6. **Transactional Confirmation**: Confirming a script and updating gate state is atomic. Partial failures roll back.

7. **Violation Blocking**: Scripts with ERROR-level violations cannot be confirmed. Operator must resolve violations first.

## Fuzzy Component Matching

To reduce false positives, component matching uses fuzzy logic:

### Normalization
- Convert to lowercase
- Remove punctuation
- Remove trailing 's' (plural)
- Normalize whitespace

### Matching Rules
1. **Exact match** after normalization
2. **Substring match** (one contains the other)
3. **Synonym match** (die/dice, token/marker, card/deck, piece/meeple)
4. **Generic terms allowed** (card, token, tile, board, piece, die, dice, marker, cube, meeple)

### Examples
- "Action Card" matches "action cards", "ACTION CARD", "action-card"
- "Victory Point Token" matches "victory point tokens", "VP token"
- "Six-sided Die" matches "dice", "die"
- Generic "card" allowed even if only "Action Card" confirmed

## Frontend Integration

### ScriptReview Component

**Location**: `client/src/components/ScriptReview.js`

**Features**:
- Lists all script candidates with status badges
- Displays violations (red) and warnings (yellow)
- Shows authoritative script (if exists)
- Allows confirmation with notes
- Blocks confirmation if violations present
- Blocks navigation until authoritative script confirmed

**Status Banner**:
- **Green**: Authoritative script confirmed, ready to proceed
- **Yellow**: No authoritative script, action required

**Candidate Actions**:
- **Review**: Expand candidate details
- **Confirm**: Mark as authoritative (disabled if violations)
- **View Script**: Show full script text

## Testing

### Integration Tests

**File**: `tests/integration/script-gates.test.js`

**Coverage**:
- Script generation blocked if ingestion gates not satisfied
- Candidate creation and persistence
- Unknown component detection
- Append-only behavior (no overwrite)
- Confirmation updates gate state
- Violations block confirmation
- Persistence across restart
- Downstream gating (TTS blocked until script confirmed)

### Unit Tests

**File**: `tests/unit/scriptConsistency.test.js`

**Coverage**:
- Unknown component detection
- Fuzzy matching (plurals, synonyms, case-insensitive)
- Generic term allowance
- Missing component warnings
- Backward compatibility
- Punctuation handling

## Migration Path

### Existing Projects Without Scripts

**Behavior**: `CONFIRM_SCRIPT` gate not required (backward compatible)

**Reason**: Gate only required when script candidates exist

**Migration**: Generate first script → gate becomes required → confirm script → proceed

### Existing Projects With Legacy Scripts

**Behavior**: Legacy scripts in `projects.script` column ignored

**Migration**:
1. Generate new script candidate from legacy script
2. Validate consistency
3. Confirm as authoritative
4. Legacy column remains for reference but unused

## Future Extensions

### Storyboard Mapping (Phase G)
- Map script segments to visual storyboard frames
- `CONFIRM_STORYBOARD` gate (already stubbed)
- Segment-level timing and visual cues

### Multi-Language Scripts
- Generate candidates in multiple languages
- Language-specific authoritative scripts
- Translation consistency validation

### Collaborative Review
- Multi-user confirmation workflow
- Review comments and suggestions
- Approval chains

## References

- [Ingestion Truth Gates](./ingestion-truth-gates.md) - Upstream gate system
- [Storage Canonicalization](./storage-canonicalization.md) - File storage patterns
- [PHASE_F_PROGRESS.md](../PHASE_F_PROGRESS.md) - Implementation tracker
- [INGESTION_GATES_MILESTONE_LOCK.md](../INGESTION_GATES_MILESTONE_LOCK.md) - Locked invariants

## Changelog

### 2026-02-02 - Phase F.3 Complete
- Added script generation, listing, and confirmation endpoints
- Created ScriptReview frontend component
- Implemented integration and unit tests
- Documented workflow and invariants
- Locked as milestone
