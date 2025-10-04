# Mobius Games Tutorial Generator - Operational Runbook

## Overview
This runbook contains operational procedures, troubleshooting guides, and maintenance tasks for the Mobius Games Tutorial Generator project.

## Branch Protection & CI Pipeline

### Current Configuration
- **Protected Branch:** `main`
- **Required Status Checks:** 6 contexts
  - `build-and-qa (macos-latest)`
  - `build-and-qa (ubuntu-latest)` 
  - `build-and-qa (windows-latest)`
  - `Golden checks (macos-latest)`
  - `Golden checks (ubuntu-latest)`
  - `Golden checks (windows-latest)`

### Critical Fixes Applied (2024-10-04)

#### 1. GitHub Actions Working Directory Fix
**Issue:** CI jobs were failing due to incorrect working directory configuration.

**Solution:** Updated `.github/workflows/ci.yml` to include `working-directory: client` for npm commands:
```yaml
- name: Install deps
  run: npm ci
  working-directory: client

- name: Build
  run: npm run build --if-present
  working-directory: client

- name: Unit tests
  run: npm test -- --ci --reporters=default
  working-directory: client
```

**Rationale:** The project structure has the Node.js application in the `client/` subdirectory, but the CI workflow was attempting to run npm commands from the repository root.

#### 2. Package-lock.json Restoration
**Issue:** Missing `package-lock.json` file causing dependency resolution inconsistencies.

**Solution:** Restored the `client/package-lock.json` file to ensure deterministic dependency installation.

**Rationale:** 
- Ensures consistent dependency versions across all environments
- Improves CI build reliability and performance
- Required for npm ci command to function properly
- Critical for reproducible builds in production

### Verification Artifacts
- **Verification Path:** `branch-protection-updates/20251004T131352Z/`
- **Merge Commit:** `8638dab2e9b7f45b807cf75c4fc0f933aab3f1a4d`
- **Protection Applied:** 2024-10-04T13:13:52Z

## Stabilization Monitoring

### 72-Hour Watch Period
- **Start:** 2024-10-04 (Post-rollout)
- **Duration:** 72 hours
- **End:** 2024-10-07
- **Status:** Active

### Monitoring Tools
1. **Automated Monitoring:** `.github/workflows/stabilization-monitor.yml`
   - Runs on every merge to main
   - Automatically detects anomalies
   - Creates issues for investigation

2. **Manual Logging:** 
   - `scripts/log-ci-health.sh` (Bash)
   - `scripts/log-ci-health.ps1` (PowerShell)
   - Log location: `stabilization-logs/ci-health-YYYYMMDD.log`

### Success Criteria
- ✅ All six CI contexts pass on every merge
- ✅ No flaky behavior or missing contexts
- ✅ No regressions in CI reliability
- ✅ Clean monitoring logs for full 72-hour period

## Troubleshooting

### CI Context Issues

#### Missing Contexts
**Symptoms:** Expected contexts not appearing in check runs
**Causes:**
- Workflow file changes
- Matrix job configuration changes
- GitHub Actions runner issues

**Resolution:**
1. Check workflow file syntax
2. Verify matrix configuration
3. Review GitHub Actions logs
4. Update branch protection if contexts changed

#### Failed Contexts
**Symptoms:** Contexts present but failing
**Causes:**
- Code issues
- Test failures
- Environment problems
- Dependency issues

**Resolution:**
1. Review CI logs for specific failures
2. Check for recent code changes
3. Verify dependencies and environment setup
4. Run tests locally to reproduce

#### Flaky Contexts
**Symptoms:** Intermittent failures without code changes
**Causes:**
- Network issues
- Resource constraints
- Timing issues
- External service dependencies

**Resolution:**
1. Identify patterns in failures
2. Add retry mechanisms if appropriate
3. Improve test stability
4. Consider infrastructure changes

### Emergency Procedures

#### Branch Protection Rollback
If critical issues arise during the stabilization period:

1. **Immediate Rollback:**
   ```bash
   # Using backup from branch-protection-updates/20251004T131352Z/
   curl -X PUT \
     -H "Authorization: Bearer $GITHUB_TOKEN" \
     -H "Accept: application/vnd.github+json" \
     -d @branch-protection-updates/20251004T131352Z/main-before.json \
     https://api.github.com/repos/OWNER/REPO/branches/main/protection
   ```

2. **Verify Rollback:**
   ```bash
   scripts/verify-token.sh
   ```

3. **Document Incident:**
   - Create incident report
   - Update stabilization logs
   - Plan remediation

#### Emergency Contacts
- **Primary:** Project maintainer
- **Secondary:** DevOps team
- **Escalation:** Technical lead

## Maintenance Tasks

### Daily (During Stabilization)
- [ ] Check stabilization logs for anomalies
- [ ] Review any automated issues created
- [ ] Verify CI health on recent merges

### Weekly
- [ ] Review branch protection settings
- [ ] Update documentation as needed
- [ ] Check for workflow updates

### Monthly
- [ ] Review and update runbook
- [ ] Audit security tokens
- [ ] Performance review of CI pipeline

## Automation Backlog

### Upcoming Priorities
1. **CI Log-Harvest Automation**
   - Automated collection and analysis of CI logs
   - Integration with monitoring dashboard
   - Alerting for anomalies

2. **Checklist Validator Integration**
   - Automated validation of operational checklists
   - Integration with CI pipeline
   - Compliance reporting

3. **End-to-End Traceability**
   - Complete audit trail from code to deployment
   - Automated documentation updates
   - Compliance and security reporting

### Implementation Timeline
- **Phase 1:** CI log-harvest automation (Next sprint)
- **Phase 2:** Checklist validator (Following sprint)
- **Phase 3:** Full traceability integration (Month 2)

## Security

### Token Management
- **Current Status:** PAT tokens used during rollout need revocation
- **Action Required:** Revoke temporary tokens post-stabilization
- **Audit Trail:** Document all token usage and revocation

### Access Control
- **Branch Protection:** Enforced on main branch
- **Required Reviews:** As per repository settings
- **Status Checks:** Six contexts required for merge

## References
- [Branch Protection Rollback Plan](../STRICTER_PROTECTION_ROLLBACK_PLAN.md)
- [Stabilization Logs](../stabilization-logs/)
- [Verification Artifacts](../branch-protection-updates/)

---
*Last Updated: 2024-10-04*
*Next Review: 2024-10-07 (Post-stabilization)*