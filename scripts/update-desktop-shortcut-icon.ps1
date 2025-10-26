# Script to update the Mobius Tutorial Generator desktop shortcut with a custom icon
# This script should be run after the initial shortcut is created

param(
  [string]$Name = "Mobius Tutorial Generator",
  [string]$IconPath = ""
)

# If no icon path is provided, try to use a default one
if ([string]::IsNullOrWhiteSpace($IconPath)) {
  # Check common locations for an icon file
  $possibleIconPaths = @(
    "$PSScriptRoot\..\assets\mobius-icon.ico",
    "$PSScriptRoot\..\assets\icon.ico",
    "$PSScriptRoot\..\mobius-icon.ico",
    "C:\ProgramData\Mobius\mobius-icon.ico"
  )
  
  foreach ($path in $possibleIconPaths) {
    if (Test-Path $path) {
      $IconPath = $path
      break
    }
  }
}

$desktop = [Environment]::GetFolderPath("Desktop")
$lnkPath = Join-Path $desktop ("$Name.lnk")

# Check if the shortcut exists
if (-not (Test-Path $lnkPath)) {
  Write-Error "Shortcut not found: $lnkPath"
  Write-Host "Please run 'npm run desktop:create' first to create the shortcut"
  exit 1
}

try {
  # Update the shortcut with the custom icon
  $WshShell = New-Object -ComObject WScript.Shell
  $Shortcut = $WshShell.CreateShortcut($lnkPath)
  
  # If we have an icon path, update the icon
  if (-not [string]::IsNullOrWhiteSpace($IconPath) -and (Test-Path $IconPath)) {
    $Shortcut.IconLocation = $IconPath
    $Shortcut.Save()
    Write-Output "Updated shortcut icon: $lnkPath"
    Write-Output "Icon: $IconPath"
  } else {
    Write-Output "No custom icon found. Using default Windows shortcut icon."
    Write-Output "To add a custom icon, place an .ico file in one of these locations:"
    Write-Output "  - assets/mobius-icon.ico"
    Write-Output "  - assets/icon.ico"
    Write-Output "  - mobius-icon.ico"
    Write-Output "Or run this script with -IconPath parameter pointing to your icon file"
  }
  
  Write-Output "Shortcut updated successfully: $lnkPath"
} catch {
  Write-Error "Failed to update shortcut: $($_.Exception.Message)"
  exit 1
}