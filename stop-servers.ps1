# Mobius Games Tutorial Generator - Stop Servers
# This script helps stop the running servers

Write-Host "🛑 Stopping Mobius Games Tutorial Generator servers..." -ForegroundColor Red
Write-Host ""

# Find and stop processes running on ports 3000 and 5001
$ports = @(3000, 5001)
foreach ($p in $ports) {
  $pids = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue |
          Select-Object -ExpandProperty OwningProcess -Unique
  foreach ($pid in $pids) {
    try {
      Stop-Process -Id $pid -Force -ErrorAction Stop
      Write-Host "Killed PID $pid on port $p"
    } catch {}
  }
}

Write-Host "✅ Server shutdown process completed!" -ForegroundColor Green
Write-Host "You can now safely close this window." -ForegroundColor Cyan

Pause