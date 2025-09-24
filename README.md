# MOBIUS Games Tutorial Generator & DHash System

This repository contains two main systems:

1. **Video Tutorial Generator**: Creates board game tutorial videos from structured rules
2. **DHash Image Library System**: Manages game image libraries with duplicate detection

## 🎯 DHash System (Production Ready)

The MOBIUS DHash System provides automated image library management with 64-bit DHash fingerprint generation for duplicate detection and similarity matching.

### Quick Start - DHash System

```bash
# Install dependencies
npm install

# Create a backup
npm run dhash:backup:create

# Run migration (dry-run first)
npm run dhash:migrate:dry-run
npm run dhash:migrate

# Deploy with full automation
npm run dhash:deploy

# Check system health
npm run dhash:health
npm run dhash:metrics

# Run smoke tests
npm run dhash:smoke-tests
```

### DHash System Features

- ✅ **Automated Backup System** with SHA256 verification
- ✅ **64-bit DHash Generation** for image fingerprinting  
- ✅ **Atomic Deployment** with automatic rollback
- ✅ **Health & Metrics Endpoints** for monitoring
- ✅ **Post-Deploy Smoke Tests** for validation
- ✅ **Cross-Platform Support** (Linux/macOS/Windows)
- ✅ **Retention Policy** and cleanup automation

### DHash API Endpoints

- `GET /health` - System health status
- `GET /metrics/dhash` - DHash performance metrics
- `POST /internal/metrics/update` - Update metrics (internal)

See [DEPLOYMENT_COMPLETE.md](./DEPLOYMENT_COMPLETE.md) for complete documentation.

---

## 🎬 Video Tutorial Generator (Legacy)

Generate high-quality board game tutorial videos from structured game rules and components.

### Features

- Extract game information from BoardGameGeek
- AI-powered component identification 
- Multi-language script generation
- Video rendering with FFmpeg
- Golden master testing for video quality
- Cross-platform compatibility
