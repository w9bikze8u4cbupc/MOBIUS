#!/bin/bash
# Bash script to set GitHub token and verify access

# Default values
OWNER="w9bikze8u4cbupc"
REPO="MOBIUS"

echo "=== GitHub Token Verification ==="
echo ""

# Check if token was provided as argument
if [ $# -ge 1 ]; then
    export GITHUB_TOKEN="$1"
    echo "Token set from argument"
elif [ -z "$GITHUB_TOKEN" ]; then
    echo "GitHub token not found in environment."
    echo -n "Enter your GitHub Personal Access Token (or press Enter to skip): "
    read -r token_input
    if [ -n "$token_input" ]; then
        export GITHUB_TOKEN="$token_input"
        echo "Token set successfully!"
    else
        echo "No token provided. Exiting."
        exit 1
    fi
else
    echo "GitHub token already set in environment."
fi

# Set repository variables
export OWNER="$OWNER"
export REPO="$REPO"
echo "Repository variables set:"
echo "  OWNER: $OWNER"
echo "  REPO: $REPO"
echo ""

# Verify token
echo "Verifying token..."
if response=$(curl -sS -H "Authorization: token $GITHUB_TOKEN" -H "Accept: application/vnd.github+json" https://api.github.com/user 2>&1); then
    login=$(echo "$response" | jq -r '.login')
    echo "✓ Token verified successfully! User: $login"
else
    echo "✗ Token verification failed: $response"
    echo "Please check your token and try again."
    exit 1
fi
echo ""

# Check repository access
echo "Checking repository access..."
if repo_response=$(curl -sS -H "Authorization: token $GITHUB_TOKEN" -H "Accept: application/vnd.github+json" https://api.github.com/repos/$OWNER/$REPO 2>&1); then
    repo_name=$(echo "$repo_response" | jq -r '.name')
    repo_private=$(echo "$repo_response" | jq -r '.private')
    echo "✓ Repository access verified! Repo: $repo_name"
    echo "  Private: $repo_private"
else
    echo "✗ Repository access check failed: $repo_response"
    exit 1
fi
echo ""

# Check if branches exist
echo "Checking if required branches exist..."
branches=("phase-f/preview-image-matcher" "ci/add-phase-f-verify-workflow")
for branch in "${branches[@]}"; do
    if branch_response=$(curl -sS -H "Authorization: token $GITHUB_TOKEN" -H "Accept: application/vnd.github+json" https://api.github.com/repos/$OWNER/$REPO/branches/$branch 2>&1); then
        echo "✓ Branch exists: $branch"
    else
        echo "? Branch not found: $branch (this is OK if you plan to create it)"
    fi
done
echo ""

echo "=== Verification Complete ==="
echo "Environment variables set:"
echo "  GITHUB_TOKEN: ${GITHUB_TOKEN:0:10}...${GITHUB_TOKEN: -4}"
echo "  OWNER: $OWNER"
echo "  REPO: $REPO"
echo ""
echo "You can now run the create_prs_and_issues.sh script"