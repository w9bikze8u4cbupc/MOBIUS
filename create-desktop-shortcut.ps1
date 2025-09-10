# Create Desktop Shortcut for Mobius Games Tutorial Generator
# This script creates a desktop shortcut for easy access to the application

# Get the current directory (where the script is located)
$currentDir = Get-Location
$currentDirPath = $currentDir.Path

# Get the desktop path
$desktopPath = [System.Environment]::GetFolderPath('Desktop')

# Define the shortcut path
$shortcutPath = Join-Path $desktopPath "Mobius Games Tutorial Generator.lnk"

# Create the shortcut
$WshShell = New-Object -comObject WScript.Shell
$shortcut = $WshShell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = "powershell.exe"
$shortcut.Arguments = "-ExecutionPolicy Bypass -File `"$currentDirPath\launch-app.ps1`""
$shortcut.WorkingDirectory = $currentDirPath
$shortcut.WindowStyle = 1
# Use the custom dragon icon
$shortcut.IconLocation = "$currentDirPath\client\public\favicon.ico, 0"
$shortcut.Description = "Mobius Games Tutorial Generator - Green Dragon Edition"
$shortcut.Save()

Write-Host "✅ Desktop shortcut created successfully!" -ForegroundColor Green
Write-Host "You can now launch the application from your desktop." -ForegroundColor Cyan
Write-Host ""
Write-Host "Shortcut location: $shortcutPath" -ForegroundColor Gray