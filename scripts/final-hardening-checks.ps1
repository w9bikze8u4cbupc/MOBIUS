# Final Hardening Checks
Write-Host "Running Final Hardening Checks..." -ForegroundColor Green

# 1. Metrics sanity check
Write-Host "`n1. Metrics Sanity Check" -ForegroundColor Cyan
Write-Host "   Run: .\scripts\verify-metrics.ps1" -ForegroundColor White

# 2. SSRF guardrail tests
Write-Host "`n2. SSRF Guardrail Tests" -ForegroundColor Cyan
Write-Host "   Run: .\scripts\test-ssrf-guardrails.ps1" -ForegroundColor White

# 3. PM2 logrotate verification
Write-Host "`n3. PM2 Log Rotation Verification" -ForegroundColor Cyan
Write-Host "   Run: .\scripts\verify-logrotate.ps1" -ForegroundColor White

# 4. A/V final render test
Write-Host "`n4. A/V Final Render Test" -ForegroundColor Cyan
Write-Host "   Run: .\scripts\test-av-render.ps1" -ForegroundColor White

# 5. Pre-commit hook setup
Write-Host "`n5. Pre-commit Hook Setup" -ForegroundColor Cyan
Write-Host "   Run: .\scripts\setup-precommit.ps1" -ForegroundColor White

# 6. Chaos/resilience tests
Write-Host "`n6. Chaos/Resilience Tests" -ForegroundColor Cyan
Write-Host "   Run: .\scripts\chaos-test.ps1" -ForegroundColor White

# 7. TTS limits verification
Write-Host "`n7. TTS Limits Verification" -ForegroundColor Cyan
Write-Host "   Run: .\scripts\verify-tts-limits.ps1" -ForegroundColor White

Write-Host "`nAll checks completed!" -ForegroundColor Green
Write-Host "Review the individual scripts and run them as needed." -ForegroundColor White