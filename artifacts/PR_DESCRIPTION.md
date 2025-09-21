# Improve API layer: centralize fetchJson, migrate axios calls, add DevTestPage, and expand tests

## Description

This PR centralizes API interactions around a robust fetchJson utility and migrates critical API calls (handleExtractMetadata and runWebSearch) away from ad-hoc axios usage. It also adds a reversible DevTestPage gated by an environment variable (REACT_APP_SHOW_DEV_TEST) for isolated validation, ensures ESLint/Prettier compliance, and introduces comprehensive tests (Jest unit tests for helpers and Playwright E2E tests for toast deduplication and QA gates).

### Key changes:

* Add fetchJson utility with retries, error mapping, and toast deduplication
* Create API helper modules: extractBggHtml.js and searchImages.js that use fetchJson
* Migrate handleExtractMetadata and runWebSearch in App.jsx to use these helpers
* Add DevTestPage component, enabled via REACT_APP_SHOW_DEV_TEST
* Add Jest unit tests for core utilities and API helpers
* Add Playwright E2E tests for toast deduplication and DebugChips/QA gating
* Fix ESLint and Prettier issues across the codebase

### Testing:

* Run unit tests: `npm test` (or `yarn test`)
* Run E2E tests using Playwright: `npx playwright test`
* Manual QA steps in PR checklist below

### Notes:

* This change is reversible — DevTestPage is disabled by default unless REACT_APP_SHOW_DEV_TEST=true
* See "Next steps" for follow-ups: migrate remaining APIs, expand coverage, and add CI integration

## Checklist

- [ ] Code compiles and app runs locally
- [ ] All unit tests pass: `npm test`
- [ ] Playwright tests pass locally: `npx playwright test`
- [ ] ESLint and Prettier applied: `npx eslint . --fix && npx prettier --write .`
- [ ] Add PR reviewers and link to this summary

## How to enable DevTestPage locally

Create or update .env.local (or the env mechanism your app uses):
```
REACT_APP_SHOW_DEV_TEST=true
```

Restart your dev server:
```
npm start
# or
yarn start
```

Navigate to the path or UI area where the app conditionally renders DevTestPage (e.g., /dev-test or a special menu). DevTestPage is designed to be isolated and reversible; disable by unsetting the env var.

## Next steps / roadmap (prioritized)

1. Migrate remaining API calls to fetchJson (batch by area: images, game data, user actions)
2. Expand Jest coverage for edge cases (timeouts, retries, error mapping)
3. Add Playwright tests to CI and add test artifacts upload (screenshots/traces)
4. Integrate fetchJson telemetry hooks (request id, timing) for observability
5. Add documentation (README section) describing fetchJson options and toast deduping