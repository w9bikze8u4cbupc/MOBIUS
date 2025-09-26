# MOBIUS Deployment PR Checklist Template

Copy and paste this checklist into your PR description for deployment readiness validation.

---

## 📋 Pre-merge Deployment Checklist

### 🔒 Required Artifacts
- [ ] **Backups**: Attach `backups/*.zip` and corresponding `.sha256` files
- [ ] **Deployment Logs**: Attach `deploy-dryrun.log` and `migrate-dryrun.log`
- [ ] **Test Results**: Attach `postdeploy-smoketests.log` and `test_logging.log`
- [ ] **CI Artifacts**: Attach `premerge_artifacts/` CI bundle with links to CI runs
  - [ ] Ubuntu artifacts uploaded
  - [ ] macOS artifacts uploaded  
  - [ ] Windows artifacts uploaded
- [ ] **Monitor Logs**: Attach `monitor_logs/` from staging/canary dry-run (if available)

### 🚦 CI Status
- [ ] **Pre-merge validation**: Workflow succeeded and artifacts uploaded
- [ ] **Branch protection**: All required contexts configured and passing
- [ ] **All checks green**: No failing status checks

### 👥 Approvals
- [ ] **Review count**: ≥2 approvers obtained
- [ ] **Ops/SRE approval**: ≥1 Ops/SRE team member has approved
- [ ] **Deploy operator**: @ops has signed off for guarded merge
- [ ] **Security review**: Completed for security-related changes (if applicable)

### 🔐 Security & Integrity
- [ ] **Backup verification**: Latest backup SHA256 verifies locally
  ```bash
  sha256sum -c latest.zip.sha256
  ```
- [ ] **No secrets**: No hardcoded secrets or credentials in code
- [ ] **Dependencies**: No vulnerable dependencies introduced

### 📊 Quality Gates
- [ ] **Unit tests**: All tests passing
- [ ] **Golden tests**: Visual/audio regression tests passing
- [ ] **Smoke tests**: Post-deployment validation tests passing
- [ ] **Performance**: No significant performance regression detected

---

## 🚀 Merge & Deploy Instructions

**Only proceed when ALL checklist items above are complete and CI statuses are green.**

### Pre-merge Steps
1. **Rebase**: Rebase branch onto `main` if needed
2. **Final review**: Ensure all artifacts are attached and verified
3. **Communication**: Notify team in #deployments channel

### Merge Process
1. **Merge method**: Use "**Rebase and merge**" in GitHub UI (not squash or merge commit)
2. **Deploy notification**: Notify Deploy operator (@ops) immediately after merge
3. **Monitoring**: Start guarded rollout per [DEPLOYMENT_CHEAT_SHEET.md](./docs/deployment/DEPLOYMENT_CHEAT_SHEET.md)

### Post-merge Deploy Process
The Deploy operator will:
1. **Execute production deploy** using the attached backup file
2. **Monitor for T+60 minutes** as described in the operations runbook
3. **Verify all systems healthy** before marking deployment complete
4. **Rollback if needed** using the pre-deployment backup

---

## 🔄 Rollback Quick Commands (For Operator)

```bash
# Verify backup integrity
LATEST_BACKUP=$(ls -1 backups/dhash_*.zip | sort -r | head -n1)
sha256sum -c "${LATEST_BACKUP}.sha256"

# Execute rollback
./scripts/deploy/rollback_dhash.sh --backup "$LATEST_BACKUP" --env production

# Post-rollback verification
# Require 3 consecutive OK health checks and re-run smoke tests
for i in {1..3}; do
  echo "Health check $i/3..."
  curl -f https://api.mobius.com/health && echo "✓ OK" || echo "✗ FAIL"
  sleep 30
done
```

---

## 🏷️ Suggested Labels & Reviewers

### Labels
- `release-ready` - PR is ready for production deployment
- `deploy-framework` - Changes to deployment infrastructure
- `ops-action-required` - Requires ops team attention
- `breaking-change` - Contains breaking changes (if applicable)
- `hotfix` - Urgent production fix (if applicable)

### Reviewers
**Required reviewers:**
- [ ] `@ops` - Operations team (required for deploy sign-off)
- [ ] `@media-eng` - Media engineering team
- [ ] Current Ops/SRE on-call rotation

**Additional reviewers** (choose appropriate):
- `@frontend-team` - For UI/client changes
- `@backend-team` - For API/server changes
- `@security-team` - For security-related changes

---

## 📞 Emergency Contact Information

| Role | Primary Contact | Backup | Channel |
|------|----------------|---------|---------|
| Deploy Operator | @ops | @sre-oncall | #ops-oncall |
| SRE On-call | @sre-oncall | @eng-lead | #sre-escalation |
| Engineering Lead | @eng-lead | @cto | #engineering |

---

## ⚠️ Important Notes

- **DO NOT merge** until ALL checklist items are complete
- **DO NOT bypass** required status checks or approvals  
- **DO NOT deploy** outside of business hours without explicit approval
- **DO communicate** proactively in #deployments for visibility
- **DO monitor** the deployment closely for the full T+60 window
- **DO rollback** immediately if any issues are detected

---

## 📋 Artifact Attachment Checklist

When attaching artifacts to this PR, ensure you have:

```
📁 Required Files:
├── backups/
│   ├── dhash_production_YYYYMMDD_HHMMSS.zip
│   ├── dhash_production_YYYYMMDD_HHMMSS.zip.sha256
│   └── dhash_production_YYYYMMDD_HHMMSS.manifest
├── premerge_artifacts/
│   ├── deploy-dryrun.log
│   ├── migrate-dryrun.log
│   ├── postdeploy-smoketests.log
│   ├── test_logging.log
│   ├── premerge_summary.json
│   └── smoke-tests.xml
└── monitor_logs/ (if available)
    ├── monitor-staging-YYYYMMDD_HHMMSS.log
    └── metrics-staging-YYYYMMDD_HHMMSS.json
```

### Links to CI Runs
- [ ] Ubuntu CI run: [Link](https://github.com/w9bikze8u4cbupc/MOBIUS/actions)
- [ ] macOS CI run: [Link](https://github.com/w9bikze8u4cbupc/MOBIUS/actions)  
- [ ] Windows CI run: [Link](https://github.com/w9bikze8u4cbupc/MOBIUS/actions)

---

**🎯 Deployment Goal**: Safe, monitored release with immediate rollback capability

**⏱️ Timeline**: Allow 90+ minutes for complete deployment and monitoring cycle