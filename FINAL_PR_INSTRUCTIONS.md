# Final PR Creation Instructions

## Summary

This document provides the exact commands and content needed to create the PR for the WebSocketGuard improvements and environment variable standardization.

## Pre-PR Checklist

Before creating the PR, run these commands locally to verify everything works correctly:

```bash
# Run linting
npm run lint
# Or specifically for client:
cd client && npm run lint

# Run WebSocketGuard tests specifically
npx jest client/src/utils/__tests__/WebSocketGuard.test.js --config=jest.config.cjs --runInBand --detectOpenHandles --verbose

# Start dev servers for smoke testing
npm run dev
# Then verify:
# - Frontend at http://localhost:3001
# - Backend health at http://localhost:5001/healthz
# - Dev test toggle functionality

# Run all client tests
cd client && npm test
```

## Git Commands to Create PR

Run these commands from the repository root:

```bash
# Create and switch to a new branch
git checkout -b fix/ws-guard-test-teardown

# Stage all changed files
git add client/src/utils/__tests__/WebSocketGuard.test.js \
    client/src/utils/env.js \
    client/src/App.jsx \
    client/src/index.js \
    client/.eslintrc.json \
    PR_DESCRIPTION.md \
    CHANGED_FILES.md \
    COMMIT_MESSAGE.txt \
    MERGE_CHECKLIST.md

# Commit with the standardized message
git commit -F COMMIT_MESSAGE.txt

# Push the branch to origin
git push --set-upstream origin fix/ws-guard-test-teardown

# Create the PR using GitHub CLI
gh pr create --title "Standardize REACT_APP_SHOW_DEV_TEST and add robust WebSocketGuard tests + teardown" --body-file PR_DESCRIPTION.md --base main
```

## PR Title and Body

### Title
```
Standardize REACT_APP_SHOW_DEV_TEST and add robust WebSocketGuard tests + teardown
```

### Body
```
Problem:
Inconsistent env var handling and flaky WebSocket reconnection tests (timers/mocking left open) led to test hangs and inconsistent UI toggling.

Changes:
- Added a standardized env helper (client/src/utils/env.js) and updated App.jsx/index.js to use it.
- Relaxed overly broad ESLint rule and added a targeted rule to encourage the helper.
- Implemented robust WebSocketGuard with deterministic jitter behavior.
- Rewrote WebSocketGuard tests: deterministic Math.random mocking when needed, unique test names, and a comprehensive afterEach teardown to restore timers, mocks, and close sockets.
- Added documentation files: PR_DESCRIPTION.md, CHANGED_FILES.md, COMMIT_MESSAGE.txt, MERGE_CHECKLIST.md.

How to test:
- Run unit tests: npx jest client/src/utils/__tests__/WebSocketGuard.test.js --config=jest.config.cjs --runInBand --detectOpenHandles --verbose
- Start dev servers: npm run dev — verify frontend at http://localhost:3001 and backend health at /healthz

Notes:
- Tests explicitly restore Math.random and timers; ensure environment supports jest fake timers.
- See CHANGED_FILES.md for file-by-file changes.
```

## Quick Merge Checklist for Reviewers

Add this to the PR for reviewers to verify:

```
## Quick Merge Checklist

- [ ] Confirm lint passes (client/.eslintrc.json changes enforced)
- [ ] Run WebSocketGuard test file locally (no hangs, deterministic results)
- [ ] Smoke-test dev server (frontend :3001, backend :5001)
- [ ] Confirm PR_DESCRIPTION.md and CHANGED_FILES.md sufficiently explain changes
```

## If GitHub CLI is Not Available

If you don't have `gh` CLI installed, you can create the PR manually:

1. Push the branch: `git push --set-upstream origin fix/ws-guard-test-teardown`
2. Go to the GitHub repository page
3. GitHub should show a prompt to create a PR for the new branch
4. Click "Compare & pull request"
5. Set the title and paste the body content above
6. Set the base branch to `main`
7. Click "Create pull request"