# Script to create the PR for Phase F using GitHub CLI
# Run this from the repository root

# Check if gh CLI is installed
$ghInstalled = Get-Command gh -ErrorAction SilentlyContinue
if (-not $ghInstalled) {
  Write-Error "ERROR: gh CLI not found. Install and run 'gh auth login' first."
  exit 1
}

# Define variables
$BASE = if ($env:BASE_BRANCH) { $env:BASE_BRANCH } else { "staging" }
$BRANCH = "phase-f/preview-image-matcher"
$PR_BODY = "./pr_body.md"

# Check if branch exists
try {
  git rev-parse --verify $BRANCH > $null 2>&1
  if ($LASTEXITCODE -ne 0) {
    Write-Error "ERROR: branch '$BRANCH' not found locally."
    exit 1
  }
} catch {
  Write-Error "ERROR: branch '$BRANCH' not found locally."
  exit 1
}

# Checkout and pull branch
git checkout $BRANCH
git pull origin $BRANCH

# Check if PR body file exists
if (-not (Test-Path $PR_BODY)) {
  Write-Error "ERROR: PR body file '$PR_BODY' not found."
  exit 1
}

# Create the PR with GitHub CLI
gh pr create `
  --base $BASE `
  --head $BRANCH `
  --title "Phase F: Image Matcher UI + Preview backend stub" `
  --body-file $PR_BODY `
  --label "feature" `
  --label "phase-f" `
  --label "needs-review" `
  --label "ready-for-staging" `
  --reviewer "REPLACE_WITH_HANDLE_1" `
  --reviewer "REPLACE_WITH_HANDLE_2" `
  --assignee "REPLACE_WITH_HANDLE" `
  --web