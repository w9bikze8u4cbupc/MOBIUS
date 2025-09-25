# 🚀 MOBIUS Games Tutorial Generator

A comprehensive pipeline for generating high-quality game tutorial videos from structured game rules with built-in quality assurance and production-ready deployment workflows.

## ✨ Features

- **Multi-Platform Video Generation**: Consistent output across Ubuntu, macOS, and Windows
- **Golden Testing Framework**: Automated visual and audio quality validation
- **Production-Ready CI/CD**: Comprehensive pre-merge validation and deployment safety
- **Quality Gates**: Configurable quality standards for different environments
- **Automated Artifact Management**: Backup generation with integrity validation
- **Comprehensive Monitoring**: System health checks and performance tracking

## 🚀 Quick Start

### Prerequisites

- **Node.js** 18+ 
- **FFmpeg** (for video processing)
- **Git** with GitHub CLI (optional, for branch protection setup)

### Installation

```bash
git clone https://github.com/w9bikze8u4cbupc/MOBIUS.git
cd MOBIUS
npm install
```

### Basic Usage

```bash
# Generate golden test baselines
npm run golden:update

# Run golden validation tests  
npm run golden:check

# Run comprehensive smoke tests
node scripts/smoke-test.js
```

## 🔧 Production Deployment Setup

### 1. Configure Quality Gates

The `quality-gates-config.json` file defines quality standards for different environments:

```bash
# Validate current configuration
node scripts/validate-quality-gates.js

# Check target environment (staging/production)
TARGET_ENV=production node scripts/validate-quality-gates.js
```

### 2. Set Required Placeholders

Configure deployment placeholders as environment variables:

```bash
export RELEASE_TAG="v1.0.0"           # Semantic version tag
export DEPLOY_LEAD="@deployuser"      # GitHub username with @ prefix  
export OPS_="@ops-team"                # Operations team username
```

Validate placeholder configuration:

```bash
# Check placeholder usage and validation
node scripts/validate-placeholders.js --docs
```

### 3. Configure Branch Protection

Use the provided script to set up GitHub branch protection:

```bash
# Generate branch protection command
./templates/branch-protection-cmd.sh w9bikze8u4cbupc MOBIUS main

# Apply the generated command using GitHub CLI
```

This configures:
- ✅ 2+ approving reviews required  
- ✅ Code owner review required
- ✅ Status checks: `CI / build-and-qa`, `premerge-validation`, `premerge-artifacts-upload`
- ✅ Dismiss stale reviews on new commits

### 4. Enable Workflows

The repository includes production-ready GitHub Actions workflows:

- **`.github/workflows/ci.yml`** - Multi-platform build and QA  
- **`.github/workflows/premerge-validation.yml`** - Pre-merge validation with artifacts
- **`.github/workflows/golden-preview-checks.yml`** - Cross-platform golden tests
- **`.github/workflows/golden-approve.yml`** - Baseline approval workflow

## 📋 PR Management Templates  

### Quick Copy-Ready Items

The `templates/` directory contains production-ready templates:

#### 📝 PR Checklist
```bash
cat templates/pr-checklist.md
```
Complete acceptance checklist for paste into PR body.

#### 🤖 CI Comment Template  
```bash
cat templates/ci-comment.md  
```
Automated comment template for CI results with artifact links.

#### 🛡️ Branch Protection Command
```bash
./templates/branch-protection-cmd.sh
```
Copy-ready GitHub CLI command for branch protection setup.

#### 📰 Release Notes
```bash
# Short release notes
cat templates/release-notes-short.md

# Extended release notes  
cat templates/release-notes-extended.md
```

#### 📢 Notifications
```bash
# Slack notifications (T-30 to T+60)
cat templates/slack-notification.md

# Microsoft Teams notifications
cat templates/teams-notification.md  

# Lightweight success comment
cat templates/pr-success-comment.md
```

## 🧪 Testing & Validation

### Golden Tests

```bash
# Check golden tests across all platforms
npm run golden:check

# Update golden baselines for specific game
npm run golden:update:sushi

# Generate platform-specific baselines  
node scripts/generate_golden.js --game "MyGame" --perOs
```

### Smoke Tests

```bash
# Run full smoke test suite
node scripts/smoke-test.js

# Test specific environment
TARGET_ENV=production node scripts/smoke-test.js

# Test custom endpoints
BASE_URL=https://staging.example.com node scripts/smoke-test.js
```

### Quality Validation

```bash
# Validate quality gates configuration
node scripts/validate-quality-gates.js

# Validate placeholders with documentation
node scripts/validate-placeholders.js --docs

# Run all validation checks
npm run test
```

## 📦 Artifact Management

The system automatically generates comprehensive artifacts:

### Generated Artifacts
- **`premerge_artifacts/`** - Validation logs and reports
  - `deploy-dryrun.log` - Deployment validation  
  - `migrate-dryrun.log` - Migration validation
  - `postdeploy-smoketests.log` - Smoke test results
  - `test_logging.log` - Test execution logs

- **`backups/`** - Configuration backups with SHA256 checksums
- **`monitor_logs/`** - System health and performance data

### Artifact Access
Artifacts are automatically uploaded to GitHub Actions and available for:
- 📥 Download from CI runs  
- 🔍 Debugging failed deployments
- 📊 Performance analysis
- 🔄 Rollback procedures

## 🔧 Environment Configuration

### Staging Environment
```bash
TARGET_ENV=staging node scripts/validate-quality-gates.js
```
- Coverage threshold: 70%
- SSIM threshold: 0.995
- Relaxed performance requirements

### Production Environment  
```bash
TARGET_ENV=production node scripts/validate-quality-gates.js
```
- Coverage threshold: 80%  
- SSIM threshold: 0.999
- Strict performance requirements
- Security scan required
- Dependency audit enabled

## 🚨 Troubleshooting

### Common Issues

**❌ FFmpeg not found**
```bash
# Ubuntu/Debian
sudo apt-get install ffmpeg

# macOS
brew install ffmpeg

# Windows  
choco install ffmpeg
```

**❌ Quality gates validation failed**
```bash
# Check configuration
node scripts/validate-quality-gates.js

# Verify target environment
echo $TARGET_ENV
```

**❌ Placeholder validation failed**
```bash
# Set required environment variables
export RELEASE_TAG="v1.0.0"
export DEPLOY_LEAD="@username"
export OPS_="@ops-team"

# Verify settings
node scripts/validate-placeholders.js
```

**❌ Golden tests failing**
```bash
# Check platform-specific differences
node scripts/check_golden.js --game "GameName" --perOs

# View debug images
ls tests/golden/*/debug/

# Regenerate baselines if expected
node scripts/generate_golden.js --game "GameName"
```

### Support & Documentation

- 📖 **API Documentation**: [View API Reference](docs/api.md)
- 🐛 **Report Issues**: [GitHub Issues](https://github.com/w9bikze8u4cbupc/MOBIUS/issues)  
- 💬 **Discussions**: [GitHub Discussions](https://github.com/w9bikze8u4cbupc/MOBIUS/discussions)
- 📊 **Status Page**: [System Status](https://status.example.com)

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch  
3. Use the provided PR checklist template
4. Ensure all quality gates pass
5. Request review from 2+ reviewers (≥1 Ops/SRE)

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

---

**🎉 Ready for production deployment!** 

All workflows, templates, and quality gates are configured for safe, reliable deployments across multiple environments.

*Built with ❤️ by the MOBIUS team*