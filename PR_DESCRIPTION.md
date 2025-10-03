# Standardize env var handling & add WebSocketGuard with tests

## Summary

This PR standardizes the handling of the `REACT_APP_SHOW_DEV_TEST` environment variable and adds a robust WebSocket connection guard with exponential backoff and jitter to improve development stability.

## Changes

### Environment Variable Standardization
- Created a standardized helper utility (`src/utils/env.js`) for accessing environment variables
- Updated `App.jsx` and `index.js` to use the new helper instead of direct `process.env` access
- Added ESLint rule to prevent direct `process.env` access in the future

### WebSocket Connection Improvements
- Implemented `WebSocketGuard` utility with exponential backoff and jitter
- Added comprehensive unit tests for all WebSocketGuard functionality
- Reduced noisy WebSocket reconnection logs during development

## Validation Evidence

- All existing tests pass
- New WebSocketGuard unit tests pass with full coverage of edge cases
- ESLint validation enforces the new environment variable access pattern
- Manual testing confirms dev test toggle works correctly

## CI Config Notes

The new ESLint rule will prevent direct access to `process.env` and require using the helper functions in `src/utils/env.js`.

Example:
```javascript
// Before (no longer allowed)
const showDevTest = String(process.env.REACT_APP_SHOW_DEV_TEST || '').toLowerCase() === 'true';

// After (required)
import { getShowDevTest } from './utils/env';
const showDevTest = getShowDevTest();
```

## Security

No security implications. The env helper actually improves security by restricting which environment variables can be accessed.

## Risk & Rollout

Low risk. Changes are limited to development utilities and do not affect production code paths.

## How to Test

1. Start the development servers:
   ```bash
   npm run dev
   ```
2. Verify the frontend is accessible at http://localhost:3001
3. Confirm the dev test toggle still works correctly
4. Run the unit tests:
   ```bash
   npm test -- client
   ```

## Checklist

- [x] CI passes with new ESLint rules
- [x] All existing tests continue to pass
- [x] New WebSocketGuard tests pass
- [x] Dev test toggle functionality verified
- [x] No more noisy WebSocket reconnection logs