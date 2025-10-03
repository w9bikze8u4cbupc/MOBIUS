# Quick Rollback Instructions

If the merge introduces a regression and you need to undo it quickly:

## Revert the merge commit from the main branch:

1. Identify the merge commit hash on main (e.g. MERGE_HASH)

2. Create a revert commit:

```bash
git checkout main
git pull origin main
git revert -m 1 MERGE_HASH
git push origin main
```

## Alternative approach using branch reset (more drastic):

```bash
git checkout main
git pull origin main
git reset --hard HEAD~1
git push --force-with-lease origin main
```

## After rollback:

1. Optionally open a follow-up PR with fixes
2. Communicate the rollback to the team
3. Investigate the cause of the regression
4. Plan a more careful reimplementation if needed

## Emergency environment variable fix:

If the issue is specifically with the tutorial visibility, you can temporarily hide the tutorial by setting:

```bash
REACT_APP_SHOW_TUTORIAL=false
```

in the production environment variables, then redeploy.

# Rollback instructions

1) If immediate regression, revert the merge on GitHub (revert PR) or run:
   git revert <merge-commit-sha> -m 1
   git push origin HEAD:revert/tutorial-visibility-<timestamp>

2) If deploy-only rollback needed:
   - Redeploy previous image/tag or previous artifact from CI (the last green build)

3) If rollback is not possible quickly, mitigate by:
   - Setting REACT_APP_SHOW_TUTORIAL=false in runtime config
   - Ensure REACT_APP_DEBUG_TUTORIAL is unset in production

4) After rollback, run smoke tests and reopen a PR with fix + tests.
