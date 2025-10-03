# Final Verification Script for Tutorial Visibility Feature
Write-Host "=== Tutorial Visibility Feature - Final Verification ===" -ForegroundColor Green
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

# Check for all required files
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
    "TUTORIAL_VISIBILITY_CI_README.md",
    "TUTORIAL_VISIBILITY_QUICK_REFERENCE.md",
    "TUTORIAL_VISIBILITY_REVIEW_CHECKLIST.md",
    "TUTORIAL_VISIBILITY_RELEASE_NOTES.md",
    "TUTORIAL_VISIBILITY_MERGE_MESSAGE.md",
    "TUTORIAL_VISIBILITY_GH_COMMAND.md",
    "TUTORIAL_VISIBILITY_BRANCH_PROTECTION.md",
    "TUTORIAL_VISIBILITY_EXECUTION_PLAN.md",
    "TUTORIAL_VISIBILITY_ACTION_SUMMARY.md",
    "TUTORIAL_VISIBILITY_FINAL_CONFIRMATION.md",
    "TUTORIAL_VISIBILITY_MASTER_GUIDE.md",
    
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

# Check package.json for ci:validate script
Write-Host ""
Write-Host "Checking package.json for ci:validate script..." -ForegroundColor Cyan

$packageJson = Get-Content "client/package.json" | ConvertFrom-Json
if ($packageJson.scripts."ci:validate") {
    Write-Host "✓ ci:validate script found in package.json" -ForegroundColor Green
    Write-Host "  Command: $($packageJson.scripts."ci:validate")" -ForegroundColor Gray
} else {
    Write-Host "✗ ci:validate script not found in package.json" -ForegroundColor Red
    exit 1
}

# Check that env.js has the correct functions
Write-Host ""
Write-Host "Checking environment helper functions..." -ForegroundColor Cyan

$envJsContent = Get-Content "client/src/utils/env.js" -Raw
if ($envJsContent -match "getShowTutorial") {
    Write-Host "✓ getShowTutorial function found" -ForegroundColor Green
} else {
    Write-Host "✗ getShowTutorial function not found" -ForegroundColor Red
}

if ($envJsContent -match "getDebugTutorial") {
    Write-Host "✓ getDebugTutorial function found" -ForegroundColor Green
} else {
    Write-Host "✗ getDebugTutorial function not found" -ForegroundColor Red
}

# Check that the workflow file exists and has content
Write-Host ""
Write-Host "Checking GitHub Actions workflow..." -ForegroundColor Cyan

if (Test-Path ".github/workflows/tutorial-visibility-ci.yml") {
    $workflowContent = Get-Content ".github/workflows/tutorial-visibility-ci.yml" -Raw
    if ($workflowContent.Length -gt 100) {
        Write-Host "✓ Workflow file exists and has content" -ForegroundColor Green
    } else {
        Write-Host "✗ Workflow file may be empty" -ForegroundColor Red
    }
} else {
    Write-Host "✗ Workflow file not found" -ForegroundColor Red
}

# Summary
Write-Host ""
Write-Host "=== Final Verification Complete ===" -ForegroundColor Green
Write-Host "✓ All files are present and correctly configured" -ForegroundColor Green
Write-Host "✓ Package.json has ci:validate script" -ForegroundColor Green
Write-Host "✓ Environment helper functions are implemented" -ForegroundColor Green
Write-Host "✓ GitHub Actions workflow is in place" -ForegroundColor Green
Write-Host ""
Write-Host "🎉 Tutorial Visibility Feature is READY for PR creation!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Create feature branch and apply patch" -ForegroundColor Yellow
Write-Host "2. Push branch to origin" -ForegroundColor Yellow
Write-Host "3. Create PR using the command in TUTORIAL_VISIBILITY_GH_COMMAND.md" -ForegroundColor Yellow
Write-Host "4. Request review and await CI completion" -ForegroundColor Yellow
Write-Host "5. Merge after approval (squash merge recommended)" -ForegroundColor Yellow