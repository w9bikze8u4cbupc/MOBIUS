param(
  [string]$Name = "Mobius Tutorial Generator",
  [string]$Url = "http://localhost:3000",
  [string]$IconPath = ""
)

$desktop = [Environment]::GetFolderPath("Desktop")
$lnkPath = Join-Path $desktop ("$Name.lnk")

$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut($lnkPath)
$Shortcut.TargetPath = "C:\Windows\System32\cmd.exe"
$Shortcut.Arguments = "/c start `"$Url`""
if ($IconPath -ne "") { $Shortcut.IconLocation = $IconPath }
$Shortcut.WorkingDirectory = $desktop
$Shortcut.Description = $Name
$Shortcut.Save()

Write-Output "Created: $lnkPath"
# Quick verification: open it (comment out if you don't want to auto-open)
# Start-Process -FilePath $lnkPath