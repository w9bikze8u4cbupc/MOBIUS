# PR Deployment Checklist

Copy this checklist into your PR description to ensure all deployment requirements are met:

## Pre-merge Requirements

### Automated Validations ✅
- [ ] Pre-merge validation workflow passed (Ubuntu/macOS/Windows)  
- [ ] Security vulnerability scan completed
- [ ] All unit tests passing
- [ ] Build verification successful

### Required Artifacts 📦
- [ ] Attach `backups/*.zip` and corresponding `.sha256` files
- [ ] Attach `deploy-dryrun.log` and `migration-dryrun.log`  
- [ ] Attach `postdeploy-smoketests.log` and `test_logging.log`
- [ ] Attach `premerge_artifacts/` CI bundle and links to CI runs
- [ ] Attach `monitor_logs/` from staging/canary dry-run (if available)

### Manual Validations 👥
- [ ] 2+ approvers have approved this PR (≥1 must be Ops/SRE)
- [ ] Deploy operator (@ops) has signed off for guarded merge
- [ ] Branch protection contexts configured and passing
- [ ] All conversations resolved

### Safety Checks 🛡️
- [ ] Backup strategy confirmed and tested
- [ ] Rollback procedure verified and ready
- [ ] Monitoring thresholds reviewed and appropriate
- [ ] Emergency contacts notified and available

## Deployment Execution

### Pre-deployment 
- [ ] Target environment verified
- [ ] Backup created and SHA256 verified
- [ ] All dependencies installed and up-to-date
- [ ] Configuration files validated

### Deployment
- [ ] Services deployed without errors
- [ ] Database migrations applied successfully (if applicable)
- [ ] Configuration changes applied
- [ ] Health checks passing

### Post-deployment
- [ ] Smoke tests completed successfully
- [ ] 60-minute monitoring period started
- [ ] Performance metrics within acceptable limits
- [ ] User acceptance testing passed (if applicable)

## Post-merge Actions

### Documentation
- [ ] Deployment log updated
- [ ] Configuration changes documented  
- [ ] Known issues documented (if any)
- [ ] Runbooks updated (if needed)

### Communication
- [ ] Stakeholders notified of successful deployment
- [ ] Status page updated (if applicable)
- [ ] Team informed via Slack/Teams
- [ ] Deployment metrics shared

## Rollback Readiness

### Preparation
- [ ] Latest backup identified and verified
- [ ] Rollback procedure tested in staging
- [ ] Rollback timeline estimated and communicated
- [ ] Emergency contacts available

### Verification
```bash
# Verify latest backup
LATEST_BACKUP=$(ls -1 backups/dhash_production_*.zip | sort -r | head -n1)
sha256sum -c "${LATEST_BACKUP}.sha256"

# Test rollback procedure (dry-run)  
./scripts/deploy/rollback_dhash.sh --backup "$LATEST_BACKUP" --env staging --dry-run
```

## Emergency Procedures

If critical issues are discovered:

1. **Immediate**: Stop deployment and assess impact
2. **Communication**: Alert incident commander and stakeholders  
3. **Decision**: Determine if rollback is necessary
4. **Execution**: Execute rollback using verified backup
5. **Verification**: Confirm system stability post-rollback

## Approval Sign-offs

### Technical Review
- [ ] **Engineering Lead**: @eng-lead ✅ Approved
- [ ] **SRE/Ops**: @sre-team ✅ Approved  

### Deployment Authorization
- [ ] **Deploy Operator**: @ops ✅ Authorized for merge

### Final Confirmation
- [ ] **All requirements met** ✅ Ready for rebase-and-merge

---

**Merge Instructions**: Use "rebase and merge" strategy after all checkboxes are complete and approvals obtained.

**Emergency Contact**: @incident-commander (for deployment issues)

**Deployment Framework Version**: 1.0