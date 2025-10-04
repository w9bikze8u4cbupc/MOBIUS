#!/bin/bash
set -euo pipefail

# update-branch-protection-contexts.sh - Update branch protection required status check contexts

# Configuration - UPDATE THESE VALUES
OWNER="${OWNER:-your-org-or-user}"
REPO="${REPO:-your-repo}"
BRANCH="${BRANCH:-main}"

# NEW_CONTEXTS - Replace with exact check-run names from capture-check-runs bot comment
NEW_CONTEXTS='[
  "CI / build-and-qa (ubuntu-latest)",
  "CI / build-and-qa (macos-latest)",
  "CI / build-and-qa (windows-latest)"
]'

# Validate required environment variables
if [ -z "${GITHUB_TOKEN:-}" ]; then
    echo "❌ GITHUB_TOKEN environment variable is required"
    echo "   Export your GitHub admin token: export GITHUB_TOKEN=ghp_your_admin_token_here"
    exit 1
fi

if [ "$OWNER" = "your-org-or-user" ] || [ "$REPO" = "your-repo" ]; then
    echo "❌ Please update OWNER and REPO variables in this script"
    echo "   Current: OWNER=$OWNER, REPO=$REPO"
    exit 1
fi

echo "🔧 Branch Protection Context Update Tool"
echo "   Repository: $OWNER/$REPO"
echo "   Branch: $BRANCH"
echo ""

# Step 1: Backup current protection
echo "📦 Step 1: Backing up current branch protection..."
mkdir -p /tmp/branch-protection-backup
BACKUP_FILE="/tmp/branch-protection-backup/protection-backup-$(date +%Y%m%d-%H%M%S).json"

curl -sS -H "Authorization: token $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/$OWNER/$REPO/branches/$BRANCH/protection" \
  | jq '.' > "$BACKUP_FILE"

if [ $? -eq 0 ] && [ -s "$BACKUP_FILE" ]; then
    echo "✅ Current protection backed up to: $BACKUP_FILE"
else
    echo "⚠️  Could not backup current protection (branch may not be protected yet)"
    echo "{}" > "$BACKUP_FILE"
fi

# Step 2: Build preview JSON
echo ""
echo "🔍 Step 2: Building preview JSON..."
PREVIEW_FILE="/tmp/branch-protection-preview.json"

# Parse NEW_CONTEXTS and create the protection JSON
jq --argjson ctx "$NEW_CONTEXTS" \
  '.required_status_checks.required = (.required_status_checks.required // true) |
   .required_status_checks.strict = true |
   .required_status_checks.contexts = $ctx |
   .enforce_admins.enabled = true |
   .required_pull_request_reviews.required_approving_review_count = 1 |
   .required_pull_request_reviews.dismiss_stale_reviews = true |
   .required_pull_request_reviews.require_code_owner_reviews = false |
   .restrictions = null' \
  "$BACKUP_FILE" > "$PREVIEW_FILE"

echo "✅ Preview JSON created: $PREVIEW_FILE"
echo ""
echo "📋 Preview of changes:"
echo "   New required status check contexts:"
echo "$NEW_CONTEXTS" | jq -r '.[]' | sed 's/^/     - /'
echo ""
echo "📄 Full preview JSON:"
jq '.' "$PREVIEW_FILE"

# Step 3: Confirmation prompt
echo ""
echo "⚠️  CONFIRMATION REQUIRED"
echo "   This will update branch protection for $OWNER/$REPO branch '$BRANCH'"
echo "   The above contexts will be REQUIRED for all PRs to merge"
echo ""
read -p "   Do you want to proceed? (yes/no): " -r CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    echo "❌ Operation cancelled by user"
    echo "   Preview file saved at: $PREVIEW_FILE"
    echo "   Backup file saved at: $BACKUP_FILE"
    exit 0
fi

# Step 4: Apply the changes
echo ""
echo "🚀 Step 4: Applying branch protection changes..."
APPLY_FILE="/tmp/branch-protection-apply.json"
cp "$PREVIEW_FILE" "$APPLY_FILE"

APPLY_RESPONSE=$(curl -sS -X PUT \
  -H "Authorization: token $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  -H "Content-Type: application/json" \
  "https://api.github.com/repos/$OWNER/$REPO/branches/$BRANCH/protection" \
  --data-binary @"$APPLY_FILE")

if [ $? -eq 0 ]; then
    echo "✅ Branch protection updated successfully!"
    echo ""
    echo "📄 Applied configuration response:"
    echo "$APPLY_RESPONSE" | jq '.'
    
    # Save the response
    echo "$APPLY_RESPONSE" | jq '.' > "/tmp/branch-protection-applied-$(date +%Y%m%d-%H%M%S).json"
else
    echo "❌ Failed to apply branch protection changes"
    echo "   Response: $APPLY_RESPONSE"
    exit 1
fi

# Step 5: Verify the changes
echo ""
echo "🔍 Step 5: Verifying applied changes..."
VERIFY_RESPONSE=$(curl -sS -H "Authorization: token $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/$OWNER/$REPO/branches/$BRANCH/protection")

APPLIED_CONTEXTS=$(echo "$VERIFY_RESPONSE" | jq -r '.required_status_checks.contexts[]?' 2>/dev/null || echo "")

echo "✅ Verification complete!"
echo ""
echo "📋 Currently required status check contexts:"
if [ -n "$APPLIED_CONTEXTS" ]; then
    echo "$VERIFY_RESPONSE" | jq -r '.required_status_checks.contexts[]' | sed 's/^/   - /'
else
    echo "   (none - this may indicate an error)"
fi

echo ""
echo "📁 Files created:"
echo "   Backup: $BACKUP_FILE"
echo "   Preview: $PREVIEW_FILE"
echo "   Applied: $APPLY_FILE"
echo ""
echo "🎉 Branch protection context update complete!"
echo ""
echo "⚠️  IMPORTANT: Monitor your CI for 24-72 hours to ensure no false positives"
echo "   If issues occur, restore from backup using:"
echo "   curl -X PUT -H \"Authorization: token \$GITHUB_TOKEN\" \\"
echo "     -H \"Accept: application/vnd.github+json\" \\"
echo "     -H \"Content-Type: application/json\" \\"
echo "     \"https://api.github.com/repos/$OWNER/$REPO/branches/$BRANCH/protection\" \\"
echo "     --data-binary @\"$BACKUP_FILE\""