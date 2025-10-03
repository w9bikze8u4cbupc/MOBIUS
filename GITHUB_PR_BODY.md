## Summary

Stabilizes the Mobius Games Tutorial frontend and developer workflow by:

- Centralizing env access via an env helper to avoid inconsistent REACT_APP_SHOW_DEV_TEST checks
- Adding WebSocketGuard with exponential backoff + jitter and reconnect caps to reduce reconnect spam during dev/HMR
- Reworking WebSocketGuard unit tests to be deterministic (mocked Math.random, fake timers) and adding a robust Jest teardown to prevent hanging tests
- Adding a targeted ESLint rule to discourage direct process.env access and point contributors to the env helper
- Including PR artifacts, CI workflow snippet, troubleshooting docs, and automation scripts to simplify PR creation and review

## Why

Inconsistent env checks, corrupted files, and flaky WebSocket reconnection tests were causing HMR/WebSocket noise and unstable CI. This PR enforces consistent env access, reduces reconnect noise, and makes tests deterministic so CI and local development are reliable.

## What changed (high level)

### Environment variable access

- Added: client/src/utils/env.js (getShowDevTest())
- Replaced direct process.env usages in App.jsx and index.js with env helper calls
- ESLint: added targeted no-restricted-syntax rule to discourage direct process.env access

### WebSocket reliability

- Added: client/src/utils/WebSocketGuard.js
- connect/close/send API
- exponential backoff + jitter, retry cap, max delay
- hooks: onOpen, onClose, onError, onMessage

### Tests & teardown

- Updated: client/src/utils/tests/WebSocketGuard.test.js
- Deterministic Math.random mocking
- jest.useFakeTimers() + explicit jest.advanceTimersByTime(...)
- afterEach teardown: restore timers, clear timers/mocks, restore Math.random, close mock sockets
- Fixed duplicate test names and made tests focused/deterministic

### Linting & docs

- Targeted ESLint rule to discourage direct process.env usage
- Added/updated README and TROUBLESHOOTING.md with dev-start commands, ports, toggle instructions, and WebSocket guidance

### PR & CI artifacts

- Added PR_DESCRIPTION.md, FULL_PR_BODY.md, CHANGED_FILES.md, COMMIT_MESSAGE.txt, MERGE_CHECKLIST.md, PR_SUMMARY.md, PROJECT_COMPLETION_CHECKLIST.md
- Automation scripts: CREATE_PR.bat, CREATE_PR.sh, FINAL_PR_INSTRUCTIONS.md
- CI workflow: .github/workflows/CI_WORKFLOW.yml (runs lint + tests on PRs)

## Key files touched / added

- client/src/utils/env.js (new)
- client/src/utils/WebSocketGuard.js (new)
- client/src/utils/tests/WebSocketGuard.test.js (updated)
- client/src/App.jsx (cleaned; uses env helper)
- client/src/index.js (cleaned; uses env helper)
- .eslintrc.js / ESLint config (targeted rule)
- README / TROUBLESHOOTING.md (new/updated)
- .github/workflows/CI_WORKFLOW.yml (new)
- PR artifacts & scripts (see list above)

## How to validate locally

### Install deps
```bash
cd client && npm ci
```

### Lint
```bash
cd client && npm run lint
```

### Run WebSocketGuard tests (deterministic)
```bash
npx jest client/src/utils/tests/WebSocketGuard.test.js --config=jest.config.cjs --runInBand --detectOpenHandles --verbose
```

### Smoke-run dev
```bash
npm run dev
```

- Frontend: http://localhost:3001
- Backend health: http://localhost:5001/healthz

Notes: tests mock Math.random deterministically; tests use fake timers with explicit advances; afterEach restores global state and closes mock sockets to avoid leaks.

## CI notes

.github/workflows/CI_WORKFLOW.yml runs lint + tests on PRs. Recommend expanding CI matrix to include full unit test suite and E2E in subsequent PRs.

## Merge readiness

All changes include tests or lint updates as appropriate.
PR artifacts and FINAL_PR_INSTRUCTIONS.md included to simplify review/merge.

## Branch / target

- Branch: feature/websocket-guard
- Target: main

## Reviewers & labels

- Reviewers: @frontend-team
- Labels: frontend, tests, ci