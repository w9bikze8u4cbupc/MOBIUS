# Track A — Poppler Installation & Validation Guide

## 🚀 Quick Installation (Copy-Paste Commands)

### Windows (Chocolatey) - **RECOMMENDED**
```powershell
# Run in Admin PowerShell
choco install poppler -y
setx POPPLER_BIN_DIR "C:\ProgramData\chocolatey\lib\poppler\tools"
```

### Windows (Scoop) - Alternative
```powershell
scoop install poppler
# If needed: setx POPPLER_BIN_DIR "$env:USERPROFILE\scoop\apps\poppler\current\bin"
```

### macOS (Homebrew)
```bash
brew install poppler
```

### Ubuntu/Debian
```bash
sudo apt-get update && sudo apt-get install -y poppler-utils
```

### Fedora/RHEL/CentOS
```bash
sudo dnf install -y poppler-utils
# or: sudo yum install -y poppler-utils
```

### Alpine Linux
```bash
sudo apk add poppler-utils
```

## ✅ Verification Tests (Copy-Paste)

### 1. Basic Tool Verification
```bash
pdfimages -v
pdftocairo -v
```
**Expected:** Version information without errors

### 2. Health Endpoint Check
```bash
curl -sI http://localhost:5001/api/health/poppler | grep -i x-poppler
curl -s http://localhost:5001/api/health/poppler | jq
```
**Expected Headers:** `X-Poppler: OK`
**Expected JSON:** `{"ok": true, "pdfimages": {"found": true, "version": "24.x.x"}}`

### 3. Extraction Tests
```bash
PDF="https://arxiv.org/pdf/2106.14881.pdf"

# First call (should be STORE)
curl -sI "http://localhost:5001/api/extract-components?pdfUrl=${PDF}" | grep -i X-Components-

# Check JSON response
curl -s "http://localhost:5001/api/extract-components?pdfUrl=${PDF}" | jq '.source, .popplerMissing, .images | length'

# Second call (should be HIT from cache)
curl -sI "http://localhost:5001/api/extract-components?pdfUrl=${PDF}" | grep -i X-Components-
```

### 4. Enhanced Options Testing
```bash
PDF="https://arxiv.org/pdf/2106.14881.pdf"

# High-res snapshots with no trim, no conversion
curl -sI "http://localhost:5001/api/extract-components?pdfUrl=${PDF}&dpi=400&trim=0&convert=0" | grep -i X-Components-

# Default options (dpi=300, trim=1, convert=1)
curl -sI "http://localhost:5001/api/extract-components?pdfUrl=${PDF}" | grep -i X-Components-
```

## 📋 Expected Results After Installation

### Health Check Success
```json
{
  "ok": true,
  "popplerBinDir": "C:\\ProgramData\\chocolatey\\lib\\poppler\\tools",
  "pdfimages": {
    "found": true,
    "version": "24.8.0",
    "path": "C:\\ProgramData\\chocolatey\\lib\\poppler\\tools\\pdfimages.exe",
    "error": null
  },
  "pdftocairo": {
    "found": true,
    "version": "24.8.0", 
    "path": "C:\\ProgramData\\chocolatey\\lib\\poppler\\tools\\pdftocairo.exe",
    "error": null
  }
}
```

### Extraction Headers Success
```
X-Components-Cache: STORE (first call) / HIT (second call)
X-Components-Source: embedded|snapshots|mixed (no longer "none")
X-Components-Count: 5 (or other positive number)
X-Components-Opts: dpi=300;trim=true;convert=true
X-Poppler: OK
```

### Sample Image Entry
```json
{
  "url": "/output/a1b2c3d4e5f6/img-000.png",
  "path": "C:\\...\\output\\a1b2c3d4e5f6\\embedded\\img-000.png",
  "page": 1,
  "source": "embedded",
  "width": 1024,
  "height": 768,
  "size": 245760,
  "format": "png",
  "hasAlpha": true,
  "score": 896512
}
```

## 🔧 Enhanced Features Available Post-Installation

### 1. Web-Friendly Format Conversion
- **Automatically converts** JP2, JPX, PPM, PGM, PBM → PNG for browser compatibility
- **Query parameter:** `convert=0` to disable conversion
- **Header tracking:** `X-Components-Opts` shows conversion status

### 2. Configurable DPI for Snapshots  
- **Default:** 300 DPI for good quality/size balance
- **High quality:** `dpi=400` or `dpi=600` for detailed extraction
- **Fast mode:** `dpi=150` for quick previews

### 3. Border Trimming Control
- **Default:** `trim=1` removes white borders from snapshots
- **Disable:** `trim=0` to preserve original dimensions
- **Smart logic:** Only trims when uniform background detected

### 4. Advanced Caching
- **Cache separation:** Different options create separate cache entries
- **TTL:** 5-minute expiration per unique PDF + options combination
- **LRU eviction:** 32 entries maximum

## 🚨 Troubleshooting

### Issue: Command not found
**Solution:** 
- Ensure environment variable is set: `echo $POPPLER_BIN_DIR` (Unix) or `echo %POPPLER_BIN_DIR%` (Windows)
- Restart terminal and server after installation
- Check PATH includes Poppler tools

### Issue: Permission denied
**Solution:**
- Run PowerShell as Administrator for Windows installation
- Use `sudo` for Linux package installations
- Verify user has read access to Poppler installation directory

### Issue: Still showing popplerMissing
**Solution:**
1. Verify installation: `pdfimages -v`
2. Check health endpoint: `curl -s http://localhost:5001/api/health/poppler | jq`
3. Restart backend server after environment variable changes
4. Clear browser cache for new API calls

## 🎯 Post-Installation Next Steps

1. **Validate Extraction:** Test with your own PDF files
2. **Tune Scoring:** Share sample image metadata for optimization
3. **Integration Testing:** Verify demo UI works with real extractions
4. **Performance Testing:** Compare different DPI/trim/convert combinations

**Ready for full A-to-Z workflow testing!** 🚀