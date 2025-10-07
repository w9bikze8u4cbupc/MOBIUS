#!/usr/bin/env pwsh
# Cross-platform desktop shortcut verification script

param(
  [string]$Name = "Mobius Tutorial Generator",
  [string]$Url = "http://localhost:3000"
)

function Test-DesktopShortcut {
  # Check standard Desktop location
  $desktop = [Environment]::GetFolderPath("Desktop")
  $shortcutPath = Join-Path $desktop "$Name.lnk"
  
  if (Test-Path $shortcutPath) {
    Write-Output "✅ Desktop shortcut found: $shortcutPath"
    return $true
  }
  
  # Check OneDrive Desktop location if it exists
  if ($env:OneDrive) {
    $oneDriveDesktop = Join-Path $env:OneDrive "Desktop"
    $shortcutPathOneDrive = Join-Path $oneDriveDesktop "$Name.lnk"
    if (Test-Path $shortcutPathOneDrive) {
      Write-Output "✅ Desktop shortcut found: $shortcutPathOneDrive"
      return $true
    }
  }
  
  # Check USERPROFILE Desktop location if it exists
  if ($env:USERPROFILE) {
    $userProfileDesktop = Join-Path $env:USERPROFILE "Desktop"
    $shortcutPathUserProfile = Join-Path $userProfileDesktop "$Name.lnk"
    if (Test-Path $shortcutPathUserProfile) {
      Write-Output "✅ Desktop shortcut found: $shortcutPathUserProfile"
      return $true
    }
  }
  
  Write-Output "❌ Desktop shortcut not found in any checked locations"
  Write-Output "   Checked: $shortcutPath"
  if ($env:OneDrive) {
    Write-Output "   Checked: $($env:OneDrive)\Desktop\$Name.lnk"
  }
  if ($env:USERPROFILE) {
    Write-Output "   Checked: $($env:USERPROFILE)\Desktop\$Name.lnk"
  }
  return $false
}

# Main execution
Write-Output "🔍 Verifying desktop shortcut for '$Name'"
Write-Output "🔗 Expected URL: $Url"
Write-Output ""

$result = Test-DesktopShortcut
Write-Output ""
if ($result) {
  Write-Output "✅ Desktop shortcut verification PASSED"
} else {
  Write-Output "❌ Desktop shortcut verification FAILED"
  Write-Output "💡 Tip: Run create-desktop-shortcut.ps1 to create the shortcut"
}

exit (if ($result) { 0 } else { 1 })