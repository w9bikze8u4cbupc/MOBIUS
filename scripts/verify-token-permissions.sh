#!/usr/bin/env bash
# Verify GitHub token permissions script

set -euo pipefail

if [ $# -eq 0 ]; then
    echo "Usage: $0 <github-token>"
    exit 1
fi

TOKEN="$1"
OWNER="w9bikze8u4cbupc"
REPO="mobius-games-tutorial-generator"

HEADERS=(
    -H "Authorization: Bearer ${TOKEN}"
    -H "Accept: application/vnd.github+json"
    -H "X-GitHub-Api-Version: 2022-11-28"
)

echo "Verifying GitHub token permissions..."
echo ""

# Check 1: Authenticated user
echo "1. Checking authenticated user..."
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${HEADERS[@]}" https://api.github.com/user)
if [ "$STATUS" = "200" ]; then
    USER=$(curl -s "${HEADERS[@]}" https://api.github.com/user | jq -r .login)
    echo "   Status: SUCCESS ($STATUS)" 
    echo "   User: $USER"
else
    echo "   Status: FAILED ($STATUS)"
fi

echo ""

# Check 2: Repository access
echo "2. Checking repository access..."
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${HEADERS[@]}" https://api.github.com/repos/"${OWNER}"/"${REPO}")
if [ "$STATUS" = "200" ]; then
    REPO_NAME=$(curl -s "${HEADERS[@]}" https://api.github.com/repos/"${OWNER}"/"${REPO}" | jq -r .name)
    PERMISSIONS=$(curl -s "${HEADERS[@]}" https://api.github.com/repos/"${OWNER}"/"${REPO}" | jq -r .permissions)
    echo "   Status: SUCCESS ($STATUS)"
    echo "   Repository: $REPO_NAME"
    echo "   Permissions: $PERMISSIONS"
else
    echo "   Status: FAILED ($STATUS)"
fi

echo ""

# Check 3: Branch protection (may fail if user doesn't have admin rights)
echo "3. Checking branch protection settings..."
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${HEADERS[@]}" https://api.github.com/repos/"${OWNER}"/"${REPO}"/branches/main/protection)
if [ "$STATUS" = "200" ]; then
    echo "   Status: SUCCESS ($STATUS)"
    PROTECTION=$(curl -s "${HEADERS[@]}" https://api.github.com/repos/"${OWNER}"/"${REPO}"/branches/main/protection)
    CONTEXTS=$(echo "$PROTECTION" | jq -r '.required_status_checks.contexts // [] | join(", ")')
    ENFORCE_ADMINS=$(echo "$PROTECTION" | jq -r '.enforce_admins.enabled')
    echo "   Protection enabled: Yes"
    echo "   Required status checks: $CONTEXTS"
    echo "   Enforce admins: $ENFORCE_ADMINS"
elif [ "$STATUS" = "403" ]; then
    echo "   Status: FAILED ($STATUS)"
    echo "   Message: Token may not have admin permissions - this is expected for non-admin users"
else
    echo "   Status: FAILED ($STATUS)"
fi

echo ""
echo "Verification complete."