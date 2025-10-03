# Post-Merge Branch Cleanup & Tagging

## Commands to run locally after the PR is merged

Replace NEW_TAG with your semantic version (e.g. v1.2.0).

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

## Windows PowerShell Version:

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