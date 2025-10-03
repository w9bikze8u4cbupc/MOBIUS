# Tutorial Visibility PR Creation Guide

## PR Details

**Title:** Add REACT_APP_SHOW_TUTORIAL env helper, docs, tests, and CI

**Branch:** feat/tutorial-visibility

**Base:** main

## PR Body

# Add REACT_APP_SHOW_TUTORIAL env helper, docs, tests, and CI

## Summary

Centralized env helper to parse REACT_APP_SHOW_TUTORIAL and REACT_APP_DEBUG_TUTORIAL.
TutorialOrchestrator now uses helper to show/hide tutorial UI; debug logging gated to NODE_ENV === 'development' && REACT_APP_DEBUG_TUTORIAL === true.
Added documentation, smoke tests, monitoring & rollback docs, reviewer guidance, and PR creation scripts.

## Files added (high level)

- TUTORIAL_VISIBILITY_SQUASH_COMMIT_MSG.txt
- TUTORIAL_VISIBILITY_RELEASE_NOTE.md
- TUTORIAL_VISIBILITY_POST_MERGE_COMMANDS.md
- TUTORIAL_VISIBILITY_SMOKE_TEST.md
- TUTORIAL_VISIBILITY_MONITORING.md
- TUTORIAL_VISIBILITY_ROLLBACK.md
- TUTORIAL_VISIBILITY_REVIEWER_GUIDANCE.md
- CREATE_TUTORIAL_VISIBILITY_PR.{sh,bat}
- TUTORIAL_VISIBILITY_FINAL_SUMMARY.md
- .github/workflows/tutorial-visibility-ci.yml
- client/src/utils/env.js (+ tests)
- client/src/components/TutorialOrchestrator.jsx (+ tests)
- client/.env.example

## Testing & CI expectations

CI must run: lint (--max-warnings=0), jest tests, production build.
Local pre-merge validation: `npm ci && npm run lint -- --max-warnings=0 && npm test && npm run build`

## Smoke-test (staging)

- Verify tutorial hidden by default (REACT_APP_SHOW_TUTORIAL unset)
- Verify tutorial visible when REACT_APP_SHOW_TUTORIAL=true
- Confirm no debug logs in production even if REACT_APP_DEBUG_TUTORIAL=true

## Rollback plan

See TUTORIAL_VISIBILITY_ROLLBACK.md

## Important runtime note

Do not enable REACT_APP_DEBUG_TUTORIAL in staging/production — debug logging is only intended for development (NODE_ENV === 'development').

## Suggested Labels

- feature
- docs
- ci

## Suggested Reviewers

- 1 frontend engineer
- 1 QA/infra reviewer

## GitHub CLI Command (if installed)

```bash
gh pr create \
  --title "Add REACT_APP_SHOW_TUTORIAL env helper, docs, tests, and CI" \
  --body-file TUTORIAL_VISIBILITY_PR_BODY.md \
  --base main \
  --head feat/tutorial-visibility \
  --label "feature" \
  --reviewer "frontend-username" --reviewer "qa-username"
```

## Manual PR Creation Steps

1. Go to the repository on GitHub
2. Click on "Pull Requests" tab
3. Click "New Pull Request"
4. Set base to `main` and compare to `feat/tutorial-visibility`
5. Copy the title and body content above
6. Add the suggested labels
7. Assign the suggested reviewers
8. Click "Create Pull Request"

## Post-PR Checklist

1. Wait for CI to run
2. If any step fails, copy the failing job logs for troubleshooting
3. Once CI is green, request reviews
4. After approvals, squash-and-merge
5. After merge:
   - Run post-merge commands: see TUTORIAL_VISIBILITY_POST_MERGE_COMMANDS.md
   - Execute smoke tests in staging per TUTORIAL_VISIBILITY_SMOKE_TEST.md
   - Monitor for 24–72 hours per TUTORIAL_VISIBILITY_MONITORING.md
