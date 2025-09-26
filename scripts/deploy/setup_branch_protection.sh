#!/bin/bash
# MOBIUS Branch Protection Setup Script
# Configures GitHub branch protection rules for safe deployments

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Configuration
DEFAULT_REPO="w9bikze8u4cbupc/MOBIUS"
DEFAULT_BRANCH="main"

usage() {
    echo "Usage: $0 [OPTIONS]"
    echo "Options:"
    echo "  --repo OWNER/REPO    Repository (default: $DEFAULT_REPO)"
    echo "  --branch BRANCH      Branch to protect (default: $DEFAULT_BRANCH)"
    echo "  --token TOKEN        GitHub token (or set GITHUB_TOKEN env var)"
    echo "  --dry-run            Show what would be configured without applying"
    echo "  --help               Show this help message"
    echo ""
    echo "Required GitHub CLI authentication:"
    echo "  gh auth login"
    echo "  # OR"
    echo "  export GITHUB_TOKEN='your_token_here'"
    echo ""
    echo "Examples:"
    echo "  $0 --repo myorg/myrepo --branch main"
    echo "  $0 --dry-run  # Preview changes"
    exit 1
}

# Parse arguments
REPO="${DEFAULT_REPO}"
BRANCH="${DEFAULT_BRANCH}"
GITHUB_TOKEN="${GITHUB_TOKEN:-}"
DRY_RUN=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --repo)
            REPO="$2"
            shift 2
            ;;
        --branch)
            BRANCH="$2"
            shift 2
            ;;
        --token)
            GITHUB_TOKEN="$2"
            shift 2
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --help)
            usage
            ;;
        *)
            echo "Unknown option: $1"
            usage
            ;;
    esac
done

# Check prerequisites
check_prerequisites() {
    echo "Checking prerequisites..."
    
    # Check if gh CLI is installed
    if ! command -v gh &> /dev/null; then
        echo "Error: GitHub CLI (gh) is not installed"
        echo "Install it from: https://cli.github.com/"
        exit 1
    fi
    
    # Check authentication
    if [[ -n "$GITHUB_TOKEN" ]]; then
        echo "Using provided GitHub token"
        export GITHUB_TOKEN
    elif ! gh auth status &> /dev/null; then
        echo "Error: GitHub CLI is not authenticated"
        echo "Run: gh auth login"
        exit 1
    fi
    
    # Verify repository access
    if ! gh repo view "$REPO" &> /dev/null; then
        echo "Error: Cannot access repository $REPO"
        echo "Check repository name and permissions"
        exit 1
    fi
    
    echo "✓ Prerequisites check passed"
}

# Generate branch protection configuration
generate_protection_config() {
    cat << 'EOF'
{
  "required_status_checks": {
    "strict": true,
    "contexts": [
      "CI / build-and-qa (ubuntu-latest)",
      "CI / build-and-qa (macos-latest)", 
      "CI / build-and-qa (windows-latest)",
      "Golden Preview Checks / check (ubuntu-latest)",
      "Golden Preview Checks / check (macos-latest)",
      "Golden Preview Checks / check (windows-latest)",
      "Pre-merge Validation / premerge-validation (ubuntu-latest)",
      "Pre-merge Validation / premerge-validation (macos-latest)",
      "Pre-merge Validation / premerge-validation (windows-latest)",
      "Pre-merge Validation / aggregate-results"
    ]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "required_approving_review_count": 2,
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": true,
    "require_last_push_approval": true
  },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "block_creations": false,
  "required_conversation_resolution": true
}
EOF
}

# Apply branch protection
apply_branch_protection() {
    echo "Configuring branch protection for $REPO:$BRANCH"
    
    local config_file="/tmp/branch_protection_config.json"
    generate_protection_config > "$config_file"
    
    if [[ "$DRY_RUN" == "true" ]]; then
        echo "DRY RUN: Would apply this configuration:"
        cat "$config_file" | jq '.'
        echo ""
        echo "Branch protection settings that would be applied:"
        echo "- Required status checks: $(jq -r '.required_status_checks.contexts | length' "$config_file") contexts"
        echo "- Required reviews: $(jq -r '.required_pull_request_reviews.required_approving_review_count' "$config_file")"
        echo "- Enforce for admins: $(jq -r '.enforce_admins' "$config_file")"
        echo "- Dismiss stale reviews: $(jq -r '.required_pull_request_reviews.dismiss_stale_reviews' "$config_file")"
        echo "- Require code owner reviews: $(jq -r '.required_pull_request_reviews.require_code_owner_reviews' "$config_file")"
        echo "- Block force pushes: $(jq -r '.allow_force_pushes | not' "$config_file")"
        echo "- Require conversation resolution: $(jq -r '.required_conversation_resolution' "$config_file")"
        return
    fi
    
    # Apply the configuration using GitHub API via gh CLI
    if gh api \
        --method PUT \
        "/repos/$REPO/branches/$BRANCH/protection" \
        --input "$config_file" > /dev/null; then
        echo "✓ Branch protection successfully configured"
    else
        echo "✗ Failed to configure branch protection"
        echo "This might be due to insufficient permissions or incorrect repository name"
        exit 1
    fi
    
    # Clean up temporary file
    rm -f "$config_file"
}

