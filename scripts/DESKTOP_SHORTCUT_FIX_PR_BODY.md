# fix(desktop): robust shortcut verification (OneDrive Desktop support + multi-location checks)

## Summary
Add OneDrive Desktop support and multi-location detection to shortcut verification.
Parse PowerShell "Created:" output and fall back to common Desktop paths.
Improve Bash/PowerShell scripts for cross-platform behavior.

## Files
- scripts/create-desktop-shortcut.js
- scripts/verify-desktop-shortcuts.js
- scripts/verify-desktop-shortcut.ps1
- scripts/verify-desktop-shortcut.sh
- scripts/DESKTOP_SHORTCUTS_README.md (if included)

## Testing
### Windows:
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\create-desktop-shortcut.ps1 -Name "Mobius Tutorial Generator" -Url "http://localhost:3000"
node scripts/verify-desktop-shortcuts.js
```

### macOS:
```bash
./scripts/create-desktop-shortcut-mac.sh "Mobius Tutorial Generator" "http://localhost:3000"
./scripts/verify-desktop-shortcut.sh
```

### Linux:
```bash
./scripts/create-desktop-shortcut-linux.sh "Mobius Tutorial Generator" "http://localhost:3000"
./scripts/verify-desktop-shortcut.sh
```

## Notes
- Handles OneDrive path redirection (C:\Users\<user>\OneDrive\Desktop).
- Non-destructive; no impact on render pipeline.