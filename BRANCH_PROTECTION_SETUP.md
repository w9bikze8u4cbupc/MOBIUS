# Branch Protection Setup Guide

This document provides GitHub CLI commands for automated branch protection setup with the new validation pipeline.

## Prerequisites

### Install GitHub CLI
```bash
# macOS (using Homebrew)
brew install gh

# Windows (using Chocolatey)
choco install gh

# Linux (Debian/Ubuntu)
curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null
sudo apt update
sudo apt install gh
```

### Authentication
```bash
# Login to GitHub
gh auth login

# Verify authentication
gh auth status
```

## Basic Branch Protection

### Standard Configuration
```bash
# Set repository variables (customize these)
OWNER="w9bikze8u4cbupc"
REPO="MOBIUS"
BRANCH="main"

# Enable branch protection with required status checks
gh api -X PUT /repos/$OWNER/$REPO/branches/$BRANCH/protection \
  -f required_status_checks='{"strict":true,"contexts":["CI / build-and-qa","premerge-validation"]}' \
  -f enforce_admins=true \
  -f required_pull_request_reviews='{"required_approving_review_count":2,"dismiss_stale_reviews":true,"require_code_owner_reviews":true}' \
  -f restrictions='null'
```

### Complete Protection Setup
```bash
#!/bin/bash

# Branch Protection Setup Script
# Usage: ./setup-branch-protection.sh

set -euo pipefail

# Configuration
OWNER="${GITHUB_OWNER:-w9bikze8u4cbupc}"
REPO="${GITHUB_REPO:-MOBIUS}"
BRANCH="${PROTECTED_BRANCH:-main}"

echo "Setting up branch protection for $OWNER/$REPO on branch $BRANCH"

# Step 1: Enable branch protection with comprehensive settings
echo "📋 Configuring branch protection rules..."

gh api -X PUT /repos/$OWNER/$REPO/branches/$BRANCH/protection \
  --input - <<EOF
{
  "required_status_checks": {
    "strict": true,
    "contexts": [
      "CI / build-and-qa",
      "premerge-validation / backup-and-smoke",
      "premerge-validation / deploy-test",
      "premerge-validation / validation-summary"
    ]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "required_approving_review_count": 2,
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": true,
    "require_last_push_approval": false
  },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "block_creations": false,
  "required_conversation_resolution": true
}
EOF

echo "✅ Branch protection rules configured"

# Step 2: Set up required status checks
echo "🔍 Configuring required status checks..."

# Add individual status checks (alternative method)
STATUS_CHECKS=(
  "CI / build-and-qa"
  "premerge-validation / backup-and-smoke"
  "premerge-validation / deploy-test"
  "premerge-validation / validation-summary"
)

for check in "${STATUS_CHECKS[@]}"; do
  echo "  - Adding required check: $check"
done

echo "✅ Required status checks configured"

# Step 3: Configure repository settings
echo "⚙️  Configuring repository settings..."

gh api -X PATCH /repos/$OWNER/$REPO \
  --input - <<EOF
{
  "allow_squash_merge": true,
  "allow_merge_commit": true,
  "allow_rebase_merge": false,
  "delete_branch_on_merge": true,
  "allow_auto_merge": false,
  "allow_update_branch": true
}
EOF

echo "✅ Repository settings configured"

# Step 4: Verify configuration
echo "🔬 Verifying branch protection..."

PROTECTION_STATUS=$(gh api /repos/$OWNER/$REPO/branches/$BRANCH/protection --jq '.required_status_checks.contexts | length')

if [ "$PROTECTION_STATUS" -gt 0 ]; then
    echo "✅ Branch protection successfully configured"
    echo "   Required status checks: $PROTECTION_STATUS"
else
    echo "❌ Branch protection configuration failed"
    exit 1
fi

echo "🎉 Branch protection setup completed successfully!"
```

## Advanced Configuration

