# PR Creation Instructions

## Summary of Changes

This PR standardizes environment variable handling and improves WebSocket connection stability during development:

1. Created a standardized environment variable helper utility
2. Updated App.jsx and index.js to use the new helper
3. Added ESLint rule to prevent direct process.env access
4. Expanded WebSocketGuard unit tests
5. Reduced noisy WebSocket reconnection logs

## Files Created/Modified

- `client/src/utils/env.js` (new)
- `client/src/App.jsx` (modified)
- `client/src/index.js` (modified)
- `client/src/utils/__tests__/WebSocketGuard.test.js` (modified)
- `client/.eslintrc.json` (modified)
- `PR_DESCRIPTION.md` (modified)
- `CHANGED_FILES.md` (new)
- `COMMIT_MESSAGE.txt` (new)
- `MERGE_CHECKLIST.md` (new)

## Recommended Git Commands

To create the PR locally, run these commands:

```bash
# Create and switch to a new branch
git checkout -b fix/ws-guard-env-consistency

# Stage all changes
git add .

# Commit with the standardized message
git commit -m "chore: standardize REACT_APP_SHOW_DEV_TEST, add WebSocketGuard and tests"

# Push the branch to origin
git push --set-upstream origin fix/ws-guard-env-consistency

# Create the PR using GitHub CLI
gh pr create --title "Standardize env var handling & add WebSocketGuard with tests" --body-file PR_DESCRIPTION.md --base main
```

## Testing Instructions

Before creating the PR, verify all changes work correctly:

1. Run the unit tests:
   ```bash
   cd client && npm test
   ```

2. Start the development server and verify functionality:
   ```bash
   npm run dev
   ```

3. Verify ESLint rules:
   ```bash
   cd client && npx eslint .
   ```