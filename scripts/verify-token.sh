#!/bin/bash
set -euo pipefail

# verify-token.sh - Verify GitHub token has required permissions for branch protection

echo "🔍 Verifying GitHub token permissions..."

# Check if GITHUB_TOKEN is set
if [ -z "${GITHUB_TOKEN:-}" ]; then
    echo "❌ GITHUB_TOKEN environment variable is not set"
    echo "   Export your GitHub token: export GITHUB_TOKEN=ghp_your_token_here"
    exit 1
fi

# Test basic API access
echo "📡 Testing basic API access..."
RATE_LIMIT=$(curl -sS -H "Authorization: token $GITHUB_TOKEN" \
    -H "Accept: application/vnd.github+json" \
    "https://api.github.com/rate_limit" | jq -r '.rate.remaining // "error"')

if [ "$RATE_LIMIT" = "error" ]; then
    echo "❌ Failed to access GitHub API - check token validity"
    exit 1
fi

echo "✅ API access successful (rate limit remaining: $RATE_LIMIT)"

# Get authenticated user info
echo "👤 Getting authenticated user info..."
USER_INFO=$(curl -sS -H "Authorization: token $GITHUB_TOKEN" \
    -H "Accept: application/vnd.github+json" \
    "https://api.github.com/user")

USERNAME=$(echo "$USER_INFO" | jq -r '.login // "unknown"')
echo "✅ Authenticated as: $USERNAME"

# Check token scopes
echo "🔐 Checking token scopes..."
SCOPES_RESPONSE=$(curl -sS -I -H "Authorization: token $GITHUB_TOKEN" \
    -H "Accept: application/vnd.github+json" \
    "https://api.github.com/user" | grep -i "x-oauth-scopes" || echo "")

if [ -n "$SCOPES_RESPONSE" ]; then
    SCOPES=$(echo "$SCOPES_RESPONSE" | cut -d: -f2- | tr -d ' \r\n')
    echo "✅ Token scopes: $SCOPES"
    
    # Check for required scopes
    if echo "$SCOPES" | grep -q "repo"; then
        echo "✅ Has 'repo' scope (includes branch protection)"
    elif echo "$SCOPES" | grep -q "public_repo"; then
        echo "⚠️  Has 'public_repo' scope (may work for public repos only)"
    else
        echo "❌ Missing required 'repo' scope for branch protection"
        echo "   Token needs 'repo' scope to modify branch protection rules"
        exit 1
    fi
else
    echo "⚠️  Could not determine token scopes (may be a fine-grained token)"
fi

# Test repository access (if OWNER and REPO are set)
if [ -n "${OWNER:-}" ] && [ -n "${REPO:-}" ]; then
    echo "🏢 Testing repository access for $OWNER/$REPO..."
    
    REPO_INFO=$(curl -sS -H "Authorization: token $GITHUB_TOKEN" \
        -H "Accept: application/vnd.github+json" \
        "https://api.github.com/repos/$OWNER/$REPO" 2>/dev/null || echo "error")
    
    if [ "$REPO_INFO" = "error" ]; then
        echo "❌ Cannot access repository $OWNER/$REPO"
        echo "   Check that the repository exists and token has access"
        exit 1
    fi
    
    REPO_PERMISSIONS=$(echo "$REPO_INFO" | jq -r '.permissions // {}')
    ADMIN_ACCESS=$(echo "$REPO_PERMISSIONS" | jq -r '.admin // false')
    
    if [ "$ADMIN_ACCESS" = "true" ]; then
        echo "✅ Has admin access to $OWNER/$REPO"
    else
        echo "❌ Missing admin access to $OWNER/$REPO"
        echo "   Admin access required to modify branch protection rules"
        exit 1
    fi
    
    # Test branch protection access
    BRANCH="${BRANCH:-main}"
    echo "🛡️  Testing branch protection access for $BRANCH..."
    
    PROTECTION_RESPONSE=$(curl -sS -H "Authorization: token $GITHUB_TOKEN" \
        -H "Accept: application/vnd.github+json" \
        "https://api.github.com/repos/$OWNER/$REPO/branches/$BRANCH/protection" 2>/dev/null || echo "error")
    
    if [ "$PROTECTION_RESPONSE" = "error" ]; then
        echo "⚠️  Branch $BRANCH may not have protection rules yet (this is OK)"
    else
        echo "✅ Can read branch protection for $BRANCH"
        echo "$PROTECTION_RESPONSE" | jq '.required_status_checks.contexts // []' > /tmp/current-contexts.json
        echo "📋 Current required contexts:"
        cat /tmp/current-contexts.json | jq -r '.[]' | sed 's/^/   - /'
    fi
else
    echo "ℹ️  Set OWNER and REPO environment variables to test repository-specific permissions"
    echo "   Example: export OWNER=myorg REPO=myrepo"
fi

echo ""
echo "🎉 Token verification complete!"
echo ""
echo "📋 Summary:"
echo "   ✅ Token is valid and has API access"
echo "   ✅ Authenticated as: $USERNAME"
if [ -n "${OWNER:-}" ] && [ -n "${REPO:-}" ]; then
    echo "   ✅ Has admin access to $OWNER/$REPO"
    echo "   ✅ Can access branch protection settings"
fi
echo ""
echo "🚀 Ready to proceed with branch protection updates!"