### Environment-Specific Protection
```bash
# Production branch (stricter rules)
gh api -X PUT /repos/$OWNER/$REPO/branches/production/protection \
  --input - <<EOF
{
  "required_status_checks": {
    "strict": true,
    "contexts": [
      "CI / build-and-qa",
      "premerge-validation / backup-and-smoke",
      "premerge-validation / deploy-test",
      "premerge-validation / validation-summary",
      "security-scan",
      "performance-test"
    ]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": {
    "required_approving_review_count": 3,
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": true,
    "require_last_push_approval": true
  },
  "restrictions": {
    "users": ["tech-lead", "devops-lead"],
    "teams": ["maintainers"]
  }
}
EOF
```

### Hotfix Branch Exception
```bash
# Allow emergency hotfixes with reduced requirements
gh api -X PUT /repos/$OWNER/$REPO/branches/hotfix/protection \
  --input - <<EOF
{
  "required_status_checks": {
    "strict": false,
    "contexts": [
      "CI / build-and-qa"
    ]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": {
    "required_approving_review_count": 1,
    "dismiss_stale_reviews": false,
    "require_code_owner_reviews": true
  },
  "restrictions": {
    "teams": ["maintainers", "on-call"]
  }
}
EOF
```

## Status Check Management

### Add New Status Check
```bash
# Add a new required status check
gh api -X PATCH /repos/$OWNER/$REPO/branches/$BRANCH/protection/required_status_checks \
  -f contexts='["CI / build-and-qa","premerge-validation","new-check-name"]' \
  -f strict=true
```

### Remove Status Check
```bash
# Remove a status check
gh api -X PATCH /repos/$OWNER/$REPO/branches/$BRANCH/protection/required_status_checks \
  -f contexts='["CI / build-and-qa","premerge-validation"]' \
  -f strict=true
```

### List Current Status Checks
```bash
# View current protection settings
gh api /repos/$OWNER/$REPO/branches/$BRANCH/protection \
  --jq '.required_status_checks.contexts[]'
```

## Troubleshooting

### Common Issues

**Error: "Branch protection rule not found"**
- Ensure branch exists and has at least one commit
- Verify repository permissions (admin access required)

**Error: "Required status check failed"**
- Check workflow names match exactly
- Ensure workflows run on pull requests
- Verify workflow job names are correct

**Error: "Insufficient permissions"**
- Ensure GitHub token has `repo` scope
- Verify admin access to repository
- Check organization settings for branch protection

### Verification Commands
```bash
# Check branch protection status
gh api /repos/$OWNER/$REPO/branches/$BRANCH/protection

# List all protected branches
gh api /repos/$OWNER/$REPO/branches --jq '.[] | select(.protected == true) | .name'

# Check specific protection rule
gh api /repos/$OWNER/$REPO/branches/$BRANCH/protection/required_status_checks
```

### Reset Branch Protection
```bash
# Remove all branch protection (emergency only)
gh api -X DELETE /repos/$OWNER/$REPO/branches/$BRANCH/protection

# Re-run setup script to restore protection
./setup-branch-protection.sh
```

## Integration with Existing Workflows

### Update Existing Status Checks
If you have existing workflows that need to be included:

```bash
# Get current workflow names
gh run list --limit 10 --json workflowName --jq '.[].workflowName | unique'

# Update protection to include existing workflows
gh api -X PATCH /repos/$OWNER/$REPO/branches/$BRANCH/protection/required_status_checks \
  -f contexts='[
    "CI / build-and-qa",
    "premerge-validation / backup-and-smoke", 
    "premerge-validation / deploy-test",
    "premerge-validation / validation-summary",
    "existing-workflow-name",
    "another-existing-check"
  ]' \
  -f strict=true
```

### Gradual Migration
For gradual migration from existing protection:

```bash
# Phase 1: Add new checks alongside existing
gh api -X PATCH /repos/$OWNER/$REPO/branches/$BRANCH/protection/required_status_checks \
  -f contexts='["old-check","new-premerge-validation"]' \
  -f strict=true

# Phase 2: Remove old checks after validation
gh api -X PATCH /repos/$OWNER/$REPO/branches/$BRANCH/protection/required_status_checks \
  -f contexts='["new-premerge-validation"]' \
  -f strict=true
```

---

*Last updated: December 2024*
*Tested with GitHub CLI v2.40.0+*