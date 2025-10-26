# Preview Worker Payload Validation

This document explains how to use the validation tools for Preview Worker job payloads.

## Files Created

1. `preview_payload_minimal.json` - Minimal valid payload example
2. `preview_payload_full.json` - Full/realistic payload example for testing
3. `scripts/validatePreviewPayload.js` - Node.js validation helper (no external dependencies)
4. `scripts/testPreviewPayloads.js` - Automated test suite for validation
5. `scripts/validate_preview_payload.sh` - Bash script to run validation
6. `scripts/validate_preview_payload.ps1` - PowerShell script to run validation

## Payload Structure

### Required Fields

- `jobId` (string) - Unique identifier for the job
- `projectId` (string) - Identifier for the project
- `requestId` (string) - Request correlation ID
- `dryRun` (boolean) - Whether this is a dry run
- `previewRequest` (object) - The preview request details:
  - `steps` (array) - Array of steps
  - `assets` (array) - Array of assets
  - `audio` (object) - Audio configuration

## Using the Validation Tools

### Method 1: Command Line Validation

Validate a specific payload file:
```bash
node scripts/validatePreviewPayload.js path/to/payload.json
```

If no path is provided, it defaults to `./payload.json`:
```bash
node scripts/validatePreviewPayload.js
```

### Method 2: Programmatic Usage

Import the validator in your code:
```javascript
const { validatePayload } = require('./scripts/validatePreviewPayload.js');

const payload = { /* your payload */ };
const errors = validatePayload(payload);

if (errors.length === 0) {
  console.log('Payload is valid');
} else {
  console.error('Payload validation errors:', errors);
}
```

### Method 3: Run All Tests

Execute the automated test suite:
```bash
node scripts/testPreviewPayloads.js
```

### Method 4: Shell Scripts

On Unix/Linux/macOS:
```bash
chmod +x scripts/validate_preview_payload.sh
./scripts/validate_preview_payload.sh
```

On Windows:
```powershell
.\scripts\validate_preview_payload.ps1
```

## Validation Rules

The validator checks for:

1. **Basic Structure**: Payload must be a valid object
2. **Required Fields**: 
   - `jobId` must be a string
   - `projectId` must be a string
   - `requestId` must be a string
   - `dryRun` must be a boolean
3. **Preview Request Structure**:
   - `previewRequest` must be an object
   - `previewRequest.steps` must be an array
   - `previewRequest.assets` must be an array
   - `previewRequest.audio` must be an object (not an array)

## Test Cases

The test suite (`testPreviewPayloads.js`) validates:

1. ✅ Valid minimal payload
2. ✅ Valid full payload
3. ✅ Missing `dryRun` field detection
4. ✅ Wrong types for `steps` (object instead of array) and `audio` (array instead of object)

## Example Output

Valid payload:
```
OK: payload is valid
```

Invalid payload:
```
INVALID PAYLOAD:
 - dryRun (boolean) required
 - previewRequest.steps (array) required
```

## Integration with Preview Worker

When implementing the Preview Worker, you can integrate this validation:

```javascript
const { validatePayload } = require('./scripts/validatePreviewPayload.js');

// In your job processor
async function processPreviewJob(job) {
  const errors = validatePayload(job.data);
  if (errors.length > 0) {
    throw new Error(`Invalid job payload: ${errors.join(', ')}`);
  }
  
  // Process valid job
  // ...
}
```

This ensures that only properly structured payloads are processed by the worker.