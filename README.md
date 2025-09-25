# MOBIUS - Media-Optimized Board-game Instruction and Understanding System

A pipeline for generating high-quality board game tutorial videos from structured game rules.

## Quick Start

```bash
# Install dependencies
npm install

# Run tests
npm test

# Generate golden references  
npm run golden:update

# Check golden references
npm run golden:check
```

## Production Deployment

This repository includes a comprehensive production deployment system for the dhash functionality.

### 📋 Pre-deployment Checklist

Before deploying to production, run:
```bash
# Generate and validate all deployment artifacts
ARTIFACT_DIR=premerge_artifacts ./scripts/premerge_run.sh

# Validate documentation and scripts
./scripts/validate_documentation.sh
```

### 🚀 Deployment Process

1. **Validation**: Use `scripts/premerge_run.sh` for comprehensive pre-deployment validation
2. **Deployment**: Use `scripts/deploy_dhash.sh` for production deployment  
3. **Monitoring**: Use `scripts/monitor_dhash.sh` for post-deployment monitoring
4. **Rollback**: Use `scripts/rollback_dhash.sh` if issues are detected

### 📖 Documentation

- **[DEPLOYMENT_CHEAT_SHEET.md](DEPLOYMENT_CHEAT_SHEET.md)** - Quick reference commands and copy-ready snippets
- **[DEPLOYMENT_OPERATIONS_GUIDE.md](DEPLOYMENT_OPERATIONS_GUIDE.md)** - Comprehensive deployment procedures
- **[NOTIFICATION_TEMPLATES.md](NOTIFICATION_TEMPLATES.md)** - Communication templates for deployments
- **[PR_CHECKLIST_TEMPLATE.md](PR_CHECKLIST_TEMPLATE.md)** - PR checklist for deployment readiness

### ⚙️ Quality Gates

Quality gates are configured in `quality-gates-config.json`:
- **SSIM Threshold**: ≥0.995 for video quality
- **Audio LUFS**: ±1.0 dB tolerance
- **Response Time**: <200ms for production
- **Error Rate**: <0.1% maximum

### 🔧 Scripts

| Script | Purpose | Usage |
|--------|---------|--------|
| `premerge_run.sh` | Pre-deployment validation | `ARTIFACT_DIR=artifacts ./scripts/premerge_run.sh` |
| `deploy_dhash.sh` | Production deployment | `./scripts/deploy_dhash.sh --env production --tag v1.0.0` |
| `monitor_dhash.sh` | Post-deployment monitoring | `./scripts/monitor_dhash.sh --env production --duration 3600` |
| `rollback_dhash.sh` | Automated rollback | `./scripts/rollback_dhash.sh --backup backup.zip --env production` |

### 🎯 Example Deployment Workflow

```bash
# 1. Pre-deployment validation
ARTIFACT_DIR=premerge_artifacts ./scripts/premerge_run.sh

# 2. Deploy to production
export RELEASE_TAG="v2.1.0"
export DEPLOY_LEAD="@ops-lead"
./scripts/deploy_dhash.sh --env production --tag $RELEASE_TAG

# 3. Monitor for 60 minutes
./scripts/monitor_dhash.sh --env production --duration 3600

# 4. Rollback if needed
LATEST_BACKUP=$(ls -1 backups/dhash*.zip | sort -r | head -n1)
./scripts/rollback_dhash.sh --backup "$LATEST_BACKUP" --env production
```

For detailed deployment procedures, see [DEPLOYMENT_OPERATIONS_GUIDE.md](DEPLOYMENT_OPERATIONS_GUIDE.md).

## Development

### Golden Reference System

The project uses a golden reference system for quality assurance:

```bash
# Generate golden references for a game
node scripts/generate_golden.js --game "Sushi Go" --in "out/sushi-go/preview.mp4"

# Check against golden references  
node scripts/check_golden.js --game "Sushi Go" --in "out/sushi-go/preview.mp4"
```

### Testing

```bash
# Run unit tests
npm test

# Run golden reference checks
npm run golden:check

# Run all quality validations
npm run golden:check:all
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run validation: `./scripts/validate_documentation.sh`  
5. Create a Pull Request using [PR_CHECKLIST_TEMPLATE.md](PR_CHECKLIST_TEMPLATE.md)

## License

MIT License - see LICENSE file for details.