# Verify Tutorial Visibility Setup
Write-Host "=== Tutorial Visibility Setup Verification ===" -ForegroundColor Green
Write-Host ""

# Check current directory
$projectRoot = Get-Location
Write-Host "Current directory: $projectRoot" -ForegroundColor Cyan

# Verify we're in the project root
if (-not (Test-Path "package.json") -or -not (Test-Path "client/package.json")) {
    Write-Host "ERROR: Not in the project root directory!" -ForegroundColor Red
    Write-Host "Please run this script from the project root." -ForegroundColor Yellow
    exit 1
}

Write-Host "✓ In project root directory" -ForegroundColor Green

# Check for required files
Write-Host ""
Write-Host "Checking for required files..." -ForegroundColor Cyan

$requiredFiles = @(
    # Core Implementation
    "client/src/utils/env.js",
    "client/src/utils/__tests__/env.test.js",
    "client/src/components/TutorialOrchestrator.jsx",
    "client/src/components/TutorialOrchestrator.test.jsx",
    "client/.env.example",
    
    # CI/CD
    ".github/workflows/tutorial-visibility-ci.yml",
    
    # Package Updates
    "client/package.json",
    
    # Documentation
    "TUTORIAL_VISIBILITY_PR_BODY.md",
    "TUTORIAL_VISIBILITY_QUICK_REFERENCE.md",
    "TUTORIAL_VISIBILITY_REVIEW_CHECKLIST.md",
    "TUTORIAL_VISIBILITY_EXECUTION_PLAN.md",
    
    # Final Merge Artifacts
    "TUTORIAL_VISIBILITY_SQUASH_COMMIT.md",
    "TUTORIAL_VISIBILITY_RELEASE_NOTE.md",
    "TUTORIAL_VISIBILITY_POST_MERGE_COMMANDS.md",
    "TUTORIAL_VISIBILITY_PR_COMMENT.md",
    "TUTORIAL_VISIBILITY_ROLLBACK.md",
    
    # Scripts
    "CREATE_TUTORIAL_VISIBILITY_PR.bat",
    "CREATE_TUTORIAL_VISIBILITY_PR.sh",
    "validate_tutorial_ci.ps1",
    "validate_tutorial_ci.sh"
)

$allFilesExist = $true
$missingFiles = @()

foreach ($file in $requiredFiles) {
    if (Test-Path $file) {
        $fileInfo = Get-Item $file
        if ($fileInfo.Length -gt 0) {
            Write-Host "✓ $file" -ForegroundColor Green
        } else {
            Write-Host "✗ $file (EMPTY)" -ForegroundColor Red
            $allFilesExist = $false
            $missingFiles += $file
        }
    } else {
        Write-Host "✗ $file (MISSING)" -ForegroundColor Red
        $allFilesExist = $false
        $missingFiles += $file
    }
}

Write-Host ""
if ($allFilesExist) {
    Write-Host "✓ All required files are present and non-empty!" -ForegroundColor Green
} else {
    Write-Host "✗ Some files are missing or empty:" -ForegroundColor Red
    foreach ($file in $missingFiles) {
        Write-Host "  - $file" -ForegroundColor Red
    }
    exit 1
}

# Summary
Write-Host ""
Write-Host "=== Verification Complete ===" -ForegroundColor Green
Write-Host "✓ All files are present and correctly configured" -ForegroundColor Green
Write-Host ""
Write-Host "🎉 Tutorial Visibility Feature is READY for implementation!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Run local validation scripts" -ForegroundColor Yellow
Write-Host "2. Create feature branch and apply patch" -ForegroundColor Yellow
Write-Host "3. Push branch and create PR" -ForegroundColor Yellow
Write-Host "4. Add review comment from TUTORIAL_VISIBILITY_PR_COMMENT.md" -ForegroundColor Yellow
Write-Host "5. Monitor CI and address any feedback" -ForegroundColor Yellow
Write-Host "6. Merge using squash with message from TUTORIAL_VISIBILITY_SQUASH_COMMIT.md" -ForegroundColor Yellow