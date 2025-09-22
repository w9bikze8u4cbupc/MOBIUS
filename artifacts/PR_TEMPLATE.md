# Migrate Axios to fetchJson Utility

## Description

This PR migrates axios calls to our new [fetchJson](../blob/main/client/src/utils/fetchJson.js) utility across the codebase. The fetchJson utility provides:

- Built-in retry with exponential backoff
- AbortSignal support
- Centralized error mapping
- Toast notification integration with deduplication
- Better error context for debugging

See [ONBOARDING_GUIDE.md](../blob/main/artifacts/ONBOARDING_GUIDE.md) for usage details.

## Files Changed

### API Helpers (Migrated first)

- [ ] `client/src/api/extractBggHtml.js` - Migrated to use fetchJson
- [ ] `client/src/api/searchImages.js` - Migrated to use fetchJson
- [ ] `client/src/api/extractActions.js` - Migrated to use fetchJson

### UI Components (Using API Helpers)

- [ ] `client/src/components/App.jsx` - Updated to use new API helpers
- [ ] `client/src/components/GameDetails.jsx` - Updated to use new API helpers

### Utilities

- [ ] `client/src/utils/fetchJson.js` - Added new utility (already in main)
- [ ] `client/src/utils/errorMap.js` - Added error mapping utility (already in main)

### Context

- [ ] `client/src/context/ToastContext.jsx` - Enhanced with deduplication (already in main)

## Migration Checklist

### 1. Prep & Inventory

- [ ] Created migration branch: `feat/migrate-axios-to-fetchJson`
- [ ] Searched for all axios imports/usages

### 2. Replace Usage Pattern

- [ ] Simple GET calls migrated
- [ ] POST calls with JSON body migrated
- [ ] POST calls with FormData handled correctly (no manual Content-Type)

### 3. Honor fetchJson Options

- [ ] Added `dedupeKey` for repeated user-triggered calls
- [ ] Passed `authToken` when available
- [ ] Used `expectedStatuses` for non-200 success responses
- [ ] Added `errorContext` for richer error mapping
- [ ] Implemented AbortController for cancellations where needed

### 4. Preserve Behavior

- [ ] Replicated global axios interceptors behavior in fetchJson callers
- [ ] Updated callers to use returned JSON directly (not res.data)
- [ ] Handled binary/text responses appropriately
- [ ] Adjusted code that previously accessed response headers

### 5. Tests Updated

- [ ] Unit tests updated to mock fetch instead of axios
- [ ] Added tests for retry/backoff behavior using fake timers
- [ ] Added tests to assert dedupe behavior
- [ ] Added tests for AbortSignal during backoff
- [ ] Updated existing tests that asserted axios response shape

### 6. E2E Tests

- [ ] Updated Playwright tests to trigger UI interactions
- [ ] Added tests for normal success
- [ ] Added tests for repeated failures (deduplicated toast)
- [ ] Added tests for cancellation flows

### 7. Linting & Formatting

- [ ] Ran ESLint + Prettier across changed files
- [ ] Removed unused axios import lines
- [ ] Uninstalled axios package

## Testing

- [ ] Unit tests passing locally
- [ ] Playwright E2E tests passing locally
- [ ] CI workflow runs Jest and Playwright successfully

## Rollout Strategy

1. Deploy to staging first
2. Enable DevTestPage to exercise features
3. Monitor errors/latency for 24-72 hours
4. If issues detected, use rollback plan

## Post-Merge Follow-ups

- [ ] Add telemetry for fetchJson (attempts, elapsedMs, Retry-After used)
- [ ] Migrate remaining axios usages in small batches
- [ ] Update team docs and onboarding guide

## Quick Troubleshooting

If you encounter issues:

- CORS/cookie auth: Confirm fetchJson uses correct credentials setting
- FormData issues: Ensure Content-Type header is not manually set
- Duplicate toasts: Verify dedupeKey is deterministic and passed consistently
- Test timeouts: Use fake timers in Jest and advance timers rather than waiting

## Code Reviewers

- [ ] @backend-owner
- [ ] @frontend-owner
- [ ] @qa-engineer

## Labels

- migration
- api
- tests