# Create CODEOWNERS file if it doesn't exist
create_codeowners() {
    local codeowners_file=".github/CODEOWNERS"
    
    if [[ -f "$codeowners_file" ]]; then
        echo "CODEOWNERS file already exists: $codeowners_file"
        return
    fi
    
    if [[ "$DRY_RUN" == "true" ]]; then
        echo "DRY RUN: Would create CODEOWNERS file at $codeowners_file"
        return
    fi
    
    echo "Creating CODEOWNERS file..."
    
    mkdir -p .github
    
    cat > "$codeowners_file" << 'EOF'
# MOBIUS Code Owners
# These users/teams will be automatically requested for review when files are modified

# Global owners (fallback)
* @ops

# Deployment and operations
/scripts/deploy/ @ops @sre-oncall
/docs/deployment/ @ops @sre-oncall
/.github/workflows/ @ops @sre-oncall

# Core API and backend
/src/api/ @backend-team @ops
/src/ @backend-team

# Frontend
/client/ @frontend-team

# Documentation
/README.md @eng-lead
/docs/ @eng-lead @ops

# Configuration files
package.json @ops @eng-lead
package-lock.json @ops @eng-lead
.env* @ops @sre-oncall

# CI/CD configurations  
/.github/ @ops @sre-oncall
EOF
    
    echo "✓ CODEOWNERS file created"
    echo "  Location: $codeowners_file"
    echo "  Note: Update team names to match your GitHub organization"
}

# Verify branch protection settings
verify_settings() {
    if [[ "$DRY_RUN" == "true" ]]; then
        echo "DRY RUN: Skipping verification"
        return
    fi
    
    echo "Verifying branch protection settings..."
    
    if gh api "/repos/$REPO/branches/$BRANCH/protection" > /tmp/current_protection.json 2>/dev/null; then
        echo "✓ Branch protection is active"
        
        local required_checks
        required_checks=$(jq -r '.required_status_checks.contexts | length' /tmp/current_protection.json 2>/dev/null || echo "0")
        echo "  - Required status checks: $required_checks"
        
        local required_reviews
        required_reviews=$(jq -r '.required_pull_request_reviews.required_approving_review_count' /tmp/current_protection.json 2>/dev/null || echo "0")
        echo "  - Required reviews: $required_reviews"
        
        local enforce_admins
        enforce_admins=$(jq -r '.enforce_admins.enabled' /tmp/current_protection.json 2>/dev/null || echo "false")
        echo "  - Enforce for admins: $enforce_admins"
        
        rm -f /tmp/current_protection.json
    else
        echo "✗ Failed to retrieve branch protection settings"
        exit 1
    fi
}

# Display summary
display_summary() {
    echo ""
    echo "=== BRANCH PROTECTION SETUP COMPLETE ==="
    echo "Repository: $REPO"
    echo "Branch: $BRANCH"
    echo ""
    echo "Configured protections:"
    echo "✓ Required status checks for CI workflows"
    echo "✓ Required pull request reviews (2+ approvers)"
    echo "✓ Code owner review requirements"
    echo "✓ Stale review dismissal"
    echo "✓ Admin enforcement"
    echo "✓ Force push prevention"
    echo "✓ Required conversation resolution"
    echo ""
    echo "Next steps:"
    echo "1. Update CODEOWNERS file with your actual team names"
    echo "2. Ensure all required CI workflows are set up and working"
    echo "3. Test the protection by creating a test PR"
    echo "4. Train team members on the new deployment process"
    echo ""
    echo "Deployment workflow status checks required:"
    echo "- CI / build-and-qa (ubuntu-latest, macos-latest, windows-latest)"  
    echo "- Golden Preview Checks / check (ubuntu-latest, macos-latest, windows-latest)"
    echo "- Pre-merge Validation / premerge-validation (ubuntu-latest, macos-latest, windows-latest)"
    echo "- Pre-merge Validation / aggregate-results"
}

# Main execution
main() {
    echo "=== MOBIUS BRANCH PROTECTION SETUP ==="
    echo "Repository: $REPO"
    echo "Branch: $BRANCH"
    echo "Dry run: $DRY_RUN"
    echo ""
    
    check_prerequisites
    apply_branch_protection
    create_codeowners
    verify_settings
    display_summary
    
    if [[ "$DRY_RUN" == "true" ]]; then
        echo ""
        echo "This was a dry run. To apply changes, run without --dry-run flag."
    fi
}

# Run main function
main