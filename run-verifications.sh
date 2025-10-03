#!/usr/bin/env bash
# Run all verification checks

set -euo pipefail

if [ $# -eq 0 ]; then
    echo "Usage: $0 <github-token>"
    echo "Please provide a GitHub token as a parameter"
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

echo "Running verification checks..."
echo "============================"
echo ""

# Check 1: Authenticated user
echo "1. Authenticated user check:"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${HEADERS[@]}" https://api.github.com/user)
echo "   Status code: $STATUS"
if [ "$STATUS" = "200" ]; then
    USER=$(curl -s "${HEADERS[@]}" https://api.github.com/user | jq -r .login)
    echo "   User: $USER"
else
    echo "   Failed to authenticate"
fi
echo ""

# Check 2: Repository access
echo "2. Repository access check:"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${HEADERS[@]}" https://api.github.com/repos/"${OWNER}"/"${REPO}")
echo "   Status code: $STATUS"
if [ "$STATUS" = "200" ]; then
    REPO_INFO=$(curl -s "${HEADERS[@]}" https://api.github.com/repos/"${OWNER}"/"${REPO}" | jq '{name: .name, private: .private, permissions: .permissions}')
    echo "   Repository info: $REPO_INFO"
else
    echo "   Failed to access repository"
fi
echo ""

# Check 3: Branch protection
echo "3. Branch protection check:"
PROTECTION_RESPONSE=$(curl -s "${HEADERS[@]}" https://api.github.com/repos/"${OWNER}"/"${REPO}"/branches/main/protection)
STATUS=$(echo "$PROTECTION_RESPONSE" | jq -e .message >/dev/null 2>&1 && echo "error" || echo "success")

if [ "$STATUS" = "success" ]; then
    echo "   Status: Success"
    echo "   Protection details (redacted sensitive info):"
    echo "$PROTECTION_RESPONSE" | jq '{
        url: .url,
        required_status_checks: .required_status_checks,
        enforce_admins: .enforce_admins,
        required_pull_request_reviews: .required_pull_request_reviews,
        restrictions: .restrictions
    }'
else
    ERROR=$(echo "$PROTECTION_RESPONSE" | jq -r .message)
    echo "   Status: Error - $ERROR"
    echo "   This is expected if the token doesn't have admin permissions"
fi
echo ""

echo "Verification checks completed."