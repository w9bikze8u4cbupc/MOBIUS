# PowerShell script to create PRs and issues using curl commands
# Set these variables before running:
# $env:GITHUB_TOKEN="ghp_..."  # Your GitHub Personal Access Token
# $env:OWNER="w9bikze8u4cbupc"  # Repository owner
# $env:REPO="MOBIUS"  # Repository name

# Check if required environment variables are set
if (-not $env:GITHUB_TOKEN -or -not $env:OWNER -or -not $env:REPO) {
  Write-Host "Error: Please set GITHUB_TOKEN, OWNER, and REPO environment variables"
  Write-Host "Example:"
  Write-Host "  `$env:GITHUB_TOKEN=`"ghp_...`""
  Write-Host "  `$env:OWNER=`"w9bikze8u4cbupc`""
  Write-Host "  `$env:REPO=`"MOBIUS`""
  exit 1
}

Write-Host "Creating Feature PR..."
$FEATURE_PR_RESPONSE = Invoke-RestMethod -Uri "https://api.github.com/repos/$env:OWNER/$env:REPO/pulls" -Method POST -Headers @{
  "Authorization" = "token $env:GITHUB_TOKEN"
  "Accept" = "application/vnd.github+json"
} -Body (Get-Content -Path "pr_feature.json" -Raw)

$FEATURE_PR_URL = $FEATURE_PR_RESPONSE.html_url
$FEATURE_PR_NUMBER = $FEATURE_PR_RESPONSE.number

Write-Host "Feature PR created: $FEATURE_PR_URL"

Write-Host "Adding reviewers to Feature PR..."
Invoke-RestMethod -Uri "https://api.github.com/repos/$env:OWNER/$env:REPO/pulls/$FEATURE_PR_NUMBER/requested_reviewers" -Method POST -Headers @{
  "Authorization" = "token $env:GITHUB_TOKEN"
  "Accept" = "application/vnd.github+json"
} -Body '{"reviewers":["developer","ops","team-lead"]}' | Out-Null

Write-Host "Adding labels to Feature PR..."
Invoke-RestMethod -Uri "https://api.github.com/repos/$env:OWNER/$env:REPO/issues/$FEATURE_PR_NUMBER/labels" -Method POST -Headers @{
  "Authorization" = "token $env:GITHUB_TOKEN"
  "Accept" = "application/vnd.github+json"
} -Body '{"labels":["feature","phase-f","needs-review","ready-for-staging"]}' | Out-Null

Write-Host "Creating CI Workflow PR..."
$CI_PR_RESPONSE = Invoke-RestMethod -Uri "https://api.github.com/repos/$env:OWNER/$env:REPO/pulls" -Method POST -Headers @{
  "Authorization" = "token $env:GITHUB_TOKEN"
  "Accept" = "application/vnd.github+json"
} -Body (Get-Content -Path "pr_ci.json" -Raw)

$CI_PR_URL = $CI_PR_RESPONSE.html_url
$CI_PR_NUMBER = $CI_PR_RESPONSE.number

Write-Host "CI Workflow PR created: $CI_PR_URL"

Write-Host "Adding reviewer to CI Workflow PR..."
Invoke-RestMethod -Uri "https://api.github.com/repos/$env:OWNER/$env:REPO/pulls/$CI_PR_NUMBER/requested_reviewers" -Method POST -Headers @{
  "Authorization" = "token $env:GITHUB_TOKEN"
  "Accept" = "application/vnd.github+json"
} -Body '{"reviewers":["ops"]}' | Out-Null

Write-Host "Adding labels to CI Workflow PR..."
Invoke-RestMethod -Uri "https://api.github.com/repos/$env:OWNER/$env:REPO/issues/$CI_PR_NUMBER/labels" -Method POST -Headers @{
  "Authorization" = "token $env:GITHUB_TOKEN"
  "Accept" = "application/vnd.github+json"
} -Body '{"labels":["ci","phase-f"]}' | Out-Null

Write-Host "Creating Preview Worker issue..."
$PREVIEW_ISSUE_RESPONSE = Invoke-RestMethod -Uri "https://api.github.com/repos/$env:OWNER/$env:REPO/issues" -Method POST -Headers @{
  "Authorization" = "token $env:GITHUB_TOKEN"
  "Accept" = "application/vnd.github+json"
} -Body (Get-Content -Path "preview_issue.json" -Raw)

$PREVIEW_ISSUE_URL = $PREVIEW_ISSUE_RESPONSE.html_url
Write-Host "Preview Worker issue created: $PREVIEW_ISSUE_URL"

Write-Host "Creating Asset Uploads issue..."
$ASSET_ISSUE_RESPONSE = Invoke-RestMethod -Uri "https://api.github.com/repos/$env:OWNER/$env:REPO/issues" -Method POST -Headers @{
  "Authorization" = "token $env:GITHUB_TOKEN"
  "Accept" = "application/vnd.github+json"
} -Body (Get-Content -Path "asset_issue.json" -Raw)

$ASSET_ISSUE_URL = $ASSET_ISSUE_RESPONSE.html_url
Write-Host "Asset Uploads issue created: $ASSET_ISSUE_URL"

Write-Host "Creating Export Packaging issue..."
$PACKAGING_ISSUE_RESPONSE = Invoke-RestMethod -Uri "https://api.github.com/repos/$env:OWNER/$env:REPO/issues" -Method POST -Headers @{
  "Authorization" = "token $env:GITHUB_TOKEN"
  "Accept" = "application/vnd.github+json"
} -Body (Get-Content -Path "packaging_issue.json" -Raw)

$PACKAGING_ISSUE_URL = $PACKAGING_ISSUE_RESPONSE.html_url
Write-Host "Export Packaging issue created: $PACKAGING_ISSUE_URL"

Write-Host ""
Write-Host "Summary of created items:"
Write-Host "1. Feature PR: $FEATURE_PR_URL"
Write-Host "2. CI Workflow PR: $CI_PR_URL"
Write-Host "3. Preview Worker issue: $PREVIEW_ISSUE_URL"
Write-Host "4. Asset Uploads issue: $ASSET_ISSUE_URL"
Write-Host "5. Export Packaging issue: $PACKAGING_ISSUE_URL"