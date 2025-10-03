# CLI Commands to Create PR

## Using GitHub CLI (gh)

If you have GitHub CLI installed, you can create the PR with these commands:

```bash
# Push the branch
git push -u origin feat/tutorial-visibility

# Create the PR
gh pr create \
  --title "Add REACT_APP_SHOW_TUTORIAL env helper, docs, and tests" \
  --body-file TUTORIAL_VISIBILITY_PR_BODY.md \
  --base main \
  --head feat/tutorial-visibility
```

## Using Standard Git Commands

If you prefer to use standard git commands:

```bash
# Push the branch
git push -u origin feat/tutorial-visibility

# Then manually create PR on GitHub with:
# Title: Add REACT_APP_SHOW_TUTORIAL env helper, docs, and tests
# Body: Contents of TUTORIAL_VISIBILITY_PR_BODY.md
```