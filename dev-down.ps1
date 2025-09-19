param(
  [int[]]$Ports = @(3000, 5001),
  [switch]$CleanLogs
)

# =========================
# Config — edit as needed
# =========================
Set-Location $PSScriptRoot

# Use if-else instead of null-coalescing operator for compatibility
if ($env:LOG_DIR) {
    $LogDir = $env:LOG_DIR
} else {
    $LogDir = 'logs'
}

$BackendLog   = Join-Path $LogDir 'dev-backend.log'
$FrontendLog  = Join-Path $LogDir 'dev-frontend.log'
$BackendPid   = Join-Path $LogDir 'dev-backend.pid'
$FrontendPid  = Join-Path $LogDir 'dev-frontend.pid'
# =========================

$ErrorActionPreference = 'Stop'

function Log([string]$msg) {
  $t = (Get-Date).ToString('HH:mm:ss')
  Write-Host "[$t] $msg"
}

function Stop-ByPid([int[]]$ProcessIds, [switch]$Force) {
  foreach ($processId in $ProcessIds) {
    try {
      if ($Force) { Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue }
      else { Stop-Process -Id $processId -ErrorAction SilentlyContinue }
    } catch {}
  }
}

function Get-PidsByPort([int]$Port) {
  try {
    $conns = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    if ($conns) {
      return $conns | Select-Object -ExpandProperty OwningProcess | Sort-Object -Unique
    }
  } catch {}
  return @()
}

function Stop-Port([int[]]$Ports, [switch]$Force) {
  foreach ($p in $Ports) {
    $pids = Get-PidsByPort -Port $p
    if ($pids.Count -gt 0) { Stop-ByPid -ProcessIds $pids -Force:$Force }
  }
}

function Ports-AreFree([int[]]$Ports) {
  foreach ($p in $Ports) {
    if ((Get-PidsByPort -Port $p).Count -gt 0) { return $false }
  }
  return $true
}

function Stop-FromPidFiles() {
  foreach ($f in @($BackendPid, $FrontendPid)) {
    if (Test-Path $f) {
      try {
        $pid = Get-Content -Path $f -Raw
        if ($pid) { 
          Stop-ByPid -ProcessIds @([int]$pid)
        }
      } catch {
        # If we can't read the PID file, try to find processes by port
        Log "Could not read PID from $f, checking ports directly"
      }
    }
  }
}

Log "Shutting down Mobius Games Tutorial Generator…"

# Try PID files first (if dev-up wrote them)
Stop-FromPidFiles

# Graceful pass
Log "Terminating ports $($Ports -join ', ') (graceful)…"
Stop-Port -Ports $Ports

# Wait briefly
Start-Sleep -Seconds 2

# Force pass if needed
if (-not (Ports-AreFree -Ports $Ports)) {
  Log "Force killing remaining processes on ports $($Ports -join ', ')…"
  Stop-Port -Ports $Ports -Force
}

# Verify free
$max = 20
for ($i = 1; $i -le $max; $i++) {
  if (Ports-AreFree -Ports $Ports) { 
    Log "All target ports are free."
    break
  }
  Start-Sleep -Milliseconds 300
  if ($i -eq $max) {
    Log "Warning: Some ports still appear in use. Check: netstat -ano | findstr :$($Ports[0])"
  }
}

# Cleanup
if ($CleanLogs) {
  Log "Cleaning up logs and PID files…"
  foreach ($f in @($BackendLog, $FrontendLog, $BackendPid, $FrontendPid)) {
    if (Test-Path $f) { Remove-Item $f -Force -ErrorAction SilentlyContinue }
  }
} else {
  Log "Keeping logs in $LogDir (use -CleanLogs to remove)."
  foreach ($f in @($BackendPid, $FrontendPid)) {
    if (Test-Path $f) { Remove-Item $f -Force -ErrorAction SilentlyContinue }
  }
}

Log "Dev down complete."