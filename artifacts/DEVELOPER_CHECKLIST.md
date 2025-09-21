# Developer PR Checklist

## Branch and Commit

- [ ] Branch off main: `git checkout -b feat/centralize-fetch`
- [ ] Commit with a concise message: `git commit -m "chore(api): centralize fetchJson, migrate extract/search calls, add DevTestPage and tests"`
- [ ] Push branch: `git push -u origin feat/centralize-fetch`

## Code Quality

- [ ] Code compiles and app runs locally
- [ ] ESLint and Prettier applied: `npx eslint . --fix && npx prettier --write .`
- [ ] No remaining axios imports in client/src directory
- [ ] All files follow project coding standards

## Testing

- [ ] All unit tests pass: `npm test`
- [ ] Playwright tests pass locally: `npx playwright test`
- [ ] Manual QA validation completed:
  - [ ] DevTestPage renders when REACT_APP_SHOW_DEV_TEST=true
  - [ ] "Run Extract Metadata" button works correctly
  - [ ] "Run Web Search" button works correctly
  - [ ] Toast deduplication works (no duplicate error toasts)
  - [ ] DebugChips render when QA features are enabled
  - [ ] DebugChips are hidden when QA features are disabled

## Dependencies

- [ ] axios removed from package.json if no other imports remain
- [ ] Verify no other components depend on axios
- [ ] All new dependencies properly documented

## Documentation

- [ ] README updated with any new features
- [ ] Code comments added/updated where necessary
- [ ] API documentation updated if applicable

## Review Process

- [ ] Add PR reviewers
- [ ] Link to this summary and checklist
- [ ] Ensure all CI checks pass
- [ ] Address all review comments