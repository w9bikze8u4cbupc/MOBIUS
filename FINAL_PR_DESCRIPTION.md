# Stabilize frontend: WebSocketGuard + env helper, deterministic tests, lint & PR artifacts

## Summary

Stabilizes the Mobius Games Tutorial frontend/dev workflow by:
- Standardizing environment-variable access via a small env helper.
- Introducing WebSocketGuard with exponential backoff + jitter and deterministic behavior.
- Making WebSocketGuard unit tests deterministic and preventing hanging tests via robust Jest teardown.
- Adding a targeted ESLint rule to discourage direct process.env usage.
- Adding PR artifacts, CI workflow snippet, troubleshooting docs, and automation scripts for smooth PR creation and CI validation.

## Why

Corrupted/inconsistent environment checks and flaky WebSocket reconnection tests caused HMR/WebSocket noise and unreliable CI. This PR enforces a single, testable pattern for env access, robust reconnect behavior, and deterministic tests to make CI and local development stable.

## What changed (high level)

### Environment variable access

- Added: client/src/utils/env.js (getShowDevTest(), centralizes REACT_APP_SHOW_DEV_TEST behavior)
- Replaced direct process.env checks in: App.jsx, index.js → now use env helper
- ESLint: relaxed broad blocking rule; added targeted no-restricted-syntax (discourage direct process.env, point to env helper)

### WebSocket reliability

- Added: client/src/utils/WebSocketGuard.js
- connect/close/send API
- exponential backoff with jitter, retry cap, max delay
- hooks/callbacks: onOpen, onClose, onError, onMessage

### Tests & teardown

- Reworked: client/src/utils/tests/WebSocketGuard.test.js
- Deterministic Math.random mocking for jitter assertions
- jest.useFakeTimers() + explicit jest.advanceTimersByTime(...)
- afterEach teardown that restores timers, clears mocks, restores Math.random, and closes any live mock sockets
- Fixed duplicate test names; tests are focused and deterministic

### Linting & docs

- ESLint rule added: targeted rule to discourage direct process.env use
- Added README / TROUBLESHOOTING.md w/ dev-start commands, ports, toggle instructions, WebSocket notes

### PR & CI artifacts

- Added: PR_DESCRIPTION.md, FULL_PR_BODY.md, CHANGED_FILES.md, COMMIT_MESSAGE.txt, MERGE_CHECKLIST.md
- CI workflow: .github/workflows/CI_WORKFLOW.yml (runs lint + tests on PRs)
- Automation: CREATE_PR.bat, CREATE_PR.sh, FINAL_PR_INSTRUCTIONS.md
- Summary/checklist docs: PR_SUMMARY.md, PROJECT_COMPLETION_CHECKLIST.md, TROUBLESHOOTING.md

## Files changed (core)

- client/src/utils/env.js (new)
- client/src/utils/WebSocketGuard.js (new)
- client/src/utils/tests/WebSocketGuard.test.js (updated)
- client/src/App.jsx (cleaned, now uses env helper)
- client/src/index.js (cleaned, now uses env helper)
- .eslintrc.js / ESLint config (targeted no-restricted-syntax rule)
- README / TROUBLESHOOTING.md (new/updated)
- .github/workflows/CI_WORKFLOW.yml (new)
- PR artifacts & automation scripts (PR_DESCRIPTION.md, FULL_PR_BODY.md, CHANGED_FILES.md, COMMIT_MESSAGE.txt, MERGE_CHECKLIST.md, CREATE_PR.bat, CREATE_PR.sh, FINAL_PR_INSTRUCTIONS.md, PR_SUMMARY.md, PROJECT_COMPLETION_CHECKLIST.md)

## How to validate locally (quick)

### Install dependencies
```bash
cd client && npm ci
```

### Lint
```bash
cd client && npm run lint
```

### Run the WebSocketGuard tests (deterministic)
```bash
npx jest client/src/utils/tests/WebSocketGuard.test.js --config=jest.config.cjs --runInBand --detectOpenHandles --verbose
```

