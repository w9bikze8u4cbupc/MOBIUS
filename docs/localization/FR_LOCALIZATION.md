# French Localization for MOBIUS Scripts

## Overview

MOBIUS supports French (FR) localization of tutorial scripts as **derived artifacts** from the authoritative English (EN) script. This document describes the localization workflow, governance model, and technical implementation.

## Governance Model

### Core Principles

1. **English is Authoritative**: The EN script is the sole source of truth. FR localization is always derived from and subordinate to the EN script.

2. **Explicit Confirmation Required**: FR localizations must be explicitly reviewed and confirmed by an operator before they can be used in rendering.

3. **One-to-One Segment Mapping**: FR localizations maintain exact segment correspondence with the EN script. No segments can be added, removed, or reordered.

4. **Fail Loudly**: Any mismatch, missing segment, or validation error causes the localization to fail with clear error messages.

5. **Traceability**: Every FR segment maintains an explicit reference to its source EN segment, including content hash for verification.

## Workflow

### 1. Prerequisites

Before generating a FR localization:
- An authoritative EN script must exist (confirmed via `CONFIRM_SCRIPT` gate)
- All ingestion gates must be satisfied
- The EN script must have no blocking violations

### 2. Generate FR Localization

**Endpoint**: `POST /api/projects/:id/script/localize`

**Request Body**:
```json
{
  "targetLang": "fr"
}
```

**Process**:
1. Validates that an authoritative EN script exists
2. Checks that no FR localization already exists
3. Builds a translation prompt with all EN segments
4. Calls LLM (GPT-4) for translation
5. Parses and validates the translation response
6. Creates a localized script with segment mappings
7. Stores the localization with status `PENDING`

**Response**:
```json
{
  "success": true,
  "localization": {
    "id": "uuid",
    "language": "fr",
    "status": "pending",
    "segments": [...],
    "metadata": {
      "wordCount": 450,
      "segmentCount": 12,
      "model": "gpt-4"
    }
  }
}
```

### 3. Review FR Localization

Operators should review the FR localization for:
- Translation accuracy and fluency
- Appropriate board game terminology
- Consistency with EN script structure
- Proper formatting and visual cues

### 4. Confirm FR Localization

**Endpoint**: `POST /api/projects/:id/script/localization/confirm`

**Request Body**:
```json
{
  "language": "fr",
  "notes": "Reviewed and approved"
}
```

**Process**:
1. Validates that the localization exists
2. Updates status to `CONFIRMED`
3. Records confirmation timestamp
4. Updates `CONFIRM_LOCALIZATION_FR` gate to `CONFIRMED`

**Gate Enforcement**: The `CONFIRM_LOCALIZATION_FR` gate blocks:
- Rendering with FR captions until confirmed
- Export of FR SRT files until confirmed

### 5. Render with FR Captions

Once confirmed, FR captions can be rendered:

```javascript
await render(job, {
  language: 'fr',  // Select FR localization
  exportSrt: true  // Export FR SRT sidecar
});
```

The render module will:
1. Check that FR localization is confirmed
2. Generate SRT from FR segments
3. Attach FR captions to video (burn-in or sidecar)

## API Reference

### List Localizations

**Endpoint**: `GET /api/projects/:id/script/localizations`

**Response**:
```json
{
  "success": true,
  "authoritativeScriptId": "uuid",
  "localizations": [
    {
      "language": "fr",
      "id": "uuid",
      "status": "confirmed",
      "createdAt": "2026-02-10T...",
      "segmentCount": 12,
      "wordCount": 450
    }
  ]
}
```

## Data Model

### Localized Script Structure

```javascript
{
  id: "uuid",
  language: "fr",
  sourceScriptId: "uuid",  // Reference to EN script
  sourceLanguage: "en",
  status: "pending" | "confirmed" | "rejected",
  createdAt: "ISO8601",
  confirmedAt: "ISO8601",
  segments: [
    {
      segmentIndex: 0,
      type: "introduction",
      enSegmentRef: {
        index: 0,
        type: "introduction",
        contentHash: "abc123..."  // Hash of EN content
      },
      content: "Bienvenue dans ce tutoriel...",
      translatedAt: "ISO8601"
    },
    // ... more segments
  ],
  metadata: {
    model: "gpt-4",
    translationMethod: "llm",
    wordCount: 450,
    segmentCount: 12,
    promptTokens: 1200,
    completionTokens: 800
  },
  notes: "Operator notes"
}
```

## Error Codes

| Code | Description |
|------|-------------|
| `NO_AUTHORITATIVE_SCRIPT` | No confirmed EN script exists |
| `INVALID_TARGET_LANGUAGE` | Target language not supported |
| `SEGMENT_COUNT_MISMATCH` | FR segment count doesn't match EN |
| `MISSING_SEGMENT_REFERENCE` | FR segment missing EN reference |
| `LOCALIZATION_NOT_CONFIRMED` | Attempted to use unconfirmed localization |
| `LOCALIZATION_EXISTS` | FR localization already exists |
| `ALREADY_CONFIRMED` | Localization already confirmed |

## Validation Rules

### Segment Validation

1. **Count Match**: FR must have exactly the same number of segments as EN
2. **Type Match**: Each FR segment must have the same type as its corresponding EN segment
3. **Index Match**: Segment indices must be sequential and match EN
4. **Reference Integrity**: Each FR segment must reference its EN source with valid hash

### Localization Validation

1. **Source Script ID**: Must match the authoritative EN script ID
2. **Language Code**: Must be a supported language (currently only 'fr')
3. **Status**: Must be valid status enum value
4. **Metadata**: Must include required fields (wordCount, segmentCount, model)

## Rendering Integration

### Language Selection

The render module accepts a `language` option:

```javascript
const result = await render(job, {
  language: 'fr',      // Use FR localization
  exportSrt: true,     // Export FR SRT
  burnCaptions: false  // Sidecar instead of burn-in
});
```

### SRT Generation

FR SRT files are generated from confirmed FR segments:
- Timing is inherited from EN script timing
- Text is taken from FR segment content
- File is named `captions_fr.srt`

### Fallback Behavior

If FR localization is requested but not available:
- Render fails with clear error message
- No automatic fallback to EN
- Operator must explicitly choose language

## Testing

### Unit Tests

Located in `tests/unit/scriptLocalization.test.js`:
- Segment count validation
- Type matching validation
- Reference integrity validation
- Hash verification

### Integration Tests

Located in `tests/integration/localization-gates.test.js`:
- Full EN→FR workflow
- Gate enforcement
- Confirmation blocking
- Render integration

## Future Extensions

### Additional Languages

To add support for additional languages:
1. Add language code to `SupportedLanguages` enum
2. Add gate constant (e.g., `CONFIRM_LOCALIZATION_ES`)
3. Add gate definition to `GateDefinitions`
4. Update localization endpoints to accept new language
5. Add language-specific validation rules if needed

### Voiceover Localization

Future phases may add:
- TTS voiceover in target language
- Audio timing adjustments
- Lip-sync considerations
- Multi-track audio export

## Appendix: Translation Prompt

The LLM translation prompt includes:
- Clear instructions for maintaining structure
- Board game terminology guidance
- Tone and style requirements
- JSON output format specification
- Segment count enforcement

See `src/utils/scriptLocalization.js` for the full prompt template.
