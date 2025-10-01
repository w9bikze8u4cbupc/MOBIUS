# Mobius Firewall Rules - Remove Script
# This script removes the Windows Firewall rules that were added by add-firewall-rules.ps1
# Run this script in an elevated PowerShell (Administrator)

Write-Host "=== Removing Mobius Firewall Rules ===" -ForegroundColor Cyan
Write-Host ""

# Check if running as Administrator
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "ERROR: This script must be run as Administrator!" -ForegroundColor Red
    Write-Host "Right-click PowerShell and select 'Run as Administrator', then try again." -ForegroundColor Yellow
    exit 1
}

Write-Host "Running as Administrator ✓" -ForegroundColor Green
Write-Host ""

# List of Mobius firewall rules to remove
$mobiusRules = @(
    "Mobius API (TCP 5001) - allow inbound",
    "Docker Desktop (allow)",
    "Docker Desktop (allow inbound)",
    "WSL Allow Outbound HTTP",
    "WSL Allow Outbound HTTPS"
)

Write-Host "The following rules will be removed:" -ForegroundColor Yellow
foreach ($ruleName in $mobiusRules) {
    Write-Host "  - $ruleName" -ForegroundColor White
}
Write-Host ""

# Ask for confirmation
$confirmation = Read-Host "Are you sure you want to remove these firewall rules? (Y/N)"
if ($confirmation -notmatch '^[Yy]') {
    Write-Host "Operation cancelled." -ForegroundColor Yellow
    exit 0
}

Write-Host ""
Write-Host "Removing rules..." -ForegroundColor Green
Write-Host ""

$removedCount = 0
$notFoundCount = 0

foreach ($ruleName in $mobiusRules) {
    try {
        $rule = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
        
        if ($rule) {
            Remove-NetFirewallRule -DisplayName $ruleName -ErrorAction Stop
            Write-Host "   ✓ Removed: $ruleName" -ForegroundColor Green
            $removedCount++
        } else {
            Write-Host "   ⚠ Not found: $ruleName" -ForegroundColor Yellow
            $notFoundCount++
        }
    } catch {
        Write-Host "   ✗ Failed to remove: $ruleName" -ForegroundColor Red
        Write-Host "     Error: $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "=== Summary ===" -ForegroundColor Cyan
Write-Host "Removed: $removedCount rules" -ForegroundColor Green
if ($notFoundCount -gt 0) {
    Write-Host "Not found: $notFoundCount rules (already removed or never added)" -ForegroundColor Yellow
}
Write-Host ""
Write-Host "Firewall rules cleanup complete!" -ForegroundColor Green
Write-Host ""