### Smoke-run dev
```bash
npm run dev
```

- Frontend: http://localhost:3001
- Backend health: http://localhost:5001/healthz

## Notes on test determinism and teardown

- Tests mock Math.random deterministically when asserting jitter bounds.
- Tests use jest fake timers and explicitly advance timers to trigger reconnect attempts.
- afterEach ensures:
  - jest.useRealTimers()
  - jest.clearAllTimers(), jest.clearAllMocks(), jest.restoreAllMocks()
  - Restores Math.random
  - Closes any live mock WebSocket created by WebSocketGuard This prevents hanging tests and leaking sockets/mocks into other tests.

## CI notes

CI workflow snippet (.github/workflows/CI_WORKFLOW.yml) will run lint + tests on PRs. Recommend adding the full unit test matrix and E2E later.

## Merge readiness

All changes include tests or lint updates as appropriate.
PR artifacts and a FINAL_PR_INSTRUCTIONS.md are included to simplify review and merge.

## Placeholders (please replace as needed)

- Branch name: feature/websocket-guard
- Target: main
- Reviewers / labels: [@frontend-team], labels: [frontend, tests, ci]

## One-page reviewer checklist (run locally before merging)

### Quick checks (5–10 minutes)

**Checkout PR branch:**
```bash
git checkout -b feature/websocket-guard origin/feature/websocket-guard
```

**Install and lint:**
```bash
cd client
npm ci
npm run lint
```

**Expect**: no new lint errors (targeted rule enforces env helper)

### Unit tests (deterministic checks)

**Run WebSocketGuard unit tests only:**
```bash
npx jest client/src/utils/tests/WebSocketGuard.test.js --config=jest.config.cjs --runInBand --detectOpenHandles --verbose
```

**Expect**: all tests pass quickly and no hanging or open-handle warnings.

**Key verifications:**
- Tests mock Math.random deterministically (no nondeterministic failures).
- Jest timers are advanced explicitly (no reliance on real timers).
- afterEach cleans up: no leaks, sockets closed.

### Full test subset (recommended)

**Run unit tests in package:**
```bash
cd client
npm test -- --runInBand --detectOpenHandles
```

**Expect**: no intermittent failures, CI-like behavior

### Smoke dev run (HMR & WebSocket sanity)

**Start dev:**
```bash
npm run dev
```

- Open UI: http://localhost:3001
- Verify:
  - UI respects the REACT_APP_SHOW_DEV_TEST toggle (toggleable in UI per README)
  - No reconnect spam on page refresh or HMR (WebSocketGuard should cap retries/max delay)
  - Backend health: http://localhost:5001/healthz

### Manual WebSocket checks

Simulate backend disconnects (or stop backend) and observe reconnect behavior:
- Exponential backoff with jitter should be visible in reconnect timings.
- Retries should stop after configured maxAttempts or respect max delay cap.

### PR artifacts & CI

Confirm presence of:
- .github/workflows/CI_WORKFLOW.yml
- PR_DESCRIPTION.md, FULL_PR_BODY.md, MERGE_CHECKLIST.md
- CREATE_PR scripts and FINAL_PR_INSTRUCTIONS.md
- Confirm CI workflow triggers on PR and runs lint + tests (after merge to remote branch)

## Reviewer acceptance criteria (pass to merge)

- **Lint**: no errors introduced by this PR (targeted ESLint rule is present).
- **Tests**: WebSocketGuard tests pass deterministically and do not hang.
- **Behavior**: HMR/dev UX no longer produces WebSocket reconnect spam; environment toggle behaves consistently.
- **Documentation**: TROUBLESHOOTING.md / FINAL_PR_INSTRUCTIONS.md are present and clear.
- **CI**: CI_WORKFLOW.yml is present and matches team CI policies for PR checks.

## Optional (recommended follow-ups, not blockers)

- Add WebSocketGuard edge-case unit tests: backoff caps, jitter bounds, maxAttempts.
- Add WebSocketGuard integration tests in CI matrix.
- Add a pre-commit hook or small lint autofix to encourage use of env helper moving forward.