# fetchJson Implementation Validation

This document describes how to validate the fetchJson implementation and its related components.

## Overview

The fetchJson utility provides a robust, consistent way to make API calls with built-in features like:
- Automatic toast notifications with deduplication
- Retry logic with exponential backoff
- Centralized error handling
- Abort signal support

## Validation Setup

The validation environment has been set up to be isolated and reversible:

1. **DevTestPage Component**: A temporary test page that renders the ApiSmokeTest component
2. **Environment-based Toggle**: Switch between the normal App and DevTestPage using environment variables
3. **QA Gating**: DebugChips component visibility controlled by REACT_APP_QA_LABELS

## Files Created

- `src/components/DevTestPage.jsx` - Temporary test page
- `src/index.js` - Updated to toggle between App and DevTestPage
- `.env` - Updated with validation environment variables
- `VALIDATION_STEPS.md` - Detailed validation steps
- `MIGRATION_EXAMPLE.md` - Example of migrating axios calls to fetchJson
- `IMPLEMENTATION_SUMMARY.md` - Summary of all components implemented
- `validation.ps1` - PowerShell validation script
- `validation.sh` - Bash validation script

## Validation Steps

### 1. Start the Development Server

```bash
npm start
```

### 2. Verify DevTestPage is Rendered

Open your browser to http://localhost:3000 and confirm you see:
- "Dev Test Page" heading
- ApiSmokeTest component with three buttons:
  - "Call Health"
  - "Call Oversize (413)"
  - "Call Network Fail"

### 3. Test Deduplication Functionality

1. Click "Call Health" button
   - Expect: Success toast message
   - Expect: DebugChips info panel shows requestId, latency, source

2. Click "Call Oversize (413)" button multiple times rapidly
   - Expect: Only one error toast despite multiple clicks

3. Click "Call Network Fail" button multiple times rapidly
   - Expect: Only one error toast despite internal retries

### 4. Verify QA Gating

1. Set `REACT_APP_QA_LABELS=false` in `.env`
2. Restart dev server
3. Click "Call Health"
   - Expect: Success toast appears
   - Expect: DebugChips info panel does NOT appear

### 5. Restore Normal App

1. Set `REACT_APP_SHOW_DEV_TEST=false` in `.env`
2. Restart dev server
3. Confirm normal App component is rendered

## Migration Example

See `MIGRATION_EXAMPLE.md` for a detailed example of how to migrate axios calls to fetchJson.

## Running Validation Scripts

### PowerShell (Windows)
```powershell
.\validation.ps1
```

### Bash (macOS/Linux)
```bash
chmod +x validation.sh
./validation.sh
```

## Reverting Changes

To revert the validation setup:

1. Set `REACT_APP_SHOW_DEV_TEST=false` in `.env`
2. Optionally remove `REACT_APP_SHOW_DEV_TEST` and `REACT_APP_QA_LABELS` from `.env`
3. Restart the development server
4. Delete `src/components/DevTestPage.jsx` (optional, but recommended for cleanup)

## Benefits of fetchJson Implementation

1. **Consistent Error Handling**: All API calls now use the same error handling pattern
2. **Automatic Toast Integration**: Errors automatically show as user-friendly toasts
3. **Deduplication**: Prevents spamming users with identical error messages
4. **Retry Logic**: Built-in retries for transient network errors
5. **Abort Support**: API calls can be cancelled when needed
6. **Centralized Configuration**: All API call settings in one place
7. **Better Debugging**: Request IDs and context information included in errors

## Next Steps

1. Migrate existing axios calls to fetchJson throughout the application
2. Remove axios dependency once all migrations are complete
3. Continue adding new API calls using the hook-based pattern
4. Expand error mapping as needed for new error types