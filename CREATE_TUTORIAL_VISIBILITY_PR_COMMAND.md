# GitHub CLI Command for Tutorial Visibility PR

Use this pre-filled command to create the PR with GitHub CLI:

```bash
gh pr create \
  --title "Add REACT_APP_SHOW_TUTORIAL env helper, docs, tests, and CI" \
  --body-file TUTORIAL_VISIBILITY_PR_BODY.md \
  --base main \
  --head feat/tutorial-visibility \
  --label "feature" \
  --label "docs" \
  --label "ci" \
  --reviewer "frontend-developer" \
  --reviewer "qa-engineer"
```

## Instructions

1. Replace `frontend-developer` and `qa-engineer` with the actual GitHub usernames of your reviewers
2. Run this command from the repository root directory
3. Make sure you have GitHub CLI installed and authenticated

## Alternative Command (without specific reviewers)

If you prefer to assign reviewers later:

```bash
gh pr create \
  --title "Add REACT_APP_SHOW_TUTORIAL env helper, docs, tests, and CI" \
  --body-file TUTORIAL_VISIBILITY_PR_BODY.md \
  --base main \
  --head feat/tutorial-visibility \
  --label "feature,docs,ci"
```
