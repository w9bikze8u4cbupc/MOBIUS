# Ingestion Truth Gates

## Overview

Ingestion truth gates are a mandatory operator confirmation system that treats all extraction outputs as "claims" requiring explicit verification before downstream processing. This prevents "plausible but wrong" auto-acceptance and ensures data quality.

## Architecture

### Components

1. **Confidence Scoring** (`src/utils/confidence.js`)
   - Scores extraction reliability (0.0-1.0)
   - Levels: HIGH (0.8+), MEDIUM (0.5-0.79), LOW (0.2-0.49), NONE (<0.2)
   - Source-specific calculators for BGG, PDF, AI, components

2. **Ingestion Reports** (`src/utils/ingestionReport.js`)
   - Structured claims with source attribution
   - Per-field confidence + warnings
   - Overall confidence aggregation
   - Progression locking by default

3. **Gate States** (`src/utils/gateConstants.js`)
   - Gate IDs: CONFIRM_METADATA, CONFIRM_COMPONENTS, etc.
   - Statuses: PENDING, CONFIRMED, CORRECTED, REJECTED
   - Required gates computed from report context

4. **Validation** (`src/utils/validation.js`)
   - Hostile input detection (SQL injection, XSS, path traversal)
   - Patch validation (whitelisted fields only)
   - Sanitization utilities

5. **Enforcement** (`src/api/middleware/gates.js`)
   - Server-side blocking middleware
   - GateBlockedError with actionable reasons
   - DEV bypass mode (SKIP_GATES=true)

### Data Flow

```
Ingestion → Report Generation → Gate Initialization → Operator Review → Confirmation → Unlock
```

## Gate Definitions

### Always Required

#### CONFIRM_METADATA
- **Title**: Confirm Game Metadata
- **Description**: Verify game title, designer, publisher, player count, and other basic information
- **Required**: Always

#### CONFIRM_COMPONENTS
- **Title**: Confirm Game Components
- **Description**: Verify the list of physical components extracted from the rulebook
- **Required**: Always

### Conditionally Required

#### CONFIRM_SETUP_LOGIC
- **Title**: Confirm Setup Instructions
- **Description**: Verify the game setup sequence and initial board state
- **Required When**: Setup section was extracted

#### CONFIRM_TURN_STRUCTURE
- **Title**: Confirm Turn Structure
- **Description**: Verify the turn sequence and player actions
- **Required When**: Turn structure was extracted

#### CONFIRM_OCR_HAZARDS
- **Title**: Confirm OCR Extraction Quality
- **Description**: Review text extracted via OCR for potential errors or misreadings
- **Required When**: OCR was used for any extraction

## API Endpoints

### GET /api/projects/:id/ingestion/report

Retrieve ingestion report for a project.

**Response:**
```json
{
  "success": true,
  "report": {
    "projectId": 1,
    "projectName": "Catan",
    "version": "1.0",
    "createdAt": "2026-02-02T10:00:00Z",
    "updatedAt": "2026-02-02T10:00:00Z",
    "fields": {
      "title": {
        "fieldName": "title",
        "value": "Catan",
        "source": "bgg_api",
        "confidence": {
          "score": 0.9,
          "level": "high",
          "warnings": []
        },
        "status": "pending",
        "metadata": {
          "extractedAt": "2026-02-02T10:00:00Z"
        }
      }
    },
    "overallConfidence": {
      "score": 0.85,
      "level": "high",
      "warnings": []
    },
    "progressionLocked": true,
    "warnings": [],
    "errors": []
  }
}
```

### GET /api/projects/:id/ingestion/gates

Retrieve gate states and check if gates are satisfied.

**Response:**
```json
{
  "success": true,
  "gateStates": {
    "confirm_metadata": {
      "gateId": "confirm_metadata",
      "status": "pending",
      "confirmedAt": null,
      "notes": null,
      "patch": null
    }
  },
  "requiredGateIds": ["confirm_metadata", "confirm_components"],
  "satisfied": false,
  "blockedReasons": [
    {
      "gateId": "confirm_metadata",
      "title": "Confirm Game Metadata",
      "reason": "Awaiting operator confirmation"
    }
  ]
}
```

