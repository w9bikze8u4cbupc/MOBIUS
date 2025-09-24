# MOBIUS DHash Migration - PR Merge Checklist

## Pre-Merge Validation

### ✅ Code Review & Quality
- [ ] Code reviewed by at least two team members
- [ ] All conversations resolved
- [ ] No merge conflicts present
- [ ] Branch is up to date with target branch

### ✅ Testing & CI
- [ ] All CI checks are green (Linux/macOS/Windows matrix)
- [ ] Unit tests pass locally and in CI
- [ ] Integration tests complete successfully
- [ ] Golden file tests pass for all supported platforms
- [ ] Timeout and sandbox tests complete

### ✅ Deployment Infrastructure
- [ ] Deployment scripts are executable (`chmod +x scripts/*.sh`)
- [ ] Backup system tested with sample data
- [ ] Dry-run migration completes successfully
- [ ] Rollback mechanism verified with test data
- [ ] Health endpoints responding on staging
- [ ] Metrics endpoints providing valid data

### ✅ Documentation
- [ ] DEPLOYMENT_COMPLETE.md updated with current procedures
- [ ] README.md reflects new deployment capabilities
- [ ] Inline code comments added for complex logic
- [ ] API endpoints documented if modified

### ✅ Security & Permissions
- [ ] Deployment scripts follow least-privilege principles
- [ ] No secrets or credentials committed to repository
- [ ] File permissions set correctly (640 for data, 750 for scripts)
- [ ] CI permissions limited to necessary operations

### ✅ Pre-Deploy Sanity Checklist
- [ ] Backup accessibility verified:
  ```bash
  cp library.json library.json.bak.$(date -u +"%Y%m%dT%H%M%SZ")
  sha256sum library.json*
  ```
- [ ] Local dry-run completed successfully:
  ```bash
  ./scripts/deploy_dhash.sh --dry-run
  ```
- [ ] Health endpoints validated on staging:
  ```bash
  curl -f http://staging.example.com:5001/health
  curl -f http://staging.example.com:5001/metrics/dhash
  ```
- [ ] Low-confidence queue exported and reviewed:
  ```bash
  npm run lcm:export -- --include-images --format html
  ```
- [ ] Maintenance window scheduled and stakeholders notified

### ✅ Migration Readiness
- [ ] Database migrations tested in staging environment
- [ ] Rollback procedures validated
- [ ] Monitoring alerts configured for post-deployment
- [ ] Performance benchmarks established for comparison
- [ ] Smoke test suite passes locally

### ✅ Post-Merge Actions
- [ ] Deploy to staging environment
- [ ] Run comprehensive smoke tests on staging
- [ ] Validate performance metrics within expected ranges:
  - avg_hash_time < 50ms
  - p95_hash_time < 200ms
  - extraction_failures_rate < 5%
- [ ] Monitor deployment for 30-60 minutes
- [ ] Update production deployment schedule
- [ ] Notify operations team of successful staging deployment

## Emergency Procedures

### 🚨 If Issues Are Found
- [ ] Stop the merge process immediately
- [ ] Document the issue in detail
- [ ] Revert to last known good state if necessary
- [ ] Fix issues in feature branch
- [ ] Re-run full validation checklist

### 🚨 Rollback Plan
If issues are discovered post-merge:
1. **Immediate Response**: Execute rollback script
   ```bash
   ./scripts/rollback_dhash.sh --force
   ```
2. **Verification**: Run smoke tests to confirm system stability
   ```bash
   npm run smoke-test:quiet
   ```
3. **Investigation**: Preserve logs and artifacts for root cause analysis
4. **Communication**: Notify stakeholders of rollback and timeline for fix

## Approval Sign-offs

### Technical Review
- [ ] **Backend Developer**: _________________ Date: _________
- [ ] **DevOps Engineer**: _________________ Date: _________
- [ ] **QA Engineer**: _________________ Date: _________

### Business Approval
- [ ] **Product Owner**: _________________ Date: _________
- [ ] **Release Manager**: _________________ Date: _________

---

**Merge Authorized By**: _________________ **Date**: _________ **Time**: _________

**Production Deployment Scheduled For**: _________ **Approved By**: _________

---

*This checklist ensures that dhash migration deployments follow established best practices for safety, reliability, and quick recovery. All items must be checked before merge approval.*