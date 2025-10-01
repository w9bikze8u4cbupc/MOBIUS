<#
.SYNOPSIS
  Diagnose common network and firewall issues that block Mobius bootstrap on Windows (WSL + Docker).

.DESCRIPTION
  Tests connectivity to key endpoints (GitHub, NPM, Docker), inspects Windows Firewall profile state,
  checks for Mobius firewall rules, whether Docker Desktop is installed/running, and port 5001 usage.
  Works without Administrator privileges for read-only checks.

.EXAMPLE
  .\diagnose-network.ps1
#>

[CmdletBinding()]
param(
  [switch]$VerboseOutput
)

function Write-Ok  { param($m) Write-Host "  ✓ $m" -ForegroundColor Green }
function Write-Warn { param($m) Write-Host "  ⚠ $m" -ForegroundColor Yellow }
function Write-Err  { param($m) Write-Host "  ✗ $m" -ForegroundColor Red }

Write-Host "Mobius network & firewall diagnostic" -ForegroundColor Cyan
Write-Host "Running read-only checks (no admin required)..." -ForegroundColor DarkCyan
Write-Host ""

# 1) Basic network tests
$tests = @(
  @{ Name='GitHub (github.com:443)'; Host='github.com'; Port=443 },
  @{ Name='NPM Registry (registry.npmjs.org:443)'; Host='registry.npmjs.org'; Port=443 },
  @{ Name='Docker Registry (registry-1.docker.io:443)'; Host='registry-1.docker.io'; Port=443 }
)

foreach ($t in $tests) {
  Write-Host "Testing TCP connectivity to $($t.Name)..."
  try {
    $res = Test-NetConnection -ComputerName $t.Host -Port $t.Port -WarningAction SilentlyContinue -InformationAction SilentlyContinue
    if ($res.TcpTestSucceeded) {
      Write-Ok "TCP port $($t.Port) to $($t.Host) succeeded"
    } else {
      Write-Warn "TCP port $($t.Port) to $($t.Host) FAILED (TcpTestSucceeded=$($res.TcpTestSucceeded))"
      if ($VerboseOutput) { $res | Format-List | Out-String | Write-Host }
    }
  } catch {
    Write-Err "Error testing $($t.Host): $_"
  }
  Write-Host ""
}

# 2) DNS / HTTP quick test using curl from PowerShell (if available)
Write-Host "Testing HTTPS fetch of raw.githubusercontent.com (small payload)..."
try {
  if (Get-Command curl -ErrorAction SilentlyContinue) {
    $curlOut = curl -sS --head https://raw.githubusercontent.com/ 2>&1
    if ($LASTEXITCODE -eq 0) { Write-Ok "HTTPS head to raw.githubusercontent.com succeeded" }
    else { Write-Warn "HTTPS head to raw.githubusercontent.com failed (curl exit $LASTEXITCODE)" }
  } else {
    Write-Warn "curl not available in PATH. Skipping HTTP HEAD test from PowerShell."
  }
} catch {
  Write-Warn "HTTPS test failed: $_"
}
Write-Host ""

# 3) Firewall profile state
Write-Host "Windows Firewall profile state:"
try {
  $profiles = Get-NetFirewallProfile | Select-Object Name,Enabled
  foreach ($p in $profiles) {
    $status = if ($p.Enabled) { "Enabled" } else { "Disabled" }
    Write-Host "  - $($p.Name): $status"
  }
} catch {
  Write-Warn "Could not read firewall profiles (requires admin on some systems): $_"
}
Write-Host ""

# 4) Existing Mobius rules
Write-Host "Searching for existing Mobius firewall rules..."
try {
  $mobRules = Get-NetFirewallRule -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -like '*Mobius*' -or $_.DisplayName -like '*mobius*' }
  if ($mobRules) {
    Write-Ok "Found $( $mobRules.Count ) Mobius-related firewall rule(s):"
    $mobRules | Select-Object DisplayName,Enabled,Direction,Action | Format-Table -AutoSize
  } else {
    Write-Warn "No Mobius-specific firewall rules found."
  }
} catch {
  Write-Warn "Could not enumerate firewall rules: $_ (requires admin on some systems)"
}
Write-Host ""

# 5) Port 5001 usage
Write-Host "Checking local port 5001 usage (Mobius API):"
try {
  $portInUse = Get-NetTCPConnection -LocalPort 5001 -ErrorAction SilentlyContinue
  if ($portInUse) {
    Write-Warn "Port 5001 is in use by:"
    $portInUse | Select-Object LocalAddress,LocalPort,RemoteAddress,RemotePort,State,@{Name='PID';Expression={$_.OwningProcess}} | Format-Table -AutoSize
  } else {
    Write-Ok "Port 5001 is not in use locally."
  }
} catch {
  Write-Warn "Could not check port 5001 usage: $_"
}
Write-Host ""

# 6) Docker Desktop installed / running
Write-Host "Checking for Docker Desktop installation & running status..."
try {
  $dockerExePaths = @(
    "$Env:ProgramFiles\Docker\Docker\Docker Desktop.exe",
    "$Env:ProgramFiles\Docker\Docker\Docker Desktop.exe"
  ) | Where-Object { Test-Path $_ }

  if ($dockerExePaths) {
    Write-Ok "Docker Desktop executable found at: $($dockerExePaths -join ', ')"
  } else {
    # try registry or winget
    $dockerInstalled = (Get-Command 'docker' -ErrorAction SilentlyContinue)
    if ($dockerInstalled) {
      Write-Ok "Docker CLI available in PATH (docker)."
    } else {
      Write-Warn "Docker Desktop not found in Program Files, and docker CLI not in PATH."
    }
  }

  # test docker daemon connectivity (may fail without admin)
  $canDocker = $false
  try {
    $info = docker info 2>&1
    if ($LASTEXITCODE -eq 0) { $canDocker = $true }
  } catch { $canDocker = $false }
  if ($canDocker) { Write-Ok "Docker daemon is reachable (docker info OK)" } else { Write-Warn "Docker daemon is not reachable from this shell (docker info failed)." }
} catch {
  Write-Warn "Error checking Docker: $_"
}
Write-Host ""

Write-Host "Diagnostic complete. Recommended next steps:"
Write-Host "  - If connectivity tests failed: temporarily try disabling firewall (short test) or run add-firewall-rules.ps1 as Administrator."
Write-Host "  - If in a corporate network: ask IT to whitelist github.com, registry.npmjs.org, registry-1.docker.io and Docker registry domains (see docs)."
Write-Host ""
Write-Host "If you want, run (as Administrator) scripts/add-firewall-rules.ps1 to add safe Mobius rules, then restart Docker Desktop."
