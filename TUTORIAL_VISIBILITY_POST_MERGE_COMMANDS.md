# Post-Merge Commands

## Branch Cleanup & Tagging

Replace `NEW_TAG` with your semantic version (e.g. v1.2.0).

### Bash Version:
```bash
# Update local main and delete feature branch locally
git checkout main
git pull origin main
git branch -d feat/tutorial-visibility-ci

# Delete remote branch
git push origin --delete feat/tutorial-visibility-ci

# Create a release tag (replace NEW_TAG)
NEW_TAG=vX.Y.Z
git tag -a $NEW_TAG -m "Release $NEW_TAG — tutorial visibility feature"
git push origin $NEW_TAG
```

### PowerShell Version:
```powershell
# Update local main and delete feature branch locally
git checkout main
git pull origin main
git branch -d feat/tutorial-visibility-ci

# Delete remote branch
git push origin --delete feat/tutorial-visibility-ci

# Create a release tag (replace NEW_TAG)
$NEW_TAG="vX.Y.Z"
git tag -a $NEW_TAG -m "Release $NEW_TAG — tutorial visibility feature"
git push origin $NEW_TAG
```

## Quick Smoke-Test & Verification

### Build & serve locally to verify production bundle:
```bash
# from client directory
npm run build
npx serve -s build
```

### Verify toggles:
1. `REACT_APP_SHOW_TUTORIAL=false` → A→Z UI is hidden
2. `REACT_APP_SHOW_TUTORIAL=true` → A→Z UI is present
3. `REACT_APP_DEBUG_TUTORIAL` has no effect in production (NODE_ENV=production)
4. Browser console: ensure no diagnostic console.debug logs appear in non-dev environments

### Additional verification steps:
- Run a few flows through the app pages that previously touched the TutorialOrchestrator to confirm no runtime errors
- Verify that the tutorial feature pages load and actions work correctly
- Check that environment variable changes require a server restart to take effect

## Recommended Monitoring Checks for First 24-72 Hours

- **CI/build alerts**: Ensure no post-merge CI regressions
- **Error monitoring**: Watch for exceptions from TutorialOrchestrator or new imports
- **Client-side console logs**: Verify nothing unexpected (especially service worker caching issues)
- **Basic UX sanity**: Verify tutorial feature pages load and actions work

## Quick Rollback (if needed)

If the merge introduces a regression and you need to undo it quickly:

### Revert the merge commit from the main branch:
```bash
# Identify the merge commit hash on main (e.g. MERGE_HASH)
git checkout main
git pull origin main
git revert -m 1 MERGE_HASH
git push origin main
```

### Emergency environment variable fix:
If the issue is specifically with the tutorial visibility, you can temporarily hide the tutorial by setting:
```bash
REACT_APP_SHOW_TUTORIAL=false
```
in the production environment variables, then redeploy.