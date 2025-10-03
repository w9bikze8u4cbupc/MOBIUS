# Validation script for TutorialOrchestrator visibility feature
Write-Host "🔍 Validating TutorialOrchestrator visibility implementation..." -ForegroundColor Yellow

# Check if required files exist
Write-Host "📁 Checking for required files..." -ForegroundColor Yellow
$RequiredFiles = @(
  "client/src/utils/env.js"
  "client/src/utils/__tests__/env.test.js"
  "client/src/components/TutorialOrchestrator.test.jsx"
  "client/.env.example"
)

$AllFilesExist = $true
foreach ($file in $RequiredFiles) {
  if (Test-Path $file) {
    Write-Host "  ✅ $file" -ForegroundColor Green
  } else {
    Write-Host "  ❌ $file (MISSING)" -ForegroundColor Red
    $AllFilesExist = $false
  }
}

if (-not $AllFilesExist) {
  exit 1
}

# Check for README updates
Write-Host "📄 Checking README documentation..." -ForegroundColor Yellow
$ReadmeContent = Get-Content "client/README.md" -Raw
if ($ReadmeContent -match "REACT_APP_SHOW_TUTORIAL") {
  Write-Host "  ✅ README updated with REACT_APP_SHOW_TUTORIAL documentation" -ForegroundColor Green
} else {
  Write-Host "  ❌ README not updated with REACT_APP_SHOW_TUTORIAL documentation" -ForegroundColor Red
  exit 1
}

if ($ReadmeContent -match "REACT_APP_DEBUG_TUTORIAL") {
  Write-Host "  ✅ README updated with REACT_APP_DEBUG_TUTORIAL documentation" -ForegroundColor Green
} else {
  Write-Host "  ❌ README not updated with REACT_APP_DEBUG_TUTORIAL documentation" -ForegroundColor Red
  exit 1
}

# Check for env helper usage in TutorialOrchestrator
Write-Host "🔧 Checking TutorialOrchestrator.jsx for env helper usage..." -ForegroundColor Yellow
$TutorialContent = Get-Content "client/src/components/TutorialOrchestrator.jsx" -Raw
if ($TutorialContent -match "getShowTutorial") {
  Write-Host "  ✅ TutorialOrchestrator.jsx uses getShowTutorial helper" -ForegroundColor Green
} else {
  Write-Host "  ❌ TutorialOrchestrator.jsx does not use getShowTutorial helper" -ForegroundColor Red
  exit 1
}

# Check for conditional debug logging
Write-Host "🐛 Checking TutorialOrchestrator.jsx for conditional debug logging..." -ForegroundColor Yellow
if ($TutorialContent -match "REACT_APP_DEBUG_TUTORIAL") {
  Write-Host "  ✅ TutorialOrchestrator.jsx has conditional debug logging" -ForegroundColor Green
} else
  Write-Host "  ❌ TutorialOrchestrator.jsx does not have conditional debug logging" -ForegroundColor Red
  exit 1
}

# Run tests
Write-Host "🧪 Running tests..." -ForegroundColor Yellow
Set-Location client
npm test -- --watchAll=false --passWithNoTests
$TestResult = $LASTEXITCODE

if ($TestResult -eq 0) {
  Write-Host "  ✅ All tests passed" -ForegroundColor Green
} else {
  Write-Host "  ❌ Some tests failed" -ForegroundColor Red
  Set-Location ..
  exit 1
}

# Run linting
Write-Host "🧹 Running linting..." -ForegroundColor Yellow
npm run lint -- --quiet
$LintResult = $LASTEXITCODE

if ($LintResult -eq 0) {
  Write-Host "  ✅ No linting errors" -ForegroundColor Green
} else {
  Write-Host "  ❌ Linting errors found" -ForegroundColor Red
  Set-Location ..
  exit 1
}

Set-Location ..

Write-Host "🎉 All validations passed!" -ForegroundColor Green
Write-Host ""
Write-Host "To manually verify the feature:" -ForegroundColor Yellow
Write-Host "1. Start the development server: cd client && npm start" -ForegroundColor White
Write-Host "2. Edit client/.env and set REACT_APP_DEBUG_TUTORIAL=true" -ForegroundColor White
Write-Host "3. Restart the development server" -ForegroundColor White
Write-Host "4. Open the browser console and look for the diagnostic message" -ForegroundColor White
Write-Host "5. Edit client/.env and toggle REACT_APP_SHOW_TUTORIAL between true/false" -ForegroundColor White
Write-Host "6. Restart the development server and verify the tutorial shows/hides accordingly" -ForegroundColor White