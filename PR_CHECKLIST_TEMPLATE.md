# PR Checklist Template - MOBIUS dhash Production Ready

Copy this checklist into your PR description to track completion:

```markdown
## Pre-merge Validation Checklist

### CI/CD Status
- [ ] ✅ GitHub Actions CI passed on Ubuntu
- [ ] ✅ GitHub Actions CI passed on macOS  
- [ ] ✅ GitHub Actions CI passed on Windows
- [ ] ✅ Branch protection rules active with required status checks

### Artifacts & Validation
- [ ] 📦 Premerge artifacts generated: `ARTIFACT_DIR=premerge_artifacts ./scripts/premerge_run.sh`
- [ ] 📋 Artifacts uploaded to PR (premerge_artifacts.tar.gz)
- [ ] 🔍 Dry-run logs reviewed: deploy-dryrun.log, migrate-dryrun.log
- [ ] 🧪 Smoke test logs reviewed: postdeploy-smoketests.log, test_logging.log
- [ ] 📊 Monitor logs attached: monitor_logs/ directory

### Backup & Rollback Readiness
- [ ] 💾 Latest backup verified: `LATEST_BACKUP=$(ls -1 backups/dhash*.zip | sort -r | head -n1); sha256sum -c "${LATEST_BACKUP}.sha256"`
- [ ] 🔄 Rollback script tested: `./scripts/rollback_dhash.sh --backup "$LATEST_BACKUP" --env staging --dry-run`
- [ ] ⏰ Backup retention policy confirmed (30 days default)

### Quality Gates
- [ ] 🎥 SSIM threshold met: ≥0.995
- [ ] 🔊 Audio LUFS tolerance: ±1.0 dB
- [ ] 📈 Audio True Peak tolerance: ±1.0 dB  
- [ ] 🎬 Golden reference tests pass: `npm run golden:check`
- [ ] 📏 Container format validation passed

### Reviews & Approvals  
- [ ] 👥 2+ reviewers approved (required)
- [ ] 🔧 At least 1 Ops/SRE reviewer approved: @ops
- [ ] 🎮 Media engineering review: @media-eng
- [ ] 🏗️ Maintainer review for docs/repo structure

### Configuration & Placeholders
- [ ] 🏷️ RELEASE_TAG placeholder replaced with actual version
- [ ] 👤 @DEPLOY_LEAD placeholder replaced with actual lead
- [ ] 📅 Deploy schedule confirmed with stakeholders
- [ ] ⚙️ Environment-specific configurations validated

### Final Deployment Readiness
- [ ] 📋 Deploy operator confirmed: @ops
- [ ] 🕒 Production deploy window scheduled
- [ ] 📞 Emergency contacts notified
- [ ] 📖 Runbooks and documentation updated
- [ ] 🎯 Success criteria defined and communicated

## Merge & Deploy Commands

After all checks pass:

```bash
# Merge (rebase-and-merge)
gh pr merge --repo w9bikze8u4cbupc/MOBIUS --head feature/dhash-production-ready --merge-method rebase --delete-branch

# Deploy
export RELEASE_TAG="v2.1.0"  # Replace with actual tag
export DEPLOY_LEAD="@actual_lead"  # Replace with actual lead
./scripts/deploy_dhash.sh --env production --tag $RELEASE_TAG

# Monitor (T+60)
./scripts/monitor_dhash.sh --env production --duration 3600
```

## Rollback Plan (If Needed)

```bash
LATEST_BACKUP=$(ls -1 backups/dhash*.zip | sort -r | head -n1)
sha256sum -c "${LATEST_BACKUP}.sha256"
./scripts/rollback_dhash.sh --backup "$LATEST_BACKUP" --env production
```

---

**Deploy Lead**: @DEPLOY_LEAD  
**Target Environment**: Production  
**Estimated Deploy Time**: 15-30 minutes  
**Monitoring Window**: 60 minutes  
**Emergency Contact**: @ops-oncall
```

## One-liner PR Comment Template

For CI systems to post:

```markdown
## 🚀 MOBIUS dhash Premerge Status

**Status**: ✅ READY / ⚠️ ISSUES / ❌ FAILED  
**Artifacts**: [premerge_artifacts.tar.gz](link) | **Backup**: dhash_20240115_143021.zip ✅  
**Quality**: SSIM 0.998 ✅ | LUFS -16.2dB ✅ | TP -2.1dB ✅  
**Approvers**: @reviewer1 ✅ @ops-team ✅ (2/2 required)  
**Deploy**: Ready for production window with @DEPLOY_LEAD
```