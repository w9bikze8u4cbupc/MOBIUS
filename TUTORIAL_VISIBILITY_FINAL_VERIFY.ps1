# Final verification script for tutorial visibility feature

Write-Host "=== Tutorial Visibility Feature - Final Verification ===" -ForegroundColor Green
Write-Host ""

# Check that all required files exist
$requiredFiles = @(
    "TUTORIAL_VISIBILITY_SQUASH_COMMIT_MSG.txt",
    "TUTORIAL_VISIBILITY_RELEASE_NOTE.md",
    "TUTORIAL_VISIBILITY_POST_MERGE_COMMANDS.md",
    "TUTORIAL_VISIBILITY_SMOKE_TEST.md",
    "TUTORIAL_VISIBILITY_MONITORING.md",
    "TUTORIAL_VISIBILITY_ROLLBACK.md",
    "TUTORIAL_VISIBILITY_REVIEWER_GUIDANCE.md",
    "TUTORIAL_VISIBILITY_FINAL_SUMMARY.md",
    "TUTORIAL_VISIBILITY_PROJECT_DELIVERY.md",
    "CREATE_TUTORIAL_VISIBILITY_PR.bat",
    "CREATE_TUTORIAL_VISIBILITY_PR.sh"
)

Write-Host "Checking for required files..." -ForegroundColor Yellow
$allFilesExist = $true
foreach ($file in $requiredFiles) {
    if (Test-Path $file) {
        Write-Host "  [OK] $file" -ForegroundColor Green
    } else {
        Write-Host "  [MISSING] $file" -ForegroundColor Red
        $allFilesExist = $false
    }
}

Write-Host ""
if ($allFilesExist) {
    Write-Host "✅ All required files are present!" -ForegroundColor Green
} else {
    Write-Host "❌ Some required files are missing!" -ForegroundColor Red
    exit 1
}

# Check git status
Write-Host ""
Write-Host "Checking git status..." -ForegroundColor Yellow
git status --porcelain

# Check current branch
Write-Host ""
Write-Host "Checking current branch..." -ForegroundColor Yellow
$currentBranch = git rev-parse --abbrev-ref HEAD
if ($currentBranch -eq "feat/tutorial-visibility") {
    Write-Host "  [OK] Current branch is '$currentBranch'" -ForegroundColor Green
} else {
    Write-Host "  [WARN] Current branch is '$currentBranch', expected 'feat/tutorial-visibility'" -ForegroundColor Yellow
}

# Check that the branch has been pushed
Write-Host ""
Write-Host "Checking if branch has been pushed..." -ForegroundColor Yellow
try {
    $upstreamBranch = git rev-parse --abbrev-ref "@{u}" 2>$null
    if ($upstreamBranch) {
        Write-Host "  [OK] Branch is tracking '$upstreamBranch'" -ForegroundColor Green
    } else {
        Write-Host "  [WARN] Branch is not tracking an upstream branch" -ForegroundColor Yellow
    }
} catch {
    Write-Host "  [WARN] Could not determine upstream branch" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== Verification Complete ===" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Create the PR using one of these methods:" -ForegroundColor Cyan
Write-Host "   - Run CREATE_TUTORIAL_VISIBILITY_PR.bat (Windows)" -ForegroundColor Cyan
Write-Host "   - Run CREATE_TUTORIAL_VISIBILITY_PR.sh (macOS/Linux)" -ForegroundColor Cyan
Write-Host "   - Or manually create a PR on GitHub" -ForegroundColor Cyan
Write-Host "2. Paste the contents of TUTORIAL_VISIBILITY_REVIEWER_GUIDANCE.md as a PR comment" -ForegroundColor Cyan
Write-Host ""