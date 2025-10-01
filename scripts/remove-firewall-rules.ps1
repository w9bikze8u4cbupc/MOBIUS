<#
.SYNOPSIS
  Removes Mobius-specific firewall rules added by add-firewall-rules.ps1

.DESCRIPTION
  Requires Administrator. Prompts for confirmation and removes firewall rules matching known display names.
.EXAMPLE
  .\remove-firewall-rules.ps1
#>

[CmdletBinding()]
param(
  [switch]$Force
)

function Require-Admin {
  if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "This script requires Administrator privileges. Please run PowerShell as Administrator." -ForegroundColor Red
    exit 2
  }
}

Require-Admin

$knownPrefixes = @(
  "Mobius",
  "Docker Desktop (allow",
  "Docker CLI (allow",
  "Mobius API (TCP 5001)",
  "Mobius WSL Outbound HTTP",
  "Mobius WSL Outbound HTTPS"
)

Write-Host "Mobius firewall rollback tool" -ForegroundColor Cyan

$rulesToRemove = @()
foreach ($p in $knownPrefixes) {
  $found = Get-NetFirewallRule -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -like "*$p*" }
  if ($found) { $rulesToRemove += $found }
}

if (-not $rulesToRemove) {
  Write-Host "No Mobius-specific firewall rules found to remove." -ForegroundColor Yellow
  exit 0
}

Write-Host "The following rules will be removed:" -ForegroundColor Yellow
$rulesToRemove | Select-Object DisplayName,Enabled,Direction,Action | Format-Table -AutoSize

if (-not $Force) {
  $ans = Read-Host "Continue and remove these rules? Type 'yes' to confirm"
  if ($ans -ne 'yes') {
    Write-Host "Aborted by user." -ForegroundColor Yellow
    exit 1
  }
}

foreach ($r in $rulesToRemove) {
  try {
    Remove-NetFirewallRule -Name $r.Name -ErrorAction SilentlyContinue
    Write-Host "Removed: $($r.DisplayName)" -ForegroundColor Green
  } catch {
    Write-Host "Failed to remove $($r.DisplayName): $_" -ForegroundColor Red
  }
}

Write-Host "Rollback complete." -ForegroundColor Green
