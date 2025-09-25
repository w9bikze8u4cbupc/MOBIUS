# Deployment Cheat Sheet - MOBIUS dhash Production

## Quick Reference Commands

### Pre-deployment Validation
```bash
# Run premerge validation and generate artifacts
ARTIFACT_DIR=premerge_artifacts ./scripts/premerge_run.sh

# Check latest backup integrity
LATEST_BACKUP=$(ls -1 backups/dhash*.zip | sort -r | head -n1)
sha256sum -c "${LATEST_BACKUP}.sha256"
```

### Production Deployment
```bash
# Deploy to production (replace RELEASE_TAG with actual tag)
./scripts/deploy_dhash.sh --env production --tag RELEASE_TAG

# Monitor deployment (run at T+60)
./scripts/monitor_dhash.sh --env production --duration 3600

# Rollback if needed
LATEST_BACKUP=$(ls -1 backups/dhash*.zip | sort -r | head -n1)
./scripts/rollback_dhash.sh --backup "$LATEST_BACKUP" --env production
```

### GitHub Workflow Commands
```bash
# Merge approved PR (replace with actual values)
gh pr merge --repo w9bikze8u4cbupc/MOBIUS --head feature/dhash-production-ready --merge-method rebase --delete-branch

# Check CI status
gh run list --repo w9bikze8u4cbupc/MOBIUS --workflow=ci.yml --limit 5
```

## Environment Variables

### Required for Deployment
```bash
export DEPLOY_LEAD="@DEPLOY_LEAD"           # Replace with actual lead
export RELEASE_TAG="v1.0.0"                # Replace with actual tag
export BACKUP_RETENTION_DAYS="30"
export MONITOR_DURATION="3600"             # seconds
```

### Platform-specific Notes
```bash
# Ubuntu/Linux
sudo apt-get install -y ffmpeg python3-pip

# macOS
brew install ffmpeg python3

# Windows (PowerShell as Administrator)
choco install ffmpeg python
```

## Quality Gates (Thresholds)

### Audio Quality
- **LUFS Tolerance**: ±1.0 dB
- **True Peak Tolerance**: ±1.0 dB
- **SSIM Threshold**: 0.995 minimum

### Container Quality  
- **Frame Rate**: 30 fps ±0.1
- **Resolution**: 1920x1080 exact
- **Duration**: Match golden reference ±100ms

## Emergency Contacts

- **Deploy Lead**: @DEPLOY_LEAD (replace with actual)
- **Ops/SRE On-call**: @ops-oncall
- **Media Engineering**: @media-eng

## Common Issues & Solutions

### Deployment Fails
1. Check artifact integrity: `ls -la premerge_artifacts/`
2. Verify environment variables are set
3. Confirm backup availability before proceeding

### Quality Gate Failures
1. Check FFmpeg version: `ffmpeg -version`
2. Verify input files exist: `ls -la out/preview_with_audio.mp4`
3. Review logs in artifacts/ directory

### Rollback Issues
1. Verify backup integrity: `sha256sum -c backups/*.sha256`
2. Check rollback script permissions: `chmod +x scripts/rollback_dhash.sh`
3. Confirm backup extraction path exists

## Pre-deployment Checklist Copy-Paste
```
- [ ] CI passed on Ubuntu/macOS/Windows
- [ ] Premerge artifacts generated and uploaded
- [ ] Latest backup verified (.zip + .sha256)
- [ ] Quality gates passed (SSIM ≥0.995, LUFS ±1.0, TP ±1.0)
- [ ] Deploy lead identified: @DEPLOY_LEAD
- [ ] 2 approvers confirmed (including 1 Ops/SRE)
- [ ] Branch protection enabled with required status checks
- [ ] Placeholders replaced with actual values
- [ ] Deploy operator confirms production deploy window
```

## Artifact Locations

### Generated Artifacts
- **Premerge Bundle**: `premerge_artifacts/`
- **Dry-run Logs**: `deploy-dryrun.log`, `migrate-dryrun.log`
- **Smoke Test Logs**: `postdeploy-smoketests.log`, `test_logging.log`
- **Monitor Logs**: `monitor_logs/` (from staging/canary runs)

### Backups
- **Location**: `backups/dhash*.zip`
- **Checksums**: `backups/dhash*.zip.sha256`
- **Retention**: 30 days (configurable)

---
*Last updated: $(date -u +"%Y-%m-%d %H:%M:%S UTC")*
*For questions or issues, contact @ops or @media-eng*