# MOBIUS Game Tutorial Generator - Release {{RELEASE_TAG}}

## 🎯 Short Summary
This release enhances the MOBIUS game tutorial video generation pipeline with improved cross-platform compatibility, better audio compliance checking, and comprehensive golden testing infrastructure.

---

## 🚀 What's New

### ✨ New Features
- **Multi-platform Golden Testing**: Automated visual regression testing across Ubuntu, macOS, and Windows
- **Enhanced Audio Compliance**: EBU R128 loudness standard validation with configurable tolerances
- **Container Format Validation**: Comprehensive video container and codec verification
- **Debug Artifact Generation**: Automatic diff images and debug assets for failed tests

### 🛠️ Improvements
- **Cross-platform CI**: Full build and test coverage across all major operating systems
- **Artifact Management**: Structured upload and organization of build artifacts
- **JUnit Integration**: Test results in JUnit XML format for better CI/CD integration
- **Performance Monitoring**: Frame-by-frame SSIM analysis for video quality assurance

### 🐛 Bug Fixes
- Fixed FFmpeg integration issues on Windows
- Resolved golden baseline generation inconsistencies
- Improved error handling for missing test assets
- Fixed audio measurement parsing edge cases

---

## 📊 Technical Details

### Platform Support
- ✅ **Ubuntu Latest**: Full CI/CD pipeline support
- ✅ **macOS Latest**: Native Apple Silicon and Intel compatibility  
- ✅ **Windows Latest**: PowerShell and CMD script support

### Quality Gates
- **Video Quality**: SSIM threshold ≥ 0.995
- **Audio Compliance**: -23.0 LUFS ±1.0 dB tolerance
- **True Peak**: ≤ -1.0 dBTP ±1.0 dB tolerance
- **Container Validation**: Automated format verification

### Dependencies
- Node.js 20.x
- FFmpeg (latest stable)
- Python 3.10+ (for compliance scripts)
- TypeScript 5.x

---

## 🔧 Migration Guide

### For Existing Users
1. **Update Dependencies**:
   ```bash
   npm install
   ```

2. **Regenerate Golden Baselines** (if needed):
   ```bash
   npm run golden:approve
   ```

3. **Verify Platform Compatibility**:
   ```bash
   npm run test-pipeline
   ```

### Breaking Changes
- Golden test format updated (regeneration required)
- Audio compliance thresholds now configurable
- Container validation rules enhanced

### New Configuration Options
```json
{
  "golden": {
    "ssimThreshold": 0.995,
    "lufsTolerancE": 1.0,
    "truePeakTolerance": 1.0,
    "perPlatformBaselines": true
  }
}
```

---

## 📦 Downloads

- **Source Code**: [tar.gz]({{TARBALL_URL}}) | [zip]({{ZIPBALL_URL}})
- **Documentation**: [PDF Guide]({{DOCS_URL}})
- **Sample Assets**: [Golden Test Baselines]({{BASELINES_URL}})

## 🤝 Contributors

Thanks to all contributors who made this release possible:
{{CONTRIBUTORS_LIST}}

## 📋 Full Changelog

**View the complete list of changes**: [{{PREVIOUS_TAG}}...{{RELEASE_TAG}}]({{COMPARE_URL}})

---

## 🛠️ Installation

### Quick Start
```bash
git clone https://github.com/w9bikze8u4cbupc/MOBIUS.git
cd MOBIUS
npm install
npm run test-pipeline
```

### Docker Support
```bash
docker build -t mobius-tutorial-generator .
docker run -v $(pwd)/assets:/app/assets mobius-tutorial-generator
```

## 📞 Support

- **Issues**: [Report bugs]({{ISSUES_URL}})
- **Discussions**: [Community forum]({{DISCUSSIONS_URL}})
- **Documentation**: [Wiki]({{WIKI_URL}})

---

*Released on {{RELEASE_DATE}} | Next milestone: [{{NEXT_MILESTONE}}]({{NEXT_MILESTONE_URL}})*