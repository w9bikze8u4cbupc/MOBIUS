# MOBIUS Production Deployment PR Checklist

## Pre-Merge Validation
- [ ] **CI Status**: All required workflows have passed
  - [ ] `CI / build-and-qa` - Ubuntu, macOS, Windows
  - [ ] `premerge-validation` - Multi-platform validation  
  - [ ] `premerge-artifacts-upload` - Artifacts properly generated and uploaded
  - [ ] Links to workflow runs: 
    - Ubuntu: [link]
    - macOS: [link] 
    - Windows: [link]

## Artifacts & Documentation  
- [ ] **Backup Artifacts**: Pre-deployment backups created and verified
  - [ ] `backups/dhash-{env}-{timestamp}.zip` present
  - [ ] `backups/dhash-{env}-{timestamp}.zip.sha256` checksum verified
- [ ] **Deployment Artifacts**: Required artifacts attached or linked
  - [ ] `premerge_artifacts/` directory (or GitHub Actions artifacts link)
  - [ ] `deploy-dryrun.log` - Dry run deployment log
  - [ ] `migrate-dryrun.log` - Migration dry run log (if applicable)
  - [ ] `postdeploy-smoketests.log` - Smoke test results
  - [ ] `test_logging.log` - Test execution logs
- [ ] **Monitoring Logs**: Staging/canary monitoring results
  - [ ] `monitor_logs/` from staging or canary deployment
  - [ ] No critical alerts during monitoring period

## Quality Gates & Configuration
- [ ] **Quality Gates**: Configuration validated for target environment
  - [ ] `quality-gates-config.json` updated and reviewed
  - [ ] Thresholds appropriate for production load
  - [ ] Alert channels configured and tested
- [ ] **Placeholders**: All deployment placeholders validated or documented
  - [ ] `RELEASE_TAG` placeholder documented with example
  - [ ] `@DEPLOY_LEAD` placeholder documented with current operator
  - [ ] Environment-specific variables validated

## Approvals & Review
- [ ] **Required Approvals**: Minimum 2 approvals obtained
  - [ ] At least 1 approval from Ops/SRE team: @ops
  - [ ] At least 1 approval from technical reviewer
  - [ ] All requested changes addressed
- [ ] **Release Assignment**: Deploy operator acknowledged and assigned
  - [ ] Release owner assigned: @ops
  - [ ] Deploy operator available during deployment window
  - [ ] Rollback operator identified and available

## Branch Protection & CI
- [ ] **Branch Protection**: Required status checks configured
  - [ ] `CI / build-and-qa` marked as required
  - [ ] `premerge-validation` marked as required  
  - [ ] `premerge-artifacts-upload` marked as required
  - [ ] Strict status checks enabled (up-to-date branch required)
- [ ] **Final Testing**: Last-mile validation completed
  - [ ] Smoke tests run successfully on staging/canary
  - [ ] No open P0/P1 issues in target environment
  - [ ] Rollback procedure validated and ready

## Deployment Readiness
- [ ] **Monitoring Setup**: Dashboards and alerts configured
  - [ ] Health dashboard accessible and tested
  - [ ] Error rate monitoring configured (1m/5m/15m windows)
  - [ ] Performance monitoring (p95 latency) configured
  - [ ] Queue length monitoring configured
  - [ ] Resource utilization monitoring configured
- [ ] **Runbooks**: Operations documentation ready
  - [ ] `DEPLOYMENT_CHEAT_SHEET.md` reviewed and current
  - [ ] `DEPLOYMENT_OPERATIONS_GUIDE.md` reviewed and current  
  - [ ] `NOTIFICATION_TEMPLATES.md` configured for environment
  - [ ] Emergency contact information current

## Deployment Scripts & Tools
- [ ] **Scripts Validated**: All deployment scripts tested
  - [ ] `./scripts/deploy_dhash.sh --env production --dry-run` successful
  - [ ] `./scripts/monitor_dhash.sh` tested and configured
  - [ ] `./scripts/rollback_dhash.sh` tested with sample backup
  - [ ] `./scripts/backup_dhash.sh` tested and creating valid backups
  - [ ] `./scripts/health_check.sh` tested against target environment
  - [ ] `./scripts/smoke_tests.sh` tested and passing
- [ ] **Dependencies**: All required tools and permissions available
  - [ ] Node.js 20+ available in deployment environment
  - [ ] FFmpeg with required codecs available
  - [ ] Network access to production environment validated
  - [ ] Backup storage accessible and has sufficient space

---

## Recommended Labels
Add these labels to the PR:
- `release-ready` - Indicates PR is ready for production deployment
- `ops-review-needed` - Requests review from operations team  
- `docs` - Includes documentation changes
- `qa-tested` - QA validation completed

## Recommended Reviewers
Request review from:
- `@ops` - Deploy operator and operations team
- `@media-eng` - Media engineering team for QA validation  
- Ops/SRE on-call engineer
- Documentation maintainer (if docs changes included)

---

## Post-Merge Deployment Commands

After all checklist items are complete and PR is merged:

### 1. Merge the PR
```bash
gh pr merge --repo w9bikze8u4cbupc/MOBIUS --head feature/dhash-production-ready --merge-method rebase --delete-branch
```

### 2. Create Release Tag (Optional)
```bash
git tag -a vX.Y.Z -m "dhash release vX.Y.Z" 
git push origin vX.Y.Z
```

### 3. Deploy to Production  
```bash
export RELEASE_TAG="vX.Y.Z"
export DEPLOY_LEAD="@ops"
./scripts/deploy_dhash.sh --env production --tag "$RELEASE_TAG"
```

### 4. Start Monitoring
```bash
./scripts/monitor_dhash.sh --env production --duration 3600
```

### 5. Emergency Rollback (if needed)
```bash
LATEST_BACKUP=$(ls -1 backups/dhash*.zip | sort -r | head -n1)
sha256sum -c "${LATEST_BACKUP}.sha256"
./scripts/rollback_dhash.sh --backup "$LATEST_BACKUP" --env production
```

---

**Final Checklist Sign-off**

- [ ] All checklist items completed
- [ ] All artifacts present and verified  
- [ ] All approvals obtained
- [ ] Deploy operator standing by
- [ ] Monitoring and rollback procedures ready

**Ready for deployment**: ✅ / ❌

**Deploy lead**: @ops  
**Estimated deployment time**: [duration]  
**Monitoring duration**: 60 minutes  
**Rollback operator**: @ops