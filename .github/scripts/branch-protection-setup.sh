#!/bin/bash

# MOBIUS Branch Protection Setup
# Usage: ./branch-protection-setup.sh [OWNER/REPO] [BRANCH]
# Default: w9bikze8u4cbupc/MOBIUS main

REPO="${1:-w9bikze8u4cbupc/MOBIUS}"
BRANCH="${2:-main}"

echo "Setting up branch protection for ${REPO}@${BRANCH}..."

# One-liner command for GitHub CLI
gh api repos/${REPO}/branches/${BRANCH}/protection \
  --method PUT \
  --field required_status_checks='{"strict":true,"contexts":["build-and-qa (ubuntu-latest)","build-and-qa (macos-latest)","build-and-qa (windows-latest)"]}' \
  --field enforce_admins=true \
  --field required_pull_request_reviews='{"dismiss_stale_reviews":true,"require_code_owner_reviews":true,"required_approving_review_count":1}' \
  --field restrictions=null \
  --field allow_force_pushes=false \
  --field allow_deletions=false

echo "✅ Branch protection configured for ${REPO}@${BRANCH}"
echo ""
echo "Protection includes:"
echo "• Required status checks: Cross-platform CI builds (Ubuntu, macOS, Windows)"  
echo "• Required pull request reviews: 1 approving review required"
echo "• Dismiss stale reviews: Enabled"
echo "• Require code owner reviews: Enabled"
echo "• Enforce restrictions for admins: Enabled"
echo "• Force pushes: Disabled"
echo "• Branch deletions: Disabled"