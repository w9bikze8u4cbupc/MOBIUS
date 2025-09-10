# Poppler Installation Instructions for Windows

## Quick Setup

For the PDF component extraction to work, you need Poppler tools installed on Windows.

### Option 1: Download Pre-built Binaries (Recommended)

1. Download Poppler for Windows from: https://blog.alivate.com.au/poppler-windows/
2. Or download from official releases: https://poppler.freedesktop.org/ (Windows section)
3. Extract to a folder like `C:\Program Files\poppler-24.08.0\`
4. Set environment variable:
   ```powershell
   setx POPPLER_BIN_DIR "C:\Program Files\poppler-24.08.0\Library\bin"
   ```
5. Restart your terminal/PowerShell session
6. Restart the server: `npm run server`

### Option 2: Using Package Manager

If you have Chocolatey installed:
```powershell
choco install poppler
```

If you have Scoop installed:
```powershell
scoop install poppler
```

### Verification

After installation, verify with:
```powershell
pdfimages -v
pdftocairo -v
```

Both should show version information without errors.

### Current Status

❌ **Poppler not detected** - PDF component extraction will fail
✅ **Sharp installed** - Image processing and trim features available
✅ **Node.js/Express** - Backend API ready

### Fallback Behavior

Without Poppler, the `/api/extract-components` endpoint will:
- Return helpful error messages
- Suggest installation steps
- Not crash the server

With Poppler installed, you get:
- Vector-first embedded image extraction
- Fallback to 300 DPI page snapshots
- Smart border trimming with Sharp
- Proper component scoring and sorting