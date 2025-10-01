#Requires -RunAsAdministrator
# Mobius Firewall Rules - Remove Script
# Admin-only removal of Mobius-specific firewall rules
# Usage: .\scripts\remove-firewall-rules.ps1 [-Force]

param(
    [switch]$Force
)

$ErrorActionPreference = "Stop"

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "Mobius Firewall Rules - Remove" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# Find all Mobius firewall rules
Write-Host "Scanning for Mobius firewall rules..." -ForegroundColor Cyan
$mobiusRules = Get-NetFirewallRule -DisplayName "Mobius*" -ErrorAction SilentlyContinue

if (-not $mobiusRules) {
    Write-Host "`nNo Mobius firewall rules found." -ForegroundColor Green
    Write-Host "Nothing to remove.`n" -ForegroundColor Green
    exit 0
}

# Display found rules
Write-Host "`nFound $($mobiusRules.Count) Mobius firewall rule(s):" -ForegroundColor Yellow
Write-Host ""

$index = 1
foreach ($rule in $mobiusRules) {
    $status = if ($rule.Enabled) { "Enabled" } else { "Disabled" }
    $statusColor = if ($rule.Enabled) { "Green" } else { "Gray" }
    
    Write-Host "  [$index] $($rule.DisplayName)" -ForegroundColor White
    Write-Host "      Status: $status" -ForegroundColor $statusColor
    Write-Host "      Direction: $($rule.Direction)" -ForegroundColor Gray
    
    # Get additional details about the rule
    $details = Get-NetFirewallRule -Name $rule.Name | Get-NetFirewallPortFilter -ErrorAction SilentlyContinue
    if ($details -and $details.LocalPort) {
        Write-Host "      Port: $($details.LocalPort)" -ForegroundColor Gray
    }
    
    $appDetails = Get-NetFirewallRule -Name $rule.Name | Get-NetFirewallApplicationFilter -ErrorAction SilentlyContinue
    if ($appDetails -and $appDetails.Program -and $appDetails.Program -ne "Any") {
        Write-Host "      Program: $($appDetails.Program)" -ForegroundColor Gray
    }
    
    Write-Host ""
    $index++
}

# Confirmation prompt (unless -Force is specified)
if (-not $Force) {
    Write-Host "Do you want to remove all these rules? (Y/N): " -ForegroundColor Yellow -NoNewline
    $response = Read-Host
    
    if ($response -ne "Y" -and $response -ne "y") {
        Write-Host "`nOperation cancelled by user." -ForegroundColor Yellow
        Write-Host "No rules were removed.`n" -ForegroundColor Yellow
        exit 0
    }
}

# Remove the rules
Write-Host "`nRemoving Mobius firewall rules..." -ForegroundColor Cyan
$removedCount = 0
$failedCount = 0

foreach ($rule in $mobiusRules) {
    try {
        Remove-NetFirewallRule -Name $rule.Name -ErrorAction Stop
        Write-Host "  Removed: $($rule.DisplayName)" -ForegroundColor Green
        $removedCount++
    } catch {
        Write-Host "  Failed to remove: $($rule.DisplayName)" -ForegroundColor Red
        Write-Host "    Error: $($_.Exception.Message)" -ForegroundColor Red
        $failedCount++
    }
}

# Summary
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "Summary" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

Write-Host "Rules removed: $removedCount" -ForegroundColor Green
if ($failedCount -gt 0) {
    Write-Host "Rules failed to remove: $failedCount" -ForegroundColor Red
}

if ($removedCount -gt 0) {
    Write-Host "`nRecommendations:" -ForegroundColor Cyan
    Write-Host "  - Restart Docker Desktop for changes to take full effect" -ForegroundColor Yellow
    Write-Host "  - If you experience connectivity issues, you can re-add rules with:" -ForegroundColor Yellow
    Write-Host "    .\scripts\add-firewall-rules.ps1" -ForegroundColor White
}

Write-Host "`nFor more information, see: scripts/FIREWALL-README.md`n" -ForegroundColor Cyan
