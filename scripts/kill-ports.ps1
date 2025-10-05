Param(
  [Parameter(Mandatory=$true)][int[]]$Ports
)

foreach ($p in $Ports) {
  $conn = Get-NetTCPConnection -LocalPort $p -ErrorAction SilentlyContinue
  if ($conn) {
    foreach ($c in $conn) {
      try { Stop-Process -Id $c.OwningProcess -Force -ErrorAction Stop; Write-Host "Killed PID $($c.OwningProcess) on port $p" }
      catch { Write-Warning "Could not kill $($c.OwningProcess): $_" }
    }
  } else {
    Write-Host "No process listening on port $p"
  }
}