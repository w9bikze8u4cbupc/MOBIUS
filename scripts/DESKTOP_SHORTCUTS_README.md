# Desktop Shortcuts for Mobius Tutorial Generator

This directory contains cross-platform scripts to create desktop shortcuts for easy access to the Mobius Tutorial Generator application.

## Scripts Overview

### Windows
- `create-desktop-shortcut.ps1` - Creates a .lnk shortcut on the desktop
- `verify-desktop-shortcut.ps1` - Verifies the shortcut exists

### macOS
- `create-desktop-shortcut-mac.sh` - Creates a .webloc file on the desktop
- `verify-desktop-shortcut.sh` - Verifies the shortcut exists

### Linux
- `create-desktop-shortcut-linux.sh` - Creates a .desktop file on the desktop
- `verify-desktop-shortcut.sh` - Verifies the shortcut exists

## Usage

### Creating Desktop Shortcuts

#### Windows
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\create-desktop-shortcut.ps1 -Name "Mobius" -Url "http://localhost:3000"
```

#### macOS
```bash
chmod +x scripts/create-desktop-shortcut-mac.sh
./scripts/create-desktop-shortcut-mac.sh "Mobius" "http://localhost:3000"
```

#### Linux
```bash
chmod +x scripts/create-desktop-shortcut-linux.sh
./scripts/create-desktop-shortcut-linux.sh "Mobius" "http://localhost:3000"
```

### Verifying Desktop Shortcuts

#### Windows
```powershell
.\scripts\verify-desktop-shortcut.ps1 -Name "Mobius" -Url "http://localhost:3000"
```

#### macOS/Linux
```bash
bash scripts/verify-desktop-shortcut.sh "Mobius" "http://localhost:3000"
```

## Behavior

All shortcuts will open the Mobius Tutorial Generator web interface in your default browser at http://localhost:3000.

## Customization

You can customize the name and URL by passing parameters to the scripts:

```bash
# Change the name and URL
./scripts/create-desktop-shortcut-linux.sh "My Mobius App" "http://localhost:3001"
```

## Troubleshooting

If the shortcuts don't work:
1. Ensure the Mobius Tutorial Generator is running
2. Check that the URL is correct (typically http://localhost:3000)
3. Verify the shortcut file was created on your desktop
4. Try running the verification script to diagnose issues