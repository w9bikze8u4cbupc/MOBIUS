#!/bin/bash
# Branch Protection Setup for MOBIUS Repository
# Usage: ./setup-branch-protection.sh [OWNER/REPO] [BRANCH]
# Example: ./setup-branch-protection.sh w9bikze8u4cbupc/MOBIUS main

set -e

# Configuration
OWNER_REPO="${1:-w9bikze8u4cbupc/MOBIUS}"
BRANCH="${2:-main}"
REQUIRED_CHECKS=(
  "build-and-qa (ubuntu-latest)"
  "build-and-qa (macos-latest)"
  "build-and-qa (windows-latest)"
  "check (ubuntu-latest)"
  "check (macos-latest)"
  "check (windows-latest)"
)

echo "🔒 Setting up branch protection for ${OWNER_REPO}:${BRANCH}"

# Single command to set up comprehensive branch protection
gh api repos/${OWNER_REPO}/branches/${BRANCH}/protection \
  --method PUT \
  --raw-field required_status_checks='{
    "strict": true,
    "contexts": [
      "build-and-qa (ubuntu-latest)",
      "build-and-qa (macos-latest)", 
      "build-and-qa (windows-latest)",
      "check (ubuntu-latest)",
      "check (macos-latest)",
      "check (windows-latest)"
    ]
  }' \
  --raw-field enforce_admins='true' \
  --raw-field required_pull_request_reviews='{
    "required_approving_review_count": 1,
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": true,
    "require_last_push_approval": false
  }' \
  --raw-field restrictions='null' \
  --raw-field required_linear_history='false' \
  --raw-field allow_force_pushes='false' \
  --raw-field allow_deletions='false' \
  --raw-field block_creations='false' \
  --raw-field required_conversation_resolution='true' \
  --raw-field lock_branch='false' \
  --raw-field allow_fork_syncing='true'

echo "✅ Branch protection configured successfully!"
echo ""
echo "📋 Protection Summary:"
echo "  • Branch: ${BRANCH}"
echo "  • Required status checks: YES (strict)"
echo "  • Required reviews: 1 (with code owner approval)"
echo "  • Dismiss stale reviews: YES"
echo "  • Admin enforcement: YES"
echo "  • Linear history: NO"
echo "  • Force push: BLOCKED"
echo "  • Branch deletion: BLOCKED"
echo "  • Conversation resolution: REQUIRED"
echo ""
echo "🔍 Required Checks:"
for check in "${REQUIRED_CHECKS[@]}"; do
  echo "  • ${check}"
done
echo ""
echo "To verify: gh api repos/${OWNER_REPO}/branches/${BRANCH}/protection"