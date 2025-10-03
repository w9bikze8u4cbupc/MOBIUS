#!/usr/bin/env bash
set -euo pipefail

# Usage: ./CREATE_TUTORIAL_VISIBILITY_PR.sh [branch-name]
BRANCH="${1:-feat/tutorial-visibility}"
TITLE="Add REACT_APP_SHOW_TUTORIAL env helper, docs, tests, and CI"
BODY_FILE="TUTORIAL_VISIBILITY_PR_BODY.md"

echo "Ensure you are on branch: $BRANCH"
git checkout -B "$BRANCH"
git add .
git commit -m "chore(tutorial-visibility): add final PR artifacts and docs" || true
git push --set-upstream origin "$BRANCH"

if command -v gh >/dev/null 2>&1; then
  echo "Creating PR via GitHub CLI..."
  gh pr create --title "$TITLE" --body-file "$BODY_FILE" --base main --head "$BRANCH" --label "feature"
else
  echo "gh CLI not found. PR pushed to origin/$BRANCH."
  echo "Create a PR manually or install GitHub CLI: https://cli.github.com/"
fi

echo "Done."