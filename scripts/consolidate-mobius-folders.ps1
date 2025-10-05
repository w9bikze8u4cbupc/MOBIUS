Param(
  [string]$Dest = "$PWD\MOBIUS",
  [string[]]$Sources = @(".\old_frontend", ".\legacy", ".\backup", ".\client_backup")
)

New-Item -ItemType Directory -Path $Dest -Force | Out-Null
foreach ($s in $Sources) {
  if (Test-Path $s) {
    $target = Join-Path $Dest (Split-Path $s -Leaf)
    Write-Host "Copying $s -> $target"
    robocopy $s $target /E /NFL /NDL
  } else {
    Write-Host "Source not found: $s"
  }
}
Write-Host "Consolidation complete. Review $Dest."