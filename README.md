# MOBIUS Games Tutorial Generator

A pipeline for generating game tutorial videos from structured game rules.

## Overview

This project provides tools and scripts for creating high-quality tutorial videos for board games, including automated verification systems to ensure repository security and quality.

## Features

- 🎬 **Video Generation Pipeline**: Automated shotlist compilation, timeline binding, and video rendering
- 🔍 **Genesis Verification**: Comprehensive security scanning to prevent accidental reference leaks
- 🎯 **Golden Testing**: Frame-accurate video validation with SSIM analysis
- 📊 **Audio Analysis**: EBU R128 loudness measurement and validation
- 🎮 **Multi-Game Support**: Template system for different board games

## Quick Start

### Installation

```bash
npm install
```

### Basic Usage

```bash
# Generate shotlists
npm run compile-shotlist

# Verify system integrity
npm run verify

# Run the full pipeline
npm run test-pipeline
```

## Genesis Verification System

To ensure repository security and prevent accidental leakage of sensitive "genesis" references, this project includes a comprehensive verification system.

### Quick Verification

```bash
# Fast scan (working tree + history + temp files)
npm run verify-clean-genesis

# Direct execution
node scripts/verify-clean-genesis.js
```

### Detailed Verification

```bash
# Deep scan including binary content (slower)
npm run verify-clean-genesis-detailed

# Direct execution with options
node scripts/verify-clean-genesis.js --detailed
```

### Verification Features

- **Working Tree Scanning**: All source files, configs, and documentation
- **Git History Analysis**: Complete commit history and diff content
- **Temporary File Detection**: Backup files, swap files, temp directories
- **Binary Blob Scanning**: Optional deep scan of binary content
- **Intelligent Exclusions**: Automatically excludes verification tools and build artifacts
- **CI-Ready Output**: Proper exit codes and structured reporting

### Example Output

```bash
🔍 Genesis Verification Tool
Timestamp: 2024-09-29T23:25:00.000Z
Mode: Fast scan
Search term: "genesis"

🔍 Scanning working tree files...
  ✅ Working tree files: Clean

📚 Scanning git history...
  ✅ Git history: Clean

🗂️  Scanning temporary/backup files...
  ✅ Temporary/backup files: Clean

============================================================
GENESIS VERIFICATION SUMMARY
============================================================
Working tree files: ✅ Clean
Git history: ✅ Clean
Temporary/backup files: ✅ Clean

Total matches: 0
Repository status: CLEAN
============================================================

📄 Report saved to: verification-reports/20240929_232500/genesis-verification-report.md
```

### CI Integration

The verification system is designed for continuous integration:

```yaml
# GitHub Actions example
- name: Genesis Verification
  run: node scripts/verify-clean-genesis.js --ci
```

**Exit Codes:**
- `0` = Repository is clean
- `1` = Genesis references found (fail CI job)

### Generated Reports

Each verification run creates a timestamped report in:
```
verification-reports/YYYYMMDD_HHMMSS/genesis-verification-report.md
```

Reports include detailed match information, file locations, and remediation recommendations.

## Golden Testing

The project includes a golden testing system for video validation:

### Update Golden Files

```bash
# Generate new golden artifacts
npm run golden:approve

# Update specific game
npm run golden:update:sushi
npm run golden:update:loveletter
```

### Validate Against Golden

```bash
# Check all golden tests
npm run golden:check

# Check specific game
npm run golden:check:sushi
npm run golden:check:loveletter
```

### Generate JUnit Reports

```bash
npm run golden:check-with-junit
```

## Project Structure

```
MOBIUS/
├── scripts/
│   ├── verify-clean-genesis.js     # Genesis verification tool
│   ├── generate_golden.js          # Golden test generation
│   └── check_golden.js             # Golden test validation
├── docs/
│   └── genesis-verification-report.md  # Verification documentation
├── src/
│   └── api/                        # Core API functionality
├── tests/
│   └── golden/                     # Golden test artifacts
└── verification-reports/           # Generated security reports
```

## Available Scripts

### Core Pipeline
- `npm run compile-shotlist` - Generate shotlists from game data
- `npm run bind-alignment` - Bind timeline alignments
- `npm run render` - Render final video output
- `npm run verify` - System verification
- `npm run test-pipeline` - Full pipeline test

### Security & Verification
- `npm run verify-clean-genesis` - Fast genesis reference scan
- `npm run verify-clean-genesis-detailed` - Deep genesis scan with binary content

### Golden Testing
- `npm run golden:check` - Validate against golden artifacts
- `npm run golden:approve` - Update golden artifacts
- `npm run golden:check:junit` - Generate JUnit test reports

### Development
- `npm test` - Run Jest test suite
- `npm run gen:shotlists` - Generate example shotlists
- `npm run render:proxy` - Render preview videos

## Security Considerations

This project implements several security measures:

1. **Genesis Reference Prevention**: Automated scanning prevents accidental inclusion of sensitive references
2. **Artifact Exclusion**: Build artifacts and dependencies are excluded from version control
3. **Report Isolation**: Security reports are generated locally and not committed by default

## Contributing

1. **Before submitting PRs**: Run `npm run verify-clean-genesis` to ensure no security leaks
2. **Testing**: Include golden test updates if video output changes
3. **Documentation**: Update this README for new features

## CI/CD Integration

### Pre-merge Verification
```bash
# Run this before merging any PR
node scripts/verify-clean-genesis.js --ci
```

### Release Pipeline
```bash
# Comprehensive verification for releases
node scripts/verify-clean-genesis.js --detailed --ci
```

## Troubleshooting

### Genesis Verification Issues
- **"Could not scan git history"**: Ensure you're in a git repository
- **Permission errors**: Check file system permissions
- **High memory usage**: Use fast mode instead of detailed for large repos

### Golden Test Issues
- **SSIM threshold failures**: Video content may have changed, review and approve if expected
- **Audio measurement failures**: Check EBU R128 loudness levels

## License

MIT License - see LICENSE file for details.

## Support

For issues related to:
- **Security/Genesis Verification**: Check `docs/genesis-verification-report.md`
- **Golden Testing**: Review test artifacts in `tests/golden/`
- **Video Pipeline**: See script documentation in `scripts/`
