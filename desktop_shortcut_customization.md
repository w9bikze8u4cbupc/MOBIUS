# Desktop Shortcut Customization

## Overview
This document explains how to customize the Mobius Tutorial Generator desktop shortcut with a custom icon, specifically the preferred green Japanese dragon icon.

## Current Status
A desktop shortcut has been created with the default Windows icon. The shortcut launches the Mobius Tutorial Generator by opening your default browser to http://localhost:3000.

## Adding a Custom Icon

### Option 1: Using the Update Script
Run the provided PowerShell script to update the shortcut with a custom icon:

```powershell
# Place your icon file in one of these locations:
# - assets/mobius-icon.ico
# - assets/icon.ico
# - mobius-icon.ico

# Then run:
powershell -ExecutionPolicy Bypass -File scripts/update-desktop-shortcut-icon.ps1
```

Or specify the icon path directly:
```powershell
powershell -ExecutionPolicy Bypass -File scripts/update-desktop-shortcut-icon.ps1 -IconPath "C:\path\to\your\dragon-icon.ico"
```

### Option 2: Manual Icon Update
1. Right-click on the "Mobius Tutorial Generator" shortcut on your desktop
2. Select "Properties"
3. In the "Shortcut" tab, click "Change Icon..."
4. Browse to your green Japanese dragon icon file (.ico format)
5. Select the icon and click "OK"
6. Click "OK" to save the changes

## Icon Requirements
- Format: .ico (Windows Icon format)
- Recommended size: 256x256 pixels for best quality
- Color: Green Japanese dragon as per user preference

## Creating an Icon
If you need to create a green Japanese dragon icon, you can:
1. Use an online icon generator
2. Convert an existing image to .ico format using online tools
3. Use graphic design software like GIMP or Photoshop to create and export as .ico

## Verification
After updating the icon:
1. Check that the shortcut on your desktop shows the green Japanese dragon
2. Double-click the shortcut to ensure it still launches the Mobius Tutorial Generator
3. Verify the icon appears correctly in different sizes (desktop, taskbar, etc.)

## Troubleshooting
- If the icon doesn't update, try refreshing the desktop (F5) or restarting Explorer
- Ensure the icon file path is correct and accessible
- Make sure the icon file is in .ico format (other formats may not work properly)

## Related Scripts
- [scripts/create-desktop-shortcut.mjs](scripts/create-desktop-shortcut.mjs) - Main cross-platform creation script
- [scripts/create-desktop-shortcut.ps1](scripts/create-desktop-shortcut.ps1) - Windows PowerShell script
- [scripts/update-desktop-shortcut-icon.ps1](scripts/update-desktop-shortcut-icon.ps1) - Custom icon update script