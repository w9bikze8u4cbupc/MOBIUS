# DHash Production Rollout - Merge Checklist

Use this checklist template in your Pull Request to ensure safe deployment.

## Pre-Merge Validation ✅

### CI/CD Checks
- [ ] **CI green on release branch** - Linux/macOS/Windows matrix tests passing
- [ ] **Sandbox tests completed** - All timeout and edge case tests pass
- [ ] **Golden file tests pass** - Regression tests for video processing pipeline
- [ ] **DHash unit tests pass** - Core functionality validated (npm run test)

### Migration Preparation  
- [ ] **Migration dry-run completed** and logs reviewed
  ```bash
  npm run migrate:dry-run -i library.json --out migrate-dryrun.json
  # Review migrate-dryrun.json for issues
  ```
- [ ] **Backup created and verified** with checksum validation
  ```bash
  cp library.json library.json.bak.$(date -u +"%Y%m%dT%H%M%SZ")
  sha256sum library.json.bak.* > library.json.bak.*.sha256
  ```
- [ ] **Migration runbook included** in PR (docs/MIGRATION_RUNBOOK.md)

### Cross-Platform Compatibility
- [ ] **Windows FFmpeg compatibility** - poppler/winget install tested in CI
- [ ] **macOS compatibility verified** - Homebrew FFmpeg working
- [ ] **Linux compatibility verified** - apt-get FFmpeg working

### Monitoring and Observability
- [ ] **Monitoring & alerts enabled** for key metrics:
  - [ ] `avg_hash_time` - Average DHash generation time 
  - [ ] `p95_hash_time` - 95th percentile response time
  - [ ] `extraction_failures_rate` - Hash generation failure rate
  - [ ] `low_confidence_queue_length` - Manual review queue size
- [ ] **Health check endpoints** updated to include DHash status
- [ ] **Log aggregation** configured for migration events

### Queue Management Validation
- [ ] **Low-confidence queue export validated**
  ```bash
  npm run lcm:export -i test-library.json --dry-run
  ```
- [ ] **Low-confidence queue import tested**
  ```bash
  npm run lcm:import --validate-only -q test-queue.json
  ```
- [ ] **Manual review interface** tested (HTML export format)

### Documentation and Communication  
- [ ] **Operations team notified** of maintenance window
- [ ] **On-call engineer briefed** on rollback procedures
- [ ] **Deployment checklist** reviewed with team
- [ ] **Post-deploy smoke tests documented** and ready to execute

---

## Post-Merge Deployment Steps 🚀

### Phase 1: Pre-Deployment
1. **Create production backup**
   ```bash
   BACKUP_FILE="library.json.bak.$(date -u +"%Y%m%dT%H%M%SZ")"
   cp library.json "$BACKUP_FILE"
   sha256sum "$BACKUP_FILE" > "$BACKUP_FILE.sha256"
   ```

2. **Final dry-run validation**
   ```bash
   npm run migrate:dry-run -i library.json --batch-size 100
   ```

### Phase 2: Migration Execution
3. **Run migration** (maintenance window recommended)
   ```bash
   npm run migrate:dhash -i library.json -o library.dhash.json --backup
   ```

4. **Validate migration results**
   ```bash
   # Check success rate and error count
   node -e "
   const lib = JSON.parse(require('fs').readFileSync('library.dhash.json', 'utf8'));
   console.log('Success rate:', lib.dhash_migration.processed_successfully / lib.dhash_migration.total_images);
   console.log('Errors:', lib.dhash_migration.processing_errors);
   "
   ```

### Phase 3: Deployment
5. **Deploy atomically**
   ```bash
   mv library.json library.json.pre-dhash
   mv library.dhash.json library.json
   ```

6. **Restart services** (rolling restart preferred)
   ```bash
   # systemctl restart mobius-service
   # docker restart mobius-container  
   # pm2 restart mobius-app
   ```

### Phase 4: Post-Deploy Verification (10-30 min)
7. **Health checks**
   ```bash
   curl -sS http://localhost:5001/health | jq .
   ```

8. **Smoke test DHash functionality**
   ```bash
   node -e "
   const { DHashProcessor } = require('./src/dhash.js');
   const processor = new DHashProcessor();
   console.log('DHash processor test:', 'PASSED');
   "
   ```

9. **Export and review low-confidence queue**
   ```bash
   npm run lcm:export -i library.json -o post-deploy-queue.json
   ```

10. **Monitor key metrics** for 30-60 minutes:
    - Average hash generation time < 50ms
    - 95th percentile time < 200ms  
    - Error rate < 1%
    - Queue length stable

---

## Emergency Rollback Procedure ⚠️

If critical issues are observed:

### Quick Rollback (< 5 minutes)
```bash
# Find latest backup
BACKUP_FILE=$(ls library.json.bak.* | sort | tail -1)

# Restore library
cp "$BACKUP_FILE" library.json

# Restart services
# systemctl restart mobius-service

# Verify rollback
node -e "
const lib = JSON.parse(require('fs').readFileSync('library.json', 'utf8'));
console.log('DHash data present:', lib.images.filter(img => img.dhash).length > 0);
"
```

### Controlled Rollback
```bash
npm run migrate:rollback -i library.json --list-backups
npm run migrate:rollback -i library.json -b library.json.bak.TIMESTAMP
```

---

## Risk Assessment and Mitigation 🛡️

### High Risk Scenarios
- **Mass processing failures** → Batch size tuning + parallel processing limits
- **Out of memory during migration** → Reduce batch size, monitor memory usage  
- **Corrupted library file** → Multiple backup layers + checksum validation
- **FFmpeg version incompatibility** → CI matrix testing across platforms

### Medium Risk Scenarios  
- **High duplicate detection rate** → Manual review queue for validation
- **Performance degradation** → Rollback trigger thresholds + monitoring
- **Disk space exhaustion** → Disk space checks in deployment script

### Low Risk Scenarios
- **Individual image processing failures** → Error logging + skip mechanism
- **Network timeouts** → Retry logic + timeout configuration

---

## Success Criteria 📊

### Functional Requirements
- [ ] **Migration completes** with >95% success rate
- [ ] **DHash generation works** for new images
- [ ] **Duplicate detection active** and producing results
- [ ] **Low-confidence queue** properly populated
- [ ] **Rollback procedures tested** and functional

### Performance Requirements  
- [ ] **Hash generation time** < 50ms average, < 200ms p95
- [ ] **Memory usage stable** during batch processing  
- [ ] **Error rate** < 1% for image processing
- [ ] **System responsiveness** maintained during migration

### Operational Requirements
- [ ] **Monitoring dashboards** showing DHash metrics
- [ ] **Alerting rules** configured and tested
- [ ] **Log aggregation** capturing migration events
- [ ] **Documentation updated** for operational procedures

---

## Sign-Off ✍️

- [ ] **Tech Lead Review** - Architecture and implementation approved
- [ ] **QA Sign-Off** - Testing completed and passed  
- [ ] **DevOps Review** - Deployment procedures validated
- [ ] **Product Owner** - Feature requirements met
- [ ] **Security Review** - No security concerns identified

**Deployment Window:** [DATE/TIME]  
**Rollback Decision Point:** 60 minutes post-deployment  
**Full Success Validation:** 24 hours post-deployment

---

*Copy this checklist into your PR description and check off items as they are completed. Do not merge until all items in the "Pre-Merge Validation" section are checked.*