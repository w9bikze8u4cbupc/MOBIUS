<#
.SYNOPSIS
  Adds a minimal set of Windows Firewall rules required for Mobius bootstrap on Windows (WSL + Docker).

.DESCRIPTION
  Enforces Administrator check, creates idempotent rules, optionally runs in DryRun mode.
  Rules added:
    - Mobius API inbound TCP 5001
    - Docker Desktop inbound/outbound (program-based if detected)
    - WSL outbound HTTP (80) & HTTPS (443)
  WARNING: Use in trusted environments. Script does NOT open Docker daemon port 2375/2376.

.PARAMETER DryRun
  Show what would be done without making changes.

.EXAMPLE
  Start PowerShell as Administrator:
  .\add-firewall-rules.ps1
#>

[CmdletBinding()]
param(
  [switch]$DryRun
)

function Require-Admin {
  if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "This script requires Administrator privileges. Please run PowerShell as Administrator." -ForegroundColor Red
    exit 2
  }
}

function NewSafeRule {
  param(
    [string]$Name,
    [string]$DisplayName,
    [string]$Direction,
    [string]$Action,
    [string]$Protocol = 'TCP',
    [string]$LocalPort = '',
    [string]$RemotePort = '',
    [string]$Program = ''
  )

  $existing = Get-NetFirewallRule -DisplayName $DisplayName -ErrorAction SilentlyContinue
  if ($existing) {
    Write-Host "Rule '$DisplayName' already exists — leaving it in place." -ForegroundColor Yellow
    return
  }

  if ($DryRun) {
    Write-Host "[DryRun] Would create rule: $DisplayName ($Direction $Protocol LocalPort=$LocalPort RemotePort=$RemotePort Program=$Program)" -ForegroundColor Cyan
    return
  }

  try {
    $params = @{
      DisplayName = $DisplayName
      Direction   = $Direction
      Action      = $Action
      Profile     = 'Domain,Private,Public'
    }
    if ($Program) { $params.Program = $Program }
    if ($Protocol) { $params.Protocol = $Protocol }
    if ($LocalPort) { $params.LocalPort = $LocalPort }
    if ($RemotePort) { $params.RemotePort = $RemotePort }

    New-NetFirewallRule @params | Out-Null
    Write-Host "Created rule: $DisplayName" -ForegroundColor Green
  } catch {
    Write-Host "Failed to create rule $DisplayName: $_" -ForegroundColor Red
  }
}

# Ensure admin
Require-Admin

Write-Host "Adding Mobius firewall rules (idempotent)..." -ForegroundColor Cyan
if ($DryRun) { Write-Host "DRY RUN: No changes will be made." -ForegroundColor Yellow }

# 1) Mobius API inbound (TCP 5001)
NewSafeRule -DisplayName "Mobius API (TCP 5001) - allow inbound" -Direction Inbound -Action Allow -LocalPort 5001 -Protocol TCP

# 2) Docker Desktop program-based rules (if executable found)
$possiblePaths = @(
  "$Env:ProgramFiles\Docker\Docker\Docker Desktop.exe",
  "$Env:ProgramFiles\Docker\Docker\Docker Desktop.exe",
  "$Env:ProgramFiles(x86)\Docker\Docker\Docker Desktop.exe"
) | Where-Object { Test-Path $_ }

if ($possiblePaths.Count -gt 0) {
  foreach ($p in $possiblePaths) {
    NewSafeRule -DisplayName "Docker Desktop (allow outbound) - $p" -Direction Outbound -Action Allow -Program $p
    NewSafeRule -DisplayName "Docker Desktop (allow inbound) - $p" -Direction Inbound -Action Allow -Program $p
  }
} else {
  Write-Host "Docker Desktop executable not found in standard Program Files locations." -ForegroundColor Yellow
  Write-Host "Adding docker CLI allow rule (if docker available in PATH)..." -ForegroundColor Yellow
  $dockerCmd = (Get-Command docker -ErrorAction SilentlyContinue).Source
  if ($dockerCmd) {
    NewSafeRule -DisplayName "Docker CLI (allow outbound) - $dockerCmd" -Direction Outbound -Action Allow -Program $dockerCmd
    NewSafeRule -DisplayName "Docker CLI (allow inbound) - $dockerCmd" -Direction Inbound -Action Allow -Program $dockerCmd
  } else {
    Write-Host "docker CLI not found in PATH. Skipping Docker program rules." -ForegroundColor Yellow
  }
}

# 3) WSL outbound rules for HTTP/HTTPS (RemotePort 80,443)
NewSafeRule -DisplayName "Mobius WSL Outbound HTTP (remote 80) - allow" -Direction Outbound -Action Allow -RemotePort 80 -Protocol TCP
NewSafeRule -DisplayName "Mobius WSL Outbound HTTPS (remote 443) - allow" -Direction Outbound -Action Allow -RemotePort 443 -Protocol TCP

Write-Host ""
Write-Host "Completed. If you added rules, restart Docker Desktop and retry the bootstrap." -ForegroundColor Green
Write-Host "To roll back, run scripts/remove-firewall-rules.ps1 as Administrator."
