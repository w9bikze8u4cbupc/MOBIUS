#!/usr/bin/env bash
set -euo pipefail

BASE="${BASE_BRANCH:-staging}"
BRANCH="phase-f/preview-image-matcher"
PR_BODY="./pr_body.md"

if ! command -v gh >/dev/null 2>&1; then
  echo "ERROR: gh CLI not found. Install and run 'gh auth login' first." >&2
  exit 1
fi

if ! git rev-parse --verify "$BRANCH" >/dev/null 2>&1; then
  echo "ERROR: branch '$BRANCH' not found locally." >&2
  exit 1
fi

git checkout "$BRANCH"
git pull origin "$BRANCH"

if [ ! -f "$PR_BODY" ]; then
  echo "ERROR: PR body file '$PR_BODY' not found." >&2
  exit 1
fi

gh pr create \
  --base "$BASE" \
  --head "$BRANCH" \
  --title "Phase F: Image Matcher UI + Preview backend stub" \
  --body-file "$PR_BODY" \
  --label "feature" \
  --label "phase-f" \
  --label "needs-review" \
  --label "ready-for-staging" \
  --reviewer "REPLACE_WITH_HANDLE_1" \
  --reviewer "REPLACE_WITH_HANDLE_2" \
  --assignee "REPLACE_WITH_HANDLE" \
  --web || true