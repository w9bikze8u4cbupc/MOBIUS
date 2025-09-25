# MOBIUS Games Tutorial Generator

[![CI](https://github.com/w9bikze8u4cbupc/MOBIUS/actions/workflows/ci.yml/badge.svg)](https://github.com/w9bikze8u4cbupc/MOBIUS/actions/workflows/ci.yml)
[![Premerge Validation](https://github.com/w9bikze8u4cbupc/MOBIUS/actions/workflows/premerge-validation.yml/badge.svg)](https://github.com/w9bikze8u4cbupc/MOBIUS/actions/workflows/premerge-validation.yml)
[![Golden Checks](https://github.com/w9bikze8u4cbupc/MOBIUS/actions/workflows/golden-preview-checks.yml/badge.svg)](https://github.com/w9bikze8u4cbupc/MOBIUS/actions/workflows/golden-preview-checks.yml)

A production-ready pipeline for generating game tutorial videos from structured game rules with comprehensive deployment automation, monitoring, and rollback capabilities.

## 🚀 Production Deployment Features

- **Automated Deployment Pipeline**: Multi-platform CI/CD with quality gates
- **Comprehensive Monitoring**: Real-time health checks and performance tracking  
- **Emergency Rollback**: Automated rollback with verified backups
- **Quality Gates**: Configurable thresholds for deployment validation
- **Multi-Platform Support**: Ubuntu, macOS, Windows validation
- **Operator Documentation**: Complete deployment guides and runbooks

## 📦 Quick Start

### Deploy to Production

```bash
# Set environment variables
export RELEASE_TAG="v1.2.3"
export DEPLOY_LEAD="@ops"

# Deploy
./scripts/deploy_dhash.sh --env production --tag "$RELEASE_TAG"

# Monitor (60 minutes)
./scripts/monitor_dhash.sh --env production --duration 3600

# Emergency rollback if needed
LATEST_BACKUP=$(ls -1 backups/dhash*.zip | sort -r | head -n 1)
sha256sum -c "${LATEST_BACKUP}.sha256"
./scripts/rollback_dhash.sh --backup "$LATEST_BACKUP" --env production
```

### Quality Gates Validation

```bash
# Validate quality gates configuration
python3 scripts/validate_quality_gates.py

# Check deployment readiness
./scripts/deploy_dhash.sh --env staging --tag "v1.2.3" --dry-run
```

## 📋 Documentation

- **[Deployment Cheat Sheet](./DEPLOYMENT_CHEAT_SHEET.md)** - Quick reference for deployments
- **[Operations Guide](./DEPLOYMENT_OPERATIONS_GUIDE.md)** - Comprehensive deployment manual
- **[Notification Templates](./NOTIFICATION_TEMPLATES.md)** - Communication templates
- **[Quality Gates Config](./quality-gates-config.json)** - Deployment thresholds

## 🛠️ Development

### Prerequisites

- Node.js 20+
- FFmpeg
- Python 3.11+

### Setup

```bash
npm install
npm run build
npm test
```

### Golden Test Workflow

```bash
# Generate golden references
npm run golden:update

# Check against golden references  
npm run golden:check

# Platform-specific golden tests
npm run golden:check:all
```