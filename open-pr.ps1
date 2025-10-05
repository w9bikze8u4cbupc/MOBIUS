# Script to open the MOBIUS verification PR
# Usage: .\open-pr.ps1

Write-Host "🚀 Opening MOBIUS Verification PR" -ForegroundColor Cyan

# Check if we're in the right directory
if (-not (Test-Path "package.json")) {
  Write-Host "❌ Error: package.json not found. Please run this script from the repository root." -ForegroundColor Red
  exit 1
}

# Check if gh CLI is installed
try {
  $ghVersion = gh --version
  if ($LASTEXITCODE -ne 0) {
    throw "gh not found"
  }
} catch {
  Write-Host "❌ Error: GitHub CLI (gh) not found. Please install it first." -ForegroundColor Red
  Write-Host "   Visit: https://cli.github.com/" -ForegroundColor Yellow
  exit 1
}

# Check if we're on the correct branch
$currentBranch = git branch --show-current
if ($currentBranch -ne "feature/mobius-verification-scripts") {
  Write-Host "⚠️  Warning: You're not on the feature/mobius-verification-scripts branch." -ForegroundColor Yellow
  Write-Host "   Current branch: $currentBranch" -ForegroundColor Yellow
  $continue = Read-Host "Continue anyway? (y/N)"
  if ($continue -ne "y" -and $continue -ne "Y") {
    exit 1
  }
}

# Create the PR
Write-Host "🔄 Creating PR..." -ForegroundColor Yellow
gh pr create --base main --head feature/mobius-verification-scripts `
  --title "Add cross-platform MOBIUS verification scripts + GitHub Actions workflow" `
  --body-file MOBIUS_PR_BODY.md `
  --label "chore,ci,scripts"

if ($LASTEXITCODE -eq 0) {
  Write-Host "✅ PR created successfully!" -ForegroundColor Green
  Write-Host "   You can now add reviewers interactively:" -ForegroundColor Yellow
  Write-Host "   gh pr edit --add-reviewer @frontend-lead @backend-lead" -ForegroundColor Gray
} else {
  Write-Host "❌ Failed to create PR" -ForegroundColor Red
  exit 1
}# Script to open the MOBIUS verification PR
# Usage: .\open-pr.ps1

Write-Host "🚀 Opening MOBIUS Verification PR" -ForegroundColor Cyan

# Check if we're in the right directory
if (-not (Test-Path "package.json")) {
  Write-Host "❌ Error: package.json not found. Please run this script from the repository root." -ForegroundColor Red
  exit 1
}

# Check if gh CLI is installed
try {
  $ghVersion = gh --version
  if ($LASTEXITCODE -ne 0) {
    throw "gh not found"
  }
} catch {
  Write-Host "❌ Error: GitHub CLI (gh) not found. Please install it first." -ForegroundColor Red
  Write-Host "   Visit: https://cli.github.com/" -ForegroundColor Yellow
  exit 1
}

# Check if we're on the correct branch
$currentBranch = git branch --show-current
if ($currentBranch -ne "feature/mobius-verification-scripts") {
  Write-Host "⚠️  Warning: You're not on the feature/mobius-verification-scripts branch." -ForegroundColor Yellow
  Write-Host "   Current branch: $currentBranch" -ForegroundColor Yellow
  $continue = Read-Host "Continue anyway? (y/N)"
  if ($continue -ne "y" -and $continue -ne "Y") {
    exit 1
  }
}

# Create the PR
Write-Host "🔄 Creating PR..." -ForegroundColor Yellow
gh pr create --base main --head feature/mobius-verification-scripts `
  --title "Add cross-platform MOBIUS verification scripts + GitHub Actions workflow" `
  --body-file MOBIUS_PR_BODY.md `
  --label "chore,ci,scripts"

if ($LASTEXITCODE -eq 0) {
  Write-Host "✅ PR created successfully!" -ForegroundColor Green
  Write-Host "   You can now add reviewers interactively:" -ForegroundColor Yellow
  Write-Host "   gh pr edit --add-reviewer @frontend-lead @backend-lead" -ForegroundColor Gray
} else {
  Write-Host "❌ Failed to create PR" -ForegroundColor Red
  exit 1
}