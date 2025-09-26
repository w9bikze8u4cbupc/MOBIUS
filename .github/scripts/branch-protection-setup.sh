#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 2 ]; then
  echo "Usage: $0 OWNER/REPO BRANCH"
  echo "Example: $0 w9bikze8u4cbupc/MOBIUS main"
  exit 1
fi

REPO="$1"
BRANCH="$2"

echo "Setting branch protection for ${REPO} ${BRANCH}..."

gh api -X PUT /repos/${REPO}/branches/${BRANCH}/protection \
  -f required_status_checks='{"strict":true,"contexts":["CI / build-and-qa","premerge-validation","premerge-artifacts-upload"]}' \
  -f required_pull_request_reviews='{"required_approving_review_count":2}' \
  -f enforce_admins=false \
  -f restrictions=null

echo "Branch protection set for ${REPO} ${BRANCH}"
echo "Required status checks: CI / build-and-qa, premerge-validation, premerge-artifacts-upload"
echo "Required approving reviews: 2"