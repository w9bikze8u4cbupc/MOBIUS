# PowerShell script to verify branch status for documentation quality tests

Write-Host "=== GitHub Branch Verification ===" -ForegroundColor Green
Write-Host

# Check current branch
Write-Host "Current branch:" -ForegroundColor Yellow
git branch --show-current
Write-Host

# List all test-related branches
Write-Host "Test branches:" -ForegroundColor Yellow
git branch -a | Select-String "test"
Write-Host

# Show recent commits on smoke test branch
Write-Host "Recent commits on smoke test branch:" -ForegroundColor Yellow
git log --oneline -5 test/docs-quality-smoke-test 2>$null
Write-Host

# Show recent commits on stress test branch
Write-Host "Recent commits on stress test branch:" -ForegroundColor Yellow
git log --oneline -5 test/docs-quality-stress-test 2>$null
Write-Host

# Verify remote branches exist
Write-Host "Remote branch status:" -ForegroundColor Yellow
git ls-remote --heads origin test/docs-quality-smoke-test 2>$null
git ls-remote --heads origin test/docs-quality-stress-test 2>$null
Write-Host

Write-Host "=== Verification Complete ===" -ForegroundColor Green
Write-Host
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Visit https://github.com/w9bikze8u4cbupc/MOBIUS/actions" -ForegroundColor Cyan
Write-Host "2. Check workflow runs for both branches" -ForegroundColor Cyan
Write-Host "3. Document results in GITHUB_WORKFLOW_RUN_RESULTS.md" -ForegroundColor Cyan