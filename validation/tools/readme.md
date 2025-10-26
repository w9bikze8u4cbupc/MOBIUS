# Validation Tools

This directory contains tools and scripts for validating the Mobius Tutorial Generator functionality in environments where UI interaction is not possible.

## API Validation Harness

The [api-validation-harness.js](api-validation-harness.js) script provides programmatic access to UI-driven flows through direct API calls, allowing validation of functionality that would normally require UI interaction.

### Features

- Calls relevant API endpoints with deterministic payloads
- Verifies persistence by querying the SQLite DB or filesystem artifacts
- Outputs structured logs usable as checklist evidence
- Covers A- and B-section behaviors via API

### Usage

```bash
# Run the harness directly
node api-validation-harness.js

# Or import functions in other scripts
import { fetchBGGMetadata, ingestPDF } from './api-validation-harness.js';
```

### Available Functions

- `createProject()` - Create a new project record
- `updateProjectMetadata()` - Simulate UI edits/overrides
- `saveProject()` - Emulate "Save" actions
- `ingestPDF()` - Test rulebook ingestion
- `fetchBGGMetadata()` - Fetch BGG metadata by ID or URL
- `uploadAssets()` - Upload visual assets
- `validateAutoCrop()` - Validate auto-crop results
- `applyTheme()` - Apply themes and layouts

### Environment Variables

- `MOBIUS_API_URL` - Base URL for the Mobius API (defaults to http://localhost:5001)

## Adding New Tools

When adding new validation tools:

1. Place the tool in this directory
2. Document its usage in this README
3. Ensure it follows the evidence capture conventions
4. Update the validation execution tracker when used