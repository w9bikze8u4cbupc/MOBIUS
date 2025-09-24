# 🚀 Production Deployment Checklist

## Pre-merge Verification (Required)

### ✅ CI/CD Verification
- [ ] **CI Pipeline Status**: All checks green on release branch
  - [ ] Linux build and tests passing
  - [ ] macOS build and tests passing  
  - [ ] Windows build and tests passing
  - [ ] Sandbox/timeout tests completed
- [ ] **Golden Tests**: All video/audio regression tests pass
  ```bash
  npm run golden:check
  npm run golden:check:all
  ```
- [ ] **JUnit Test Reports**: Generate test reports for CI artifacts
  ```bash
  npm run golden:check:junit
  ```

### 🔒 Backup & Safety
- [ ] **Create Timestamped Backup**
  ```bash
  # Create backup (implement backup:create script)
  npm run backup:create
  ```
- [ ] **Verify Backup Integrity** (SHA256)
  ```bash
  # Verify backup (implement backup:verify script)
  npm run backup:verify
  ```
- [ ] **Migration Dry-Run** on production-like snapshot
  ```bash
  # Deploy dry-run (implement deploy scripts)
  ./scripts/deploy_dhash.sh --dry-run --verbose
  npm run deploy:dhash:dry-run
  ```
- [ ] **Migration Logs**: Attach dry-run logs as CI artifacts
- [ ] **Scripts Executable**: Confirm all deployment scripts have proper permissions
  ```bash
  chmod +x scripts/*.sh
  find scripts/ -name "*.js" -exec chmod +x {} \;
  ```

### 🏥 Health Checks
- [ ] **API Server Health**: Ensure API server starts and responds
  ```bash
  # Start API server (from src/api/)
  cd src/api && node index.js &
  sleep 5
  curl http://localhost:5001/health || echo "Health endpoint not implemented"
  ```
- [ ] **Metrics Validation**: Check metrics endpoints if available
  ```bash
  curl http://localhost:5001/metrics/dhash || echo "Metrics endpoint not implemented"
  ```
- [ ] **Low-Confidence Queue Export**: Review sample data (implement if needed)
  ```bash
  # npm run lcm:export (to be implemented)
  echo "Low-confidence queue export - implement if needed"
  ```

### 📋 Operations Readiness
- [ ] **Maintenance Window**: Scheduled and ops team notified
- [ ] **On-Call Team**: Alerted and briefed on deployment
- [ ] **Rollback Plan**: Verified and tested

---

## Deployment Commands

### 🔍 Preview (Dry-Run)
```bash
# Test pipeline without deployment
npm run test-pipeline

# Verify video generation pipeline
npm run verify

# Generate shotlists for testing
npm run gen:shotlists
```

### 🚀 Full Deployment
```bash
# Full pipeline execution
npm run compile-shotlist
npm run bind-alignment
npm run render

# Generate proxy/preview renders
npm run render:proxy

# Full deployment with all safety checks
npm run deploy:dhash
```

### 💾 Backup Operations
```bash
# Create backup
npm run backup:create

# List available backups
npm run backup:list

# Verify specific backup
npm run backup:verify <backup_file>

# Restore from backup (use backup_library.sh directly)
./scripts/backup_library.sh restore <backup_file>
```

### 🔄 Emergency Rollback
```bash
# Rollback to previous golden state
npm run golden:approve

# Manual rollback (with confirmation)
npm run rollback

# Force rollback (no confirmation)
npm run rollback:force

# Rollback to specific backup
./scripts/rollback_dhash.sh --to-backup <backup_file>
```

---

## Post-Deployment Verification (First 30-60 minutes)

### 🩺 Immediate Health Checks
- [ ] **Application Health**
  ```bash
  curl http://localhost:5001/health
  ```
- [ ] **Metrics Endpoint**
  ```bash
  curl http://localhost:5001/metrics/dhash
  ```

### 🧪 Smoke Tests
- [ ] **Automated Smoke Tests**
  ```bash
  npm run smoke:test
  ```
- [ ] **Manual Smoke Test**
  ```bash
  ./scripts/simple_smoke_test.sh -u http://localhost:5001
  ```

### 📊 Performance Monitoring
- [ ] **Hash Performance**: avg_hash_time < 200ms
- [ ] **P95 Performance**: p95_hash_time < 500ms  
- [ ] **Error Rates**: extraction_failures_rate < 5%
- [ ] **Queue Health**: low_confidence_queue_length within baseline + 50%

### 🔍 Sample Validation
- [ ] **API Sample Matches**: Verify known-good images via API
- [ ] **Log Review**: Check for unexpected errors or warnings
- [ ] **Extraction Accuracy**: Monitor extraction_failure_rate

### 🚨 Monitoring Thresholds (Configure Alerts)
```yaml
avg_hash_time: > 200ms          # ALERT
p95_hash_time: > 500ms          # ALERT  
extraction_failures_rate: > 5%  # ALERT
low_confidence_queue_length: > baseline + 50%  # ALERT
```

---

## 🛡️ Rollback Criteria

**Rollback immediately if any of these occur:**

- [ ] Health checks fail consistently for > 5 minutes
- [ ] Error rates exceed 10% for > 2 minutes
- [ ] Performance degradation > 50% from baseline
- [ ] Critical functionality broken
- [ ] Data corruption detected

### Emergency Contacts
- **On-Call Engineer**: [Contact Info]
- **DevOps Team**: [Contact Info]  
- **Product Owner**: [Contact Info]

---

## 📝 Post-Deployment Report

After successful deployment, update this section:

**Deployment Time**: `[YYYY-MM-DD HH:MM UTC]`
**Deployed By**: `[Name]`
**Version/Commit**: `[SHA]`

### Metrics After 1 Hour:
- **avg_hash_time**: `___ms`
- **p95_hash_time**: `___ms`  
- **extraction_failures_rate**: `___%`
- **low_confidence_queue_length**: `___`

### Issues Encountered:
- [ ] None
- [ ] Minor issues (list below)
- [ ] Major issues (escalated)

**Notes**: 
_Add any deployment notes, issues encountered, or lessons learned_

---

## 🔄 Continuous Improvement

### Future Enhancements to Consider:
- [ ] **Canary Rollout**: Deploy to subset of components first
- [ ] **Automated Backup Pruning**: Confirm retention policy (keep last 10)
- [ ] **Backup Restore Testing**: Automated periodic restore validation
- [ ] **CI Artifact Preservation**: Save dry-run logs for audit
- [ ] **Windows Deployment Docs**: Complete Chocolatey steps if needed

---

**✅ Deployment Complete**: All checks passed, system healthy, monitoring active