#!/bin/bash

# Branch Protection CLI Command Generator for MOBIUS Repository
# This script generates the exact GitHub CLI command to configure branch protection

set -e

# Repository Configuration
OWNER="${1:-w9bikze8u4cbupc}"
REPO="${2:-MOBIUS}" 
BRANCH="${3:-main}"

echo "🛡️ Configuring branch protection for: ${OWNER}/${REPO}@${BRANCH}"
echo ""

# Generate the GitHub CLI command
cat << EOF
# Copy and run this command to configure branch protection:

gh api -X PUT "/repos/${OWNER}/${REPO}/branches/${BRANCH}/protection" \\
  --field required_status_checks='{
    "strict": true,
    "contexts": [
      "CI / build-and-qa",
      "premerge-validation", 
      "premerge-artifacts-upload"
    ]
  }' \\
  --field required_pull_request_reviews='{
    "required_approving_review_count": 2,
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": true
  }' \\
  --field restrictions=null \\
  --field enforce_admins=false \\
  --field allow_force_pushes=false \\
  --field allow_deletions=false

EOF

echo ""
echo "📋 What this command does:"
echo "  ✅ Requires 2 approving reviews"
echo "  ✅ Dismisses stale reviews on new commits"  
echo "  ✅ Requires code owner approval"
echo "  ✅ Blocks direct pushes (PR-only)"
echo "  ✅ Prevents force pushes"
echo "  ✅ Prevents branch deletion"
echo "  ✅ Requires these status checks:"
echo "     • CI / build-and-qa"
echo "     • premerge-validation"  
echo "     • premerge-artifacts-upload"
echo ""

# Alternative using REST API with curl (if gh CLI not available)
echo "💡 Alternative with curl (if gh CLI not available):"
echo ""
cat << EOF
curl -X PUT \\
  -H "Accept: application/vnd.github+json" \\
  -H "Authorization: Bearer \$GITHUB_TOKEN" \\
  "https://api.github.com/repos/${OWNER}/${REPO}/branches/${BRANCH}/protection" \\
  -d '{
    "required_status_checks": {
      "strict": true,
      "contexts": [
        "CI / build-and-qa",
        "premerge-validation",
        "premerge-artifacts-upload"
      ]
    },
    "required_pull_request_reviews": {
      "required_approving_review_count": 2,
      "dismiss_stale_reviews": true,
      "require_code_owner_reviews": true
    },
    "restrictions": null,
    "enforce_admins": false,
    "allow_force_pushes": false,
    "allow_deletions": false
  }'

EOF

echo ""
echo "🔑 Prerequisites:"
echo "  • GitHub CLI installed: https://cli.github.com/"
echo "  • Authenticated with repo admin permissions"
echo "  • Or set GITHUB_TOKEN environment variable for curl"
echo ""
echo "✨ Pro tip: Run 'gh auth status' to verify authentication"