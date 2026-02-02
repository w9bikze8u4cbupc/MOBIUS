param(
  [string]$Name = "Mobius Tutorial Generator",
  [string]$Url = "http://localhost:3000",
  [string]$IconPath = ""
)

$desktop = [Environment]::GetFolderPath("Desktop")
# validate desktop path
if ([string]::IsNullOrWhiteSpace($desktop) -or -not (Test-Path $desktop)) {
  Write-Error "Desktop path could not be determined or does not exist: $desktop"
  exit 1
}
$lnkPath = Join-Path $desktop ("$Name.lnk")

# escape embedded double-quotes in $Url
$escapedUrl = $Url -replace '"', '\"'

# Create path to the launcher script
$launcherPath = Join-Path $PSScriptRoot "launch-mobius.bat"

$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut($lnkPath)
$Shortcut.TargetPath = $launcherPath
$Shortcut.WorkingDirectory = $desktop
$Shortcut.Description = $Name
if ($IconPath -ne "") { $Shortcut.IconLocation = $IconPath }
$Shortcut.Save()

Write-Output "Created: $lnkPath"
# Note: For preferred green Japanese dragon icon, see DESKTOP_SHORTCUT_CUSTOMIZATION.md
# Quick verification: open it (comment out if you don't want to auto-open)
# Start-Process -FilePath $lnkPath