# MOBIUS Deployment Checklist

## Pre-Merge Requirements

### CI/CD Status
- [ ] CI matrix green on all platforms (Ubuntu/macOS/Windows)
- [ ] ESLint job completed with artifacts uploaded
- [ ] All unit tests passing
- [ ] Golden file validation passing
- [ ] Security scan completed (if applicable)

### Code Quality Gates
- [ ] ESLint warnings reviewed and documented
- [ ] No critical TODOs in production code paths
- [ ] Code coverage meets minimum threshold
- [ ] Peer review completed with 2+ approvals including Ops/SRE

### Backup and Safety
- [ ] **CRITICAL**: Backup created using `scripts/backup_library.sh`
- [ ] Backup SHA256 checksum verified
- [ ] Rollback plan documented and tested
- [ ] Previous deployment artifacts preserved

### Testing and Validation
- [ ] Deploy dry-run completed: `scripts/deploy_dhash.sh --dry-run`
- [ ] Dry-run logs attached to deployment issue/PR
- [ ] Smoke tests passing in staging environment
- [ ] Performance regression testing completed

## Deployment Process

### Pre-Deployment (T-60 minutes)
- [ ] **Deployment window confirmed**: 60 minutes off-peak (23:00-00:00 UTC)
- [ ] **Release owner present**: PR author available
- [ ] **Deploy operator confirmed**: Ops on-call present  
- [ ] **Media engineer on standby**: media-eng team member available
- [ ] **Triage team ready**: on-call + PR author

### Environment Preparation
- [ ] Target environment health checked (`curl /health`)
- [ ] Current metrics baseline captured (`curl /metrics/dhash`)
- [ ] Log monitoring alerts temporarily adjusted
- [ ] Rollback scripts tested and ready

### Deployment Execution
1. **Create backup** (T-15 min)
   ```bash
   ./scripts/backup_library.sh
   # Verify backup integrity and record checksum
   ```

2. **Deploy application** (T-10 min)
   ```bash
   ./scripts/deploy_dhash.sh --env production
   ```

3. **Health verification** (T+5 min)
   ```bash
   curl -f http://localhost:5001/health
   curl -f http://localhost:5001/metrics/dhash
   ```

4. **Smoke tests** (T+10 min)
   - [ ] Upload and process sample media file
   - [ ] Verify golden file generation
   - [ ] Check audio processing pipeline
   - [ ] Validate log output format

## Post-Deployment Monitoring

### Immediate Checks (T+15 min)
- [ ] `/health` endpoint responding normally
- [ ] `/metrics/dhash` showing expected values
- [ ] Error rate < 1% (from metrics)
- [ ] Response time p95 within baseline +20%

### Golden File Validation (T+30 min)
- [ ] Run full golden file test suite
- [ ] Verify extraction_failures_rate normal
- [ ] Check p95_hash_time within acceptable range
- [ ] Validate container format compliance

### System Health (T+45 min)
- [ ] CPU usage stable and within normal range
- [ ] Memory usage not increasing (no leaks)
- [ ] Disk space sufficient for operations
- [ ] Log rotation functioning correctly

## Rollback Triggers

**Automatic rollback if any of the following occur:**

### Critical Failures
- [ ] `/health` endpoint fails for >5 minutes
- [ ] Core error rate >5% sustained for >2 minutes
- [ ] extraction_failures_rate >3x baseline
- [ ] p95_hash_time regression >50% from baseline

### Performance Degradation
- [ ] Response time p95 >2x baseline for >10 minutes
- [ ] Memory usage growth >100MB/hour sustained
- [ ] Disk space critically low (<1GB available)

### Functional Issues
- [ ] Smoke tests failing consistently
- [ ] Golden file validation errors >10% of samples
- [ ] Media processing pipeline stalled

## Rollback Procedure

**If rollback is triggered:**

1. **Immediate action**
   ```bash
   ./scripts/rollback_dhash.sh --backup [LATEST_BACKUP] --yes
   ```

2. **Verification**
   - [ ] Health endpoints responding
   - [ ] Error rates returned to baseline
   - [ ] Functionality restored

3. **Communication**
   - [ ] Notify on-call team via Slack/PagerDuty
   - [ ] Update incident tracking system
   - [ ] Document rollback reason and timeline

## Success Criteria

Deployment is considered successful when:
- [ ] All health checks pass for 15+ minutes
- [ ] Error rates remain <1% for 30+ minutes  
- [ ] Performance metrics within acceptable ranges
- [ ] Smoke tests consistently pass
- [ ] No critical alerts triggered

## Team Contacts

| Role | Contact | Backup |
|------|---------|---------|
| Release Owner | PR Author | Tech Lead |
| Deploy Operator | Ops On-Call | DevOps Manager |
| Media Engineer | @media-eng | Senior Media Engineer |
| Triage Lead | On-Call Engineer | Engineering Manager |

## Emergency Contacts

- **Critical Issues**: On-call rotation (PagerDuty)
- **Infrastructure**: SRE team lead
- **Product Owner**: Product team slack channel

---
**Template Usage**: Copy this checklist for each deployment and track completion status.
**Last Updated**: $(date)
**Next Review**: Monthly deployment retrospective