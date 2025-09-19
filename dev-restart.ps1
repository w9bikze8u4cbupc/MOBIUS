# dev-restart.ps1 - Convenience wrapper to restart the development environment
# Usage: .\dev-restart.ps1 [-Smoke] [-CleanLogs]

function Restart-Dev {
  param(
    [switch]$Smoke,
    [switch]$CleanLogs
  )
  
  Set-Location $PSScriptRoot
  $params = @()
  if ($Smoke) { $params += "-Smoke" }
  if ($CleanLogs) { $params += "-CleanLogs" }
  
  & .\dev-down.ps1 @params
  & .\dev-up.ps1 @params
}

Restart-Dev @args