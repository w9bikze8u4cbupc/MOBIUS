#!/bin/bash
# Script to create PRs and issues using curl commands
# Set these variables before running:
# export GITHUB_TOKEN="ghp_..."  # Your GitHub Personal Access Token
# export OWNER="w9bikze8u4cbupc"  # Repository owner
# export REPO="MOBIUS"  # Repository name

# Check if required environment variables are set
if [[ -z "$GITHUB_TOKEN" ]] || [[ -z "$OWNER" ]] || [[ -z "$REPO" ]]; then
  echo "Error: Please set GITHUB_TOKEN, OWNER, and REPO environment variables"
  echo "Example:"
  echo "  export GITHUB_TOKEN=\"ghp_...\""
  echo "  export OWNER=\"w9bikze8u4cbupc\""
  echo "  export REPO=\"MOBIUS\""
  exit 1
fi

echo "Creating Feature PR..."
FEATURE_PR_RESPONSE=$(curl -s -X POST -H "Authorization: token $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  https://api.github.com/repos/$OWNER/$REPO/pulls \
  -d @pr_feature.json)

FEATURE_PR_URL=$(echo "$FEATURE_PR_RESPONSE" | jq -r '.html_url')
FEATURE_PR_NUMBER=$(echo "$FEATURE_PR_RESPONSE" | jq -r '.number')

echo "Feature PR created: $FEATURE_PR_URL"

echo "Adding reviewers to Feature PR..."
curl -s -X POST -H "Authorization: token $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  https://api.github.com/repos/$OWNER/$REPO/pulls/$FEATURE_PR_NUMBER/requested_reviewers \
  -d '{"reviewers":["developer","ops","team-lead"]}' > /dev/null

echo "Adding labels to Feature PR..."
curl -s -X POST -H "Authorization: token $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  https://api.github.com/repos/$OWNER/$REPO/issues/$FEATURE_PR_NUMBER/labels \
  -d '{"labels":["feature","phase-f","needs-review","ready-for-staging"]}' > /dev/null

echo "Creating CI Workflow PR..."
CI_PR_RESPONSE=$(curl -s -X POST -H "Authorization: token $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  https://api.github.com/repos/$OWNER/$REPO/pulls \
  -d @pr_ci.json)

CI_PR_URL=$(echo "$CI_PR_RESPONSE" | jq -r '.html_url')
CI_PR_NUMBER=$(echo "$CI_PR_RESPONSE" | jq -r '.number')

echo "CI Workflow PR created: $CI_PR_URL"

echo "Adding reviewer to CI Workflow PR..."
curl -s -X POST -H "Authorization: token $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  https://api.github.com/repos/$OWNER/$REPO/pulls/$CI_PR_NUMBER/requested_reviewers \
  -d '{"reviewers":["ops"]}' > /dev/null

echo "Adding labels to CI Workflow PR..."
curl -s -X POST -H "Authorization: token $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  https://api.github.com/repos/$OWNER/$REPO/issues/$CI_PR_NUMBER/labels \
  -d '{"labels":["ci","phase-f"]}' > /dev/null

echo "Creating Preview Worker issue..."
PREVIEW_ISSUE_RESPONSE=$(curl -s -X POST -H "Authorization: token $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  https://api.github.com/repos/$OWNER/$REPO/issues \
  -d @preview_issue.json)

PREVIEW_ISSUE_URL=$(echo "$PREVIEW_ISSUE_RESPONSE" | jq -r '.html_url')
echo "Preview Worker issue created: $PREVIEW_ISSUE_URL"

echo "Creating Asset Uploads issue..."
ASSET_ISSUE_RESPONSE=$(curl -s -X POST -H "Authorization: token $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  https://api.github.com/repos/$OWNER/$REPO/issues \
  -d @asset_issue.json)

ASSET_ISSUE_URL=$(echo "$ASSET_ISSUE_RESPONSE" | jq -r '.html_url')
echo "Asset Uploads issue created: $ASSET_ISSUE_URL"

echo "Creating Export Packaging issue..."
PACKAGING_ISSUE_RESPONSE=$(curl -s -X POST -H "Authorization: token $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  https://api.github.com/repos/$OWNER/$REPO/issues \
  -d @packaging_issue.json)

PACKAGING_ISSUE_URL=$(echo "$PACKAGING_ISSUE_RESPONSE" | jq -r '.html_url')
echo "Export Packaging issue created: $PACKAGING_ISSUE_URL"

echo ""
echo "Summary of created items:"
echo "1. Feature PR: $FEATURE_PR_URL"
echo "2. CI Workflow PR: $CI_PR_URL"
echo "3. Preview Worker issue: $PREVIEW_ISSUE_URL"
echo "4. Asset Uploads issue: $ASSET_ISSUE_URL"
echo "5. Export Packaging issue: $PACKAGING_ISSUE_URL"