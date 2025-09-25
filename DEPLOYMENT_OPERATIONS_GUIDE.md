# Deployment Operations Guide - MOBIUS dhash Production

## Table of Contents
1. [Overview](#overview)
2. [Pre-deployment Procedures](#pre-deployment-procedures)
3. [Deployment Process](#deployment-process)
4. [Monitoring and Validation](#monitoring-and-validation)
5. [Rollback Procedures](#rollback-procedures)
6. [Troubleshooting](#troubleshooting)
7. [Quality Gates](#quality-gates)
8. [Script References](#script-references)

## Overview

This guide provides comprehensive procedures for deploying MOBIUS dhash to production. The deployment process includes automated quality gates, backup verification, and monitoring procedures to ensure safe, reliable deployments.

### Key Principles
- **Safety First**: Always verify backups before deployment
- **Quality Gates**: All deployments must pass automated quality checks
- **Monitoring**: 60-minute post-deployment monitoring window required
- **Communication**: Keep stakeholders informed throughout process
- **Rollback Ready**: Automated rollback capability within 10 minutes

## Pre-deployment Procedures

### 1. Branch Protection Verification

Ensure main/prod branch has required protections:
```bash
# Check branch protection status
gh api repos/w9bikze8u4cbupc/MOBIUS/branches/main/protection

# Required checks should include:
# - ci/premerge-validation
# - golden-checks-ubuntu
# - golden-checks-macos  
# - golden-checks-windows
```

### 2. Pre-merge Validation

Run comprehensive pre-merge validation:
```bash
# Set artifact directory
export ARTIFACT_DIR="premerge_artifacts"

# Run premerge validation script
./scripts/premerge_run.sh

# Verify artifacts generated
ls -la ${ARTIFACT_DIR}/
# Expected files:
# - deploy-dryrun.log
# - migrate-dryrun.log
# - postdeploy-smoketests.log
# - test_logging.log
# - monitor_logs/ (directory)
```

### 3. Backup Verification

Verify backup integrity before deployment:
```bash
# Find latest backup
LATEST_BACKUP=$(ls -1 backups/dhash*.zip | sort -r | head -n1)
echo "Latest backup: $LATEST_BACKUP"

# Verify backup checksum
sha256sum -c "${LATEST_BACKUP}.sha256"

# Test backup extraction (dry-run)
unzip -t "$LATEST_BACKUP"
```

### 4. Quality Gates Pre-check

Run quality gate validation:
```bash
# Audio quality check
python3 scripts/check_audio_compliance.py artifacts/preview_with_audio_ebur128.txt

# Container format validation  
bash scripts/check_container.sh artifacts/preview_ffprobe.json

# Golden reference comparison (if applicable)
npm run golden:check
```

### 5. Communication Setup

Send pre-deployment notifications:
```bash
# Use templates from NOTIFICATION_TEMPLATES.md
# Replace placeholders:
# - RELEASE_TAG with actual version
# - DEPLOY_LEAD with actual lead
# - DATE/TIME with actual schedule

# Notify stakeholders via Slack/Teams/Email
```

## Deployment Process

### 1. Pre-deployment Checklist

**Critical Verification Points:**
- [ ] CI passed on Ubuntu/macOS/Windows
- [ ] Premerge artifacts generated: `ls premerge_artifacts/`
- [ ] Backup verified: `sha256sum -c backups/*.sha256`
- [ ] Quality gates passed: SSIM ≥0.995, LUFS ±1.0, TP ±1.0
- [ ] Required approvals: 2+ reviewers including 1 Ops/SRE
- [ ] Branch protection active with status checks
- [ ] Deploy lead confirmed: `@DEPLOY_LEAD`
- [ ] Emergency contacts notified
- [ ] Placeholders replaced in all scripts and docs

### 2. Deployment Execution

Execute deployment with monitoring:
```bash
# Set required environment variables
export RELEASE_TAG="v2.1.0"  # Replace with actual version
export DEPLOY_LEAD="@actual_lead"  # Replace with actual lead
export BACKUP_RETENTION_DAYS="30"

# Deploy to production
./scripts/deploy_dhash.sh --env production --tag $RELEASE_TAG

# Deployment script should:
# 1. Validate environment and prerequisites
# 2. Create deployment-specific backup
# 3. Deploy new version with zero-downtime strategy
# 4. Run smoke tests
# 5. Update version markers
# 6. Generate deployment report
```

### 3. Real-time Monitoring During Deployment

Monitor deployment progress:
```bash
# Watch deployment logs in real-time
tail -f logs/deployment.log

# Monitor system health
watch -n 5 './scripts/health_check.sh'

# Check service status
systemctl status mobius-dhash

# Monitor resource usage
htop  # or equivalent system monitor
```

## Monitoring and Validation

### 1. Post-deployment Monitoring (T+60)

Start comprehensive monitoring immediately after deployment:
```bash
# Run monitoring script for 60 minutes
./scripts/monitor_dhash.sh --env production --duration 3600

# Monitor script should track:
# - API response times
# - Error rates
# - Quality gate compliance
# - Resource utilization
# - User-reported issues
```

### 2. Smoke Tests

Execute automated smoke tests:
```bash
# Run smoke test suite
npm run smoke:production

# Expected validations:
# - Service endpoints responding
# - Quality gates operational
# - Database connectivity
# - File system access
# - External API integrations
```

### 3. Performance Validation

Validate performance metrics:
```bash
# Check API response times
curl -w "@curl-format.txt" -s -o /dev/null https://api.mobius.com/health

# Expected thresholds:
# - Response time: <200ms
# - Error rate: <0.1%
# - CPU usage: <70%
# - Memory usage: <80%
```

### 4. Quality Gate Continuous Monitoring

Monitor ongoing quality compliance:
```bash
# Run golden checks against production output
node scripts/check_golden.js \
  --game production \
  --in /var/log/mobius/latest_output.mp4 \
  --frames 5,10,20 \
  --ssim 0.995 \
  --lufs_tol 1.0 \
  --tp_tol 1.0 \
  --junit /tmp/production_quality.xml

# Archive quality reports
cp /tmp/production_quality.xml logs/quality/$(date +%Y%m%d_%H%M%S)_quality.xml
```

## Rollback Procedures

### 1. Rollback Decision Criteria

Trigger rollback immediately if:
- **Error rate exceeds 1%** for more than 5 minutes
- **Response time exceeds 500ms** consistently  
- **Quality gates failing** for more than 3 consecutive checks
- **Critical functionality broken** as reported by smoke tests
- **Resource exhaustion** (CPU >90%, Memory >95%)

### 2. Automated Rollback Execution

Execute rollback with latest stable backup:
```bash
# Identify latest stable backup
LATEST_BACKUP=$(ls -1 backups/dhash*.zip | sort -r | head -n1)

# Verify backup before rollback
sha256sum -c "${LATEST_BACKUP}.sha256"

# Execute rollback
./scripts/rollback_dhash.sh --backup "$LATEST_BACKUP" --env production

# Rollback script should:
# 1. Stop current services gracefully
# 2. Restore from backup
# 3. Restart services
# 4. Validate rollback success
# 5. Update version markers
# 6. Generate rollback report
```

### 3. Post-rollback Validation

Verify rollback success:
```bash
# Confirm services are operational
./scripts/health_check.sh

# Run smoke tests on rolled-back version
npm run smoke:production

# Verify quality gates
npm run golden:check

# Monitor for stability (extended 2-hour window)
./scripts/monitor_dhash.sh --env production --duration 7200
```

## Troubleshooting

### Common Issues and Solutions

#### 1. Quality Gate Failures

**Issue**: SSIM threshold not met (< 0.995)
```bash
# Diagnosis
ffprobe -v error -select_streams v:0 -show_entries frame=n,pkt_pts_time -of csv=p=0 input.mp4

# Solutions
- Check input video quality
- Verify FFmpeg version consistency
- Regenerate golden references if needed
```

**Issue**: Audio compliance failure (LUFS/TP tolerance exceeded)
```bash
# Diagnosis  
ffmpeg -i input.mp4 -filter_complex ebur128 -f null - 2>&1 | grep -E "(LUFS|dBTP)"

# Solutions
- Check audio encoding parameters
- Verify loudness normalization
- Update audio processing pipeline
```

#### 2. Deployment Failures

**Issue**: Deploy script exits with error
```bash
# Check deployment logs
tail -50 logs/deployment.log

# Common causes and fixes:
# - Missing environment variables → Set required vars
# - Insufficient permissions → Check file/directory permissions  
# - Service conflicts → Stop conflicting services
# - Network issues → Verify connectivity
```

**Issue**: Backup verification fails
```bash
# Re-download/regenerate backup
./scripts/create_backup.sh --env production

# Verify new backup
sha256sum backups/dhash_$(date +%Y%m%d).zip > backups/dhash_$(date +%Y%m%d).zip.sha256
```

#### 3. Monitoring Issues

**Issue**: Monitoring script not reporting data
```bash
# Check monitoring service status
systemctl status mobius-monitor

# Verify monitoring endpoints
curl -f http://localhost:8080/metrics

# Restart monitoring if needed
sudo systemctl restart mobius-monitor
```

## Quality Gates

### Thresholds and Tolerances

Quality gate configuration (single source of truth):
```json
{
  "quality_gates": {
    "audio": {
      "lufs_tolerance": 1.0,
      "true_peak_tolerance": 1.0,
      "units": "dB"
    },
    "video": {
      "ssim_threshold": 0.995,
      "frame_rate_tolerance": 0.1,
      "resolution_exact": "1920x1080"
    },
    "performance": {
      "response_time_max": 200,
      "error_rate_max": 0.1,
      "cpu_usage_max": 70,
      "memory_usage_max": 80
    },
    "monitoring": {
      "check_interval": 30,
      "failure_threshold": 3,
      "recovery_threshold": 5
    }
  }
}
```

### Quality Gate Scripts

Reference implementations:
- Audio compliance: [`scripts/check_audio_compliance.py`](scripts/check_audio_compliance.py)
- Container validation: [`scripts/check_container.sh`](scripts/check_container.sh)
- Golden reference: [`scripts/check_golden.js`](scripts/check_golden.js)
- Generate golden: [`scripts/generate_golden.js`](scripts/generate_golden.js)

## Script References

### Core Deployment Scripts

| Script | Purpose | Usage |
|--------|---------|--------|
| [`scripts/premerge_run.sh`](scripts/premerge_run.sh) | Pre-deployment validation | `ARTIFACT_DIR=artifacts ./scripts/premerge_run.sh` |
| [`scripts/deploy_dhash.sh`](scripts/deploy_dhash.sh) | Production deployment | `./scripts/deploy_dhash.sh --env production --tag v1.0.0` |
| [`scripts/monitor_dhash.sh`](scripts/monitor_dhash.sh) | Post-deployment monitoring | `./scripts/monitor_dhash.sh --env production --duration 3600` |
| [`scripts/rollback_dhash.sh`](scripts/rollback_dhash.sh) | Automated rollback | `./scripts/rollback_dhash.sh --backup backup.zip --env production` |

### Quality Assurance Scripts

| Script | Purpose | Usage |
|--------|---------|--------|
| [`scripts/check_golden.js`](scripts/check_golden.js) | Golden reference validation | `node scripts/check_golden.js --game test --in video.mp4` |
| [`scripts/generate_golden.js`](scripts/generate_golden.js) | Golden reference generation | `node scripts/generate_golden.js --game test --in video.mp4` |

### Branch Protection Documentation

For branch protection setup, refer to GitHub documentation:
- [About protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/defining-the-mergeability-of-pull-requests/about-protected-branches)
- [Managing branch protection rules](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/defining-the-mergeability-of-pull-requests/managing-a-branch-protection-rule)

---

## Emergency Procedures

### Escalation Path
1. **Deploy Lead** (`@DEPLOY_LEAD`) - First response
2. **Ops/SRE On-call** (`@ops-oncall`) - Technical escalation  
3. **Media Engineering** (`@media-eng`) - Domain expertise
4. **Engineering Manager** - Management escalation

### Emergency Rollback (< 5 minutes)
```bash
# Emergency one-liner rollback
LATEST_BACKUP=$(ls -1 backups/dhash*.zip | sort -r | head -n1) && \
sha256sum -c "${LATEST_BACKUP}.sha256" && \
./scripts/rollback_dhash.sh --backup "$LATEST_BACKUP" --env production --emergency
```

---

*Last updated: $(date -u +"%Y-%m-%d %H:%M:%S UTC")*  
*For questions or emergency issues, contact: @ops-oncall or @DEPLOY_LEAD*