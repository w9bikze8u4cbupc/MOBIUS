#!/bin/bash
# Script to configure branch protection rules for MOBIUS dhash production deployment
# Usage: scripts/setup_branch_protection.sh [--repo owner/repo] [--branch main]

set -euo pipefail

REPO="${1:-w9bikze8u4cbupc/MOBIUS}"
BRANCH="${2:-main}"

echo "🔒 Setting up branch protection for $REPO branch: $BRANCH"

# Required status checks from quality-gates-config.json
REQUIRED_CHECKS=(
    "CI / build-and-qa"
    "premerge-validation"
    "premerge-artifacts-upload"
)

# Build the gh command for branch protection
GH_CMD="gh api repos/$REPO/branches/$BRANCH/protection"
GH_CMD="$GH_CMD --method PUT"
GH_CMD="$GH_CMD --field required_status_checks[strict]=true"
GH_CMD="$GH_CMD --field required_status_checks[contexts][]='CI / build-and-qa'"
GH_CMD="$GH_CMD --field required_status_checks[contexts][]='premerge-validation'"
GH_CMD="$GH_CMD --field required_status_checks[contexts][]='premerge-artifacts-upload'"
GH_CMD="$GH_CMD --field required_pull_request_reviews[required_approving_review_count]=2"
GH_CMD="$GH_CMD --field required_pull_request_reviews[dismiss_stale_reviews]=true"
GH_CMD="$GH_CMD --field required_pull_request_reviews[require_code_owner_reviews]=true"
GH_CMD="$GH_CMD --field enforce_admins=false"
GH_CMD="$GH_CMD --field restrictions=null"

echo "Branch protection command to run:"
echo ""
echo "$GH_CMD"
echo ""

# Copy-ready command
echo "Copy-ready branch protection command:"
echo ""
cat << 'EOF'
gh api repos/w9bikze8u4cbupc/MOBIUS/branches/main/protection \
  --method PUT \
  --field required_status_checks[strict]=true \
  --field required_status_checks[contexts][]="CI / build-and-qa" \
  --field required_status_checks[contexts][]="premerge-validation" \
  --field required_status_checks[contexts][]="premerge-artifacts-upload" \
  --field required_pull_request_reviews[required_approving_review_count]=2 \
  --field required_pull_request_reviews[dismiss_stale_reviews]=true \
  --field required_pull_request_reviews[require_code_owner_reviews]=true \
  --field enforce_admins=false \
  --field restrictions=null
EOF

echo ""
echo "✅ Branch protection configuration ready"
echo ""
echo "To apply the configuration:"
echo "1. Ensure you have GitHub CLI installed and authenticated"
echo "2. Copy and run the command above"
echo "3. Verify protection settings in GitHub repository settings"