#!/bin/bash
# Apply Branch Protection Update Script
# This script updates GitHub branch protection with the captured check-run contexts

set -euo pipefail

# Default values
OWNER="${OWNER:-w9bikze8u4cbupc}"
REPO="${REPO:-MOBIUS}"
BRANCH="${BRANCH:-main}"
GITHUB_TOKEN="${GITHUB_TOKEN:-}"
FORCE="${FORCE:-false}"

# Captured check-run contexts from PR #161
CONTEXTS='[
  "build-and-qa (macos-latest)",
  "build-and-qa (ubuntu-latest)",
  "build-and-qa (windows-latest)",
  "Golden checks (macos-latest)",
  "Golden checks (ubuntu-latest)",
  "Golden checks (windows-latest)"
]'

# Setup
TIMESTAMP=$(date -u +%Y%m%dT%H%M%SZ)
BACKUP_DIR="branch-protection-backups/${TIMESTAMP}"
mkdir -p "$BACKUP_DIR"

echo "=== Branch Protection Update Script ==="
echo "Repository: $OWNER/$REPO"
echo "Branch: $BRANCH"
echo "Backup directory: $BACKUP_DIR"
echo ""

# Validate prerequisites
if [[ -z "$GITHUB_TOKEN" ]]; then
    echo "ERROR: GitHub token not provided. Set GITHUB_TOKEN environment variable."
    echo "Example: export GITHUB_TOKEN='ghp_your_token_here'"
    exit 1
fi

# Step 1: Optional token verification
echo "=== Step 1: Token Verification ==="
if [[ -f "scripts/verify-token.sh" ]]; then
    echo "Running token verification..."
    bash scripts/verify-token.sh
else
    echo "Token verification script not found, skipping..."
fi

# Step 2: Backup current protection
echo ""
echo "=== Step 2: Backup Current Protection ==="
echo "Fetching current branch protection settings..."

curl -sS -H "Authorization: Bearer $GITHUB_TOKEN" \
     -H "Accept: application/vnd.github+json" \
     "https://api.github.com/repos/${OWNER}/${REPO}/branches/${BRANCH}/protection" \
     | tee "${BACKUP_DIR}/${BRANCH}-before.json"

echo "Backup saved to: ${BACKUP_DIR}/${BRANCH}-before.json"

# Step 3: Build and preview payload
echo ""
echo "=== Step 3: Preview New Configuration ==="

cat <<EOF > "${BACKUP_DIR}/required-status-checks.json"
{
  "strict": true,
  "checks": [
    {"context": "build-and-qa (macos-latest)", "app_id": null},
    {"context": "build-and-qa (ubuntu-latest)", "app_id": null},
    {"context": "build-and-qa (windows-latest)", "app_id": null},
    {"context": "Golden checks (macos-latest)", "app_id": null},
    {"context": "Golden checks (ubuntu-latest)", "app_id": null},
    {"context": "Golden checks (windows-latest)", "app_id": null}
  ]
}
EOF

echo "New required status checks configuration:"
cat "${BACKUP_DIR}/required-status-checks.json"

echo ""
echo "New contexts to be enforced:"
echo "  - build-and-qa (macos-latest)"
echo "  - build-and-qa (ubuntu-latest)"
echo "  - build-and-qa (windows-latest)"
echo "  - Golden checks (macos-latest)"
echo "  - Golden checks (ubuntu-latest)"
echo "  - Golden checks (windows-latest)"

# Step 4: Confirmation and apply
echo ""
echo "=== Step 4: Apply Changes ==="

if [[ "$FORCE" != "true" ]]; then
    echo "This will update branch protection for $OWNER/$REPO branch '$BRANCH'"
    echo "All future PRs will require these 6 checks to pass before merging."
    echo ""
    read -p "Type 'apply' to proceed with the update: " CONFIRM
    
    if [[ "$CONFIRM" != "apply" ]]; then
        echo "Operation cancelled. No changes were made."
        exit 0
    fi
fi

echo "Applying branch protection update..."

curl -sS -X PATCH \
     -H "Authorization: Bearer $GITHUB_TOKEN" \
     -H "Accept: application/vnd.github+json" \
     -H "X-GitHub-Api-Version: 2022-11-28" \
     --data @"${BACKUP_DIR}/required-status-checks.json" \
     "https://api.github.com/repos/${OWNER}/${REPO}/branches/${BRANCH}/protection/required_status_checks" \
     | tee "${BACKUP_DIR}/patch-response.json"

echo "Update response saved to: ${BACKUP_DIR}/patch-response.json"

# Step 5: Verify the update
echo ""
echo "=== Step 5: Verification ==="
echo "Fetching updated branch protection settings..."

sleep 2  # Brief pause to ensure changes are propagated

curl -sS -H "Authorization: Bearer $GITHUB_TOKEN" \
     -H "Accept: application/vnd.github+json" \
     "https://api.github.com/repos/${OWNER}/${REPO}/branches/${BRANCH}/protection" \
     | tee "${BACKUP_DIR}/${BRANCH}-after.json"

echo "Post-update backup saved to: ${BACKUP_DIR}/${BRANCH}-after.json"

# Extract and verify contexts
echo ""
echo "Verification Results:"
APPLIED_CONTEXTS=$(jq -r '.required_status_checks.checks[].context' "${BACKUP_DIR}/${BRANCH}-after.json" 2>/dev/null || echo "")

if [[ -n "$APPLIED_CONTEXTS" ]]; then
    CONTEXT_COUNT=$(echo "$APPLIED_CONTEXTS" | wc -l)
    echo "Applied contexts: $CONTEXT_COUNT"
    echo ""
    echo "Current required status checks:"
    echo "$APPLIED_CONTEXTS" | sed 's/^/  - /'
    
    if [[ "$CONTEXT_COUNT" -eq 6 ]]; then
        echo ""
        echo "✅ SUCCESS: All contexts applied correctly!"
    else
        echo ""
        echo "⚠️  WARNING: Expected 6 contexts, found $CONTEXT_COUNT"
    fi
else
    echo "❌ ERROR: No required status checks found after update!"
    exit 1
fi

echo ""
echo "=== Summary ==="
echo "✅ Branch protection updated successfully"
echo "📁 All backups saved to: $BACKUP_DIR"
echo "📋 Rollback instructions: See STRICTER_PROTECTION_ROLLBACK_PLAN.md"
echo ""
echo "Next steps:"
echo "1. Monitor PR #161 until all required checks pass"
echo "2. Merge the PR to enable automatic check capture"
echo "3. Monitor for 24-72 hours for any issues"