# Mobius Verification Scripts Support Matrix

## Operating Systems
- Ubuntu-latest (bash)
- Windows-latest (PowerShell)

## Shells
- bash 5+
- pwsh 7+

## Encodings
- All file writes use UTF-8 encoding

## Dependencies
### Required
- curl (bash)
- jq (bash)
- Invoke-WebRequest (PowerShell)

### Optional
- Tesseract OCR engine (for OCR-related INFO messages)
- ffmpeg/ffprobe (for media extraction checks)
- bats (for bash testing)
- Pester (for PowerShell testing)

## CI/CD Platforms
- GitHub Actions (primary support)
- Other CI platforms with bash/pwsh support (best effort)

## Version Compatibility
- Node.js 16+ for any Node-based components
- Python 3.8+ for any Python-based components

## Network Requirements
- HTTP/HTTPS connectivity to configured server and frontend endpoints
- Access to remote PDF URLs (if using --remote-pdf)
- Access to image URLs (if using --image-urls1 or --image-urls2)

## Notes
- Scripts are designed to be self-contained with minimal external dependencies
- Optional dependencies only affect specific checks and will gracefully skip if not available
- All scripts include comprehensive error handling and will provide meaningful error messages