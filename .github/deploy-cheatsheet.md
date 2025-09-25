# 🎬 MOBIUS Deploy Operator Cheat Sheet

## 🚀 Quick Deploy Commands

### **Development Environment**
```bash
# Start local development
npm install                    # Install dependencies
npm run dev                   # Start dev server (if available)

# Generate video preview
npm run render:preview        # Render preview video
npm run golden:check         # Validate against golden artifacts
```

### **Production Build**
```bash
# Full production build
npm ci                        # Clean install
npm run build                # Build production assets (if available)
npm run test                 # Run all tests

# Generate release artifacts
npm run render               # Full video render
npm run golden:approve      # Update golden test artifacts
```

## 📁 Critical File Paths

### **Configuration**
- `package.json` - Dependencies & scripts
- `.github/workflows/ci.yml` - CI pipeline config
- `scripts/` - Build & validation scripts

### **Source Code**
- `src/api/` - Backend API (Express.js)
- `client/src/` - Frontend React app
- `scripts/` - Video processing scripts

### **Output & Artifacts**
- `out/` - Generated video files
- `artifacts/` - CI artifacts (audio analysis, etc.)
- `tests/golden/` - Golden test references

### **Templates & Config**
- `.github/templates/` - PR & notification templates
- `.github/scripts/` - Deployment scripts

## ⚡ Emergency Commands

### **Pipeline Recovery**
```bash
# Reset golden tests (use with caution)
npm run golden:update

# Force clean build
rm -rf node_modules package-lock.json
npm install

# Check system dependencies
ffmpeg -version              # Verify FFmpeg
python3 --version           # Verify Python
node --version              # Verify Node.js
```

### **Troubleshooting**
```bash
# Debug video processing
ffprobe out/preview.mp4      # Inspect video metadata
npm run golden:check:junit   # Generate JUnit test report

# Memory/performance issues
npm run render -- --preview # Use preview mode for faster testing
```

## 🔧 Environment Requirements

### **System Dependencies**
- Node.js 20+
- FFmpeg (with ebur128 filter)
- Python 3.10+ (Unix) / Windows Python

### **Environment Variables**
```bash
OPENAI_API_KEY=sk-...        # OpenAI API access
IMAGE_EXTRACTOR_API_KEY=...  # Image processing API
OUTPUT_DIR=./out             # Video output directory
```

### **Cross-Platform Notes**
- **Windows**: Uses PowerShell scripts (.ps1)
- **Unix/macOS**: Uses Bash scripts (.sh)
- **All**: GitHub Actions matrix runs on all platforms

## 🎯 Common Deploy Scenarios

### **Feature Release**
1. `npm run test` - Verify tests pass
2. `npm run render:preview` - Generate preview
3. `npm run golden:check` - Validate quality
4. Merge to main → automatic CI deploy

### **Hotfix Deploy**
1. Create hotfix branch from main
2. `npm run golden:check` - Quick validation
3. PR → merge → auto-deploy

### **Golden Test Update**
1. `npm run golden:update:sushi` - Update Sushi Go tests
2. `npm run golden:update:loveletter` - Update Love Letter tests
3. Commit updated golden artifacts

## 📞 Support Contacts

- **CI/CD Issues**: Check GitHub Actions logs
- **Video Processing**: FFmpeg documentation
- **API Issues**: OpenAI API status page

---
*Last updated: {{CURRENT_DATE}} | Version: 1.0*