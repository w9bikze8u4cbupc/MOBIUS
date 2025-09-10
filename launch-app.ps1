# Requires: Windows PowerShell 5+ or PowerShell 7+
# Run policy (if blocked): Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned -Force

$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

function Require-Cmd($name) {
  if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
    Write-Host "$name is not installed or not on PATH." -ForegroundColor Red
    exit 1
  }
}

Require-Cmd node
Require-Cmd npm

function Ensure-Deps($path) {
  if (Test-Path "$path/package.json") {
    if (-not (Test-Path "$path/node_modules")) {
      Write-Host "Installing dependencies in $path ..." -ForegroundColor Cyan
      $install = if (Test-Path "$path/package-lock.json") { "ci" } else { "install" }
      Start-Process -FilePath "npm" -ArgumentList $install -WorkingDirectory $path -NoNewWindow -Wait
    }
  }
}

Ensure-Deps $PSScriptRoot
Ensure-Deps (Join-Path $PSScriptRoot "client")

# Launch dev in a new minimized console window
Start-Process -FilePath "cmd.exe" -ArgumentList '/c', 'npm run dev' -WorkingDirectory $PSScriptRoot -WindowStyle Minimized

# Wait for port 3000 then open browser
$deadline = (Get-Date).AddMinutes(2)
while ((Get-Date) -lt $deadline) {
  try {
    $c = New-Object Net.Sockets.TcpClient('127.0.0.1', 3000)
    $c.Close()
    Start-Process "http://localhost:3000"
    exit 0
  } catch {}
  Start-Sleep -Seconds 1
}
Write-Host "Timed out waiting for http://localhost:3000" -ForegroundColor Yellow