### POST /api/projects/:id/ingestion/gates/confirm

Confirm, correct, or reject a gate.

**Request Body:**
```json
{
  "gateId": "confirm_metadata",
  "status": "confirmed",
  "notes": "Verified against BGG page",
  "patch": {
    "fields.title.value": "The Settlers of Catan"
  }
}
```

**Response:**
```json
{
  "success": true,
  "gateStates": { /* updated states */ },
  "satisfied": false,
  "blockedReasons": [ /* remaining blocks */ ]
}
```

### POST /api/projects/:id/ingestion/gates/reset

Reset gate states to pending (DEV mode only).

**Response:**
```json
{
  "success": true,
  "message": "Gate states reset to pending",
  "gateStates": { /* reset states */ }
}
```

## Operator Workflow

### 1. Ingestion Phase
- BGG metadata extraction
- PDF rulebook parsing
- AI component extraction
- Report generation with confidence scores

### 2. Review Phase
- Navigate to Ingestion Review UI
- View extracted data with confidence badges
- Review warnings and low-confidence fields
- Check required confirmations list

### 3. Confirmation Phase
For each required gate:
- Click "Review" button
- Examine extracted data
- Add notes (optional)
- Choose action:
  - **Confirm**: Data is accurate
  - **Correct**: Apply patch to fix errors
  - **Reject**: Data is wrong, needs re-extraction

### 4. Progression
- All required gates must be CONFIRMED or CORRECTED
- "Continue" button unlocks when satisfied
- Downstream stages (script, storyboard, render) are accessible

## Patchable Fields

Only whitelisted fields can be corrected via patches:

```javascript
{
  'fields.title.value': { type: 'string', maxLength: 200 },
  'fields.designer.value': { type: 'string', maxLength: 200 },
  'fields.artist.value': { type: 'string', maxLength: 200 },
  'fields.publisher.value': { type: 'string', maxLength: 200 },
  'fields.year.value': { type: 'number', min: 1800, max: 2100 },
  'fields.playerCount.value': { type: 'string', maxLength: 50 },
  'fields.playTime.value': { type: 'string', maxLength: 50 },
  'fields.minAge.value': { type: 'number', min: 0, max: 99 },
  'fields.components.value': { type: 'array', maxItems: 200 }
}
```

## Server-Side Enforcement

### Middleware Usage

```javascript
import { enforceGates } from './middleware/gates.js';

// Block script generation until gates satisfied
app.post('/api/projects/:id/generate-script', enforceGates, (req, res) => {
  // Script generation logic
});

// Block render initiation until gates satisfied
app.post('/api/projects/:id/render', enforceGates, (req, res) => {
  // Render logic
});
```

### Error Response

When gates are not satisfied:

```json
{
  "error": "Operation blocked by ingestion truth gates",
  "code": "GATE_BLOCKED",
  "blockedReasons": [
    {
      "gateId": "confirm_metadata",
      "title": "Confirm Game Metadata",
      "reason": "Awaiting operator confirmation"
    }
  ],
  "requiredGateIds": ["confirm_metadata", "confirm_components"],
  "actionRequired": "Complete ingestion review and confirm all required gates"
}
```

**Status Code**: 409 Conflict

## Backward Compatibility

### Projects Without Reports
- Projects created before truth gates are not blocked
- `checkGates()` returns `{ satisfied: true, noReport: true }`
- Operator can optionally generate reports for old projects

### Migration Strategy
1. New columns added with `ALTER TABLE` (non-breaking)
2. Existing projects have `NULL` in new columns
3. NULL treated as "no report" → gates not applicable
4. New projects MUST have reports

## Security Considerations

### Input Validation
- BGG IDs: Numeric only, range 1-9999999
- BGG URLs: HTTPS preferred, domain validation
- PDF paths: No path traversal, .pdf extension required
- Patches: Whitelisted fields only, type validation

### Hostile Input Patterns Blocked
- SQL injection: `'; DROP TABLE--`
- XSS: `<script>alert(1)</script>`
- Path traversal: `../../etc/passwd`
- Null bytes: `\0`

### Sanitization
- Notes: Max 1000 chars, newlines allowed
- Field values: Type-specific limits
- Arrays: Max item counts enforced

