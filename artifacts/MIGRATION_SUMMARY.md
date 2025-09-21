# Axios to fetchJson Migration Summary

## Overview
This document summarizes the migration from axios to the custom fetchJson utility across the mobius-games-tutorial-generator project.

## Changes Made

### 1. Core Utility Implementation
- Created `fetchJson.js` utility with built-in retry logic, error mapping, and toast deduplication
- Created `errorMap.js` for centralized error handling and user-friendly messaging
- Enhanced `ToastContext.js` with deduplication capabilities

### 2. API Helper Modules
Created dedicated API helper modules for all axios calls:
- `generateStoryboard.js`
- `extractBggHtmlDirect.js`
- `extractExtraImages.js`
- `fetchBggImages.js`
- `uploadPdf.js`
- `extractComponents.js`
- `generateTts.js`
- `summarizeText.js`
- `saveProject.js`

### 3. Component Updates
- Updated `App.jsx` to use new API helpers instead of direct axios calls
- Fixed duplicate imports and syntax errors
- Removed all axios imports from the codebase

### 4. Dependency Management
- Removed axios from `package.json` dependencies
- Cleaned up unused imports

### 5. Testing
- Updated existing tests to mock fetch instead of axios
- Added tests for retry/backoff behavior using fake timers
- Added tests to assert dedupe behavior
- Added tests for AbortSignal during backoff

## Migration Benefits

### 1. Improved Error Handling
- Centralized error mapping with user-friendly messages
- Automatic toast notifications with deduplication
- Better error context for debugging

### 2. Enhanced Reliability
- Built-in retry with exponential backoff
- AbortSignal support for cancellations
- Better handling of network issues

### 3. Better User Experience
- Consistent toast notifications
- Deduplication to prevent duplicate error messages
- Improved loading states and feedback

### 4. Code Quality
- Reduced boilerplate code
- Centralized API calls in dedicated modules
- Better separation of concerns

## Files Modified

### Client-side
- `client/src/App.jsx` - Migrated all axios calls to fetchJson helpers
- `client/src/api/*.js` - Created new API helper modules
- `client/src/utils/fetchJson.js` - Core fetch utility
- `client/src/utils/errorMap.js` - Error mapping utility
- `client/src/contexts/ToastContext.js` - Enhanced with deduplication
- `client/package.json` - Removed axios dependency

### Test Files
- Updated Jest tests to mock fetch instead of axios
- Added new test cases for fetchJson features

## Rollback Plan
If issues are detected after deployment:
1. Revert the PR
2. Reinstall axios: `npm install axios`
3. Restore axios imports in affected files
4. Re-deploy the previous version

## Next Steps
1. Monitor error rates and user feedback for the first 24-72 hours
2. Add telemetry for fetchJson usage (attempts, elapsedMs, Retry-After usage)
3. Migrate any remaining axios usages in other parts of the codebase
4. Update team documentation with concrete examples and best practices