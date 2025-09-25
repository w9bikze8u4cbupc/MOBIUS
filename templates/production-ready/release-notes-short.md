# MOBIUS {{RELEASE_TAG}} - Game Tutorial Generator Update

## 🚀 Key Updates
- **Multi-platform support** - Now builds and tests on Ubuntu, macOS, and Windows
- **Enhanced audio compliance** - EBU R128 loudness validation with configurable tolerances  
- **Golden testing infrastructure** - Automated visual regression testing across platforms
- **Improved CI/CD pipeline** - Comprehensive quality gates and artifact management

## ✨ New Features
- Cross-platform golden test baselines with SSIM analysis
- Container format validation for video output
- Debug artifact generation for failed tests
- JUnit XML test reporting integration

## 🛠️ Technical Improvements  
- FFmpeg integration stabilized across all platforms
- Enhanced error handling and logging
- Performance monitoring for video processing pipeline
- Structured artifact upload and organization

## 🐛 Bug Fixes
- Fixed Windows-specific FFmpeg path issues
- Resolved golden baseline generation inconsistencies
- Improved audio measurement parsing reliability
- Better handling of missing test assets

## 📦 Installation
```bash
npm install  # Update dependencies
npm run golden:approve  # Regenerate baselines if needed
npm run test-pipeline  # Verify setup
```

## ⚠️ Breaking Changes
- Golden test format updated (regeneration required)
- Audio compliance configuration now customizable
- Enhanced container validation rules

---

**Full details**: [Release {{RELEASE_TAG}}]({{RELEASE_URL}})  
**Download**: [Source]({{DOWNLOAD_URL}}) | **Issues**: [Report here]({{ISSUES_URL}})