## DEV Mode Bypass

For development/testing only:

```bash
SKIP_GATES=true NODE_ENV=development npm start
```

**Warning**: Never use in production. Gates are mandatory for data integrity.

## Testing

### Unit Tests
```bash
npm test -- src/utils/confidence.test.js
npm test -- src/utils/ingestionReport.test.js
npm test -- src/utils/validation.test.js
```

### Integration Tests
```bash
npm test -- tests/integration/ingestion-gates.test.js
```

### Manual Testing
1. Create project with BGG + PDF ingestion
2. Navigate to Ingestion Review
3. Verify confidence badges display
4. Confirm all gates
5. Attempt to proceed to script generation
6. Verify blocking before confirmation
7. Verify unblocking after confirmation

## Troubleshooting

### Gates Not Appearing
- Check if ingestion report exists: `GET /api/projects/:id/ingestion/report`
- Verify required gates computed: `GET /api/projects/:id/ingestion/gates`
- Check browser console for errors

### Blocked Despite Confirmation
- Verify all required gates are CONFIRMED or CORRECTED
- Check for REJECTED gates (must be re-confirmed)
- Verify gate states persisted: Check database `gate_states` column

### Patch Validation Errors
- Ensure field path is in `PatchableFields` whitelist
- Check value type matches definition
- Verify value within min/max/maxLength constraints

### Database Migration Issues
- Columns added via `ALTER TABLE` (safe)
- If column exists, migration skips (no error)
- Check logs for migration success messages

## Future Enhancements

### Planned
- Bulk confirmation for high-confidence fields
- Confidence threshold configuration
- Audit log for gate state changes
- Multi-operator approval workflows

### Not Planned
- Automatic confirmation (violates invariant)
- Skipping gates in production (violates invariant)
- Arbitrary JSON patches (security risk)

## Locked Invariants (Phase 3)

**This section documents invariants that are LOCKED and must not be violated.**

### 1. No Downstream Work Without Confirmed Gates
- All downstream operations MUST enforce gates via `enforceGates` middleware
- Centralized check via `areRequiredGatesSatisfied(projectId)`
- Server returns 409 Conflict with `INGESTION_GATES_BLOCKED` error code
- **Forbidden**: Adding downstream endpoints without gate enforcement

### 2. Standardized Error Code
- Error code: `INGESTION_GATES_BLOCKED` (always)
- Payload includes: `blockedReasons`, `requiredGateIds`, `actionRequired`, `reviewUrl`
- **Forbidden**: Custom error codes or inconsistent payloads

### 3. Centralized Gate Check
- Single source of truth: `areRequiredGatesSatisfied(projectId)` in `db.js`
- Used by middleware, route handlers, and tests
- **Forbidden**: Duplicate gate check logic or inline checks

### 4. Frontend Hard Lock
- Clear BLOCKING vs READY status banner
- Disabled downstream actions until gates satisfied
- Server-provided status is authoritative
- **Forbidden**: Client-side bypass or unclear status

### 5. No Auto-Confirmation
- Gates MUST be explicitly confirmed by operator
- High confidence does not bypass confirmation
- **Forbidden**: Auto-confirming based on any heuristic

### 6. Backward Compatibility
- Projects without reports are not blocked
- NULL columns treated as "gates not applicable"
- **Forbidden**: Breaking changes to existing projects

### 7. Persistence and Consistency
- Gate states persist in SQLite JSON columns
- Transactional updates only
- **Forbidden**: In-memory-only states or non-transactional updates

**See**: [INGESTION_GATES_MILESTONE_LOCK.md](../INGESTION_GATES_MILESTONE_LOCK.md) for complete details.

## References

- [Confidence Scoring](../src/utils/confidence.js)
- [Ingestion Report Builder](../src/utils/ingestionReport.js)
- [Gate Constants](../src/utils/gateConstants.js)
- [Validation Utilities](../src/utils/validation.js)
- [Gate Middleware](../src/api/middleware/gates.js)
- [Integration Tests](../tests/integration/ingestion-gates.test.js)
- [Milestone Lock](../INGESTION_GATES_MILESTONE_LOCK.md)
