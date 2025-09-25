# MOBIUS dhash Production Deployment - PR Checklist

## Pre-merge Validation
- [ ] **CI/CD Status** ✅ All workflows passed
  - [ ] `CI / build-and-qa` workflow passed on Ubuntu, macOS and Windows  
  - [ ] `premerge-validation` workflow passed on all platforms
  - [ ] `premerge-artifacts-upload` completed successfully
  - [ ] Golden preview checks passed on all platforms

## Required Artifacts 
- [ ] **Deployment Artifacts** 📦 All required artifacts generated
  - [ ] `backups/*.zip` + `backups/*.zip.sha256` files present
  - [ ] `premerge_artifacts/` directory with all required files
  - [ ] `deploy-dryrun.log` generated and reviewed  
  - [ ] `migrate-dryrun.log` generated and reviewed
  - [ ] `postdeploy-smoketests.log` validated
  - [ ] `test_logging.log` monitoring setup verified
  - [ ] `monitor_logs/` from staging/canary testing

## Configuration Validation
- [ ] **Quality Gates** ⚙️ Configuration validated
  - [ ] `quality-gates-config.json` syntax is valid
  - [ ] Quality gates validated for target environment
  - [ ] All placeholders resolved or documented:
    - [ ] `RELEASE_TAG` placeholder updated or deployment-ready
    - [ ] `@DEPLOY_LEAD` placeholder assigned to ops team member
    - [ ] Environment-specific configurations verified

## Approval Requirements  
- [ ] **Code Review** 👥 Required approvals obtained
  - [ ] Minimum 2 approvals from authorized reviewers
  - [ ] At least 1 approval from Ops/SRE team member
  - [ ] No unresolved change requests
  - [ ] All review comments addressed

## Operations Readiness
- [ ] **Deploy Operator** 👤 Assignment and acknowledgment  
  - [ ] Release owner/deploy operator (@ops) assigned  
  - [ ] Deploy operator has acknowledged and accepted assignment
  - [ ] Deployment window scheduled and communicated
  - [ ] Rollback plan reviewed and confirmed

## Branch Protection & CI
- [ ] **Required Status Checks** 🔒 Branch protection verified
  - [ ] `CI / build-and-qa` status check required
  - [ ] `premerge-validation` status check required  
  - [ ] `premerge-artifacts-upload` status check required
  - [ ] All required checks are passing ✅

## Final Validation
- [ ] **Production Readiness** 🚀 Final checks complete
  - [ ] Staging deployment and smoke tests successful
  - [ ] Final smoke test run on staging/canary attached and reviewed
  - [ ] Deploy runbook verified by deploy operator
  - [ ] Notification templates verified and ready
  - [ ] Monitoring dashboards confirmed operational

## Documentation
- [ ] **Operational Docs** 📚 Documentation current
  - [ ] `DEPLOYMENT_CHEAT_SHEET.md` reviewed by deploy operator
  - [ ] `DEPLOYMENT_OPERATIONS_GUIDE.md` confirms current procedures  
  - [ ] `NOTIFICATION_TEMPLATES.md` templates verified
  - [ ] Release notes prepared (if applicable)

## Risk Assessment
- [ ] **Deployment Risk** ⚠️ Risk evaluation complete  
  - [ ] Breaking changes assessed: **None identified** ✅
  - [ ] Rollback plan tested and verified
  - [ ] Impact assessment completed: **Low risk, additive changes only**
  - [ ] Deployment window appropriate for changes
  - [ ] Emergency contacts and escalation paths confirmed

---

## Ready-to-Merge Criteria ✅

**All items above must be checked before merging this PR.**

Once merged, deployment can proceed using:

```bash
# Set deployment variables
export RELEASE_TAG="vX.Y.Z"  # Update with actual tag
export DEPLOY_LEAD="@ops"    # Update with assigned operator

# Execute deployment
./scripts/deploy_dhash.sh --env production --tag "$RELEASE_TAG"

# Monitor deployment  
./scripts/monitor_dhash.sh --env production --duration 3600

# If rollback needed
LATEST_BACKUP=$(ls -1 backups/dhash*.zip | sort -r | head -n 1)
sha256sum -c "${LATEST_BACKUP}.sha256"  
./scripts/rollback_dhash.sh --backup "$LATEST_BACKUP" --env production
```

## Reviewer Instructions

**For Code Reviewers:**
- [ ] Review code changes for quality and security
- [ ] Verify test coverage for new functionality  
- [ ] Check for breaking changes or API modifications
- [ ] Confirm documentation is updated

**For Ops/SRE Reviewers:**
- [ ] Validate deployment scripts and procedures
- [ ] Review quality gates and monitoring configuration
- [ ] Confirm rollback procedures are tested
- [ ] Verify operational documentation is current
- [ ] Validate infrastructure and capacity planning

**Final Reviewer (Deploy Lead):**
- [ ] All previous reviews addressed
- [ ] Deployment plan is clear and tested
- [ ] Rollback procedures confirmed
- [ ] Team communication completed
- [ ] Ready for merge and deployment execution

---

**Merge Command (when ready):**
```bash
gh pr merge --repo OWNER/REPO --head feature/dhash-production-ready --merge-method rebase --delete-branch
```

**Post-merge release tagging:**
```bash
git tag -a vX.Y.Z -m "dhash release vX.Y.Z" && git push origin vX.Y.Z
```