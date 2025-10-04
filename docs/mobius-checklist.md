# Mobius Games Tutorial Generator - Operational Checklist

## Pre-Deployment Checklist

### Code Quality
- [ ] All tests passing locally
- [ ] Code review completed and approved
- [ ] No linting errors or warnings
- [ ] Documentation updated for changes
- [ ] Security scan completed (if applicable)

### CI/CD Pipeline
- [ ] All six CI contexts passing:
  - [ ] `build-and-qa (macos-latest)`
  - [ ] `build-and-qa (ubuntu-latest)` 
  - [ ] `build-and-qa (windows-latest)`
  - [ ] `Golden checks (macos-latest)`
  - [ ] `Golden checks (ubuntu-latest)`
  - [ ] `Golden checks (windows-latest)`
- [ ] Branch protection rules enforced
- [ ] No workflow file syntax errors
- [ ] Working directory correctly set to `client/` for npm commands

### Dependencies
- [ ] `package-lock.json` present and up-to-date
- [ ] No security vulnerabilities in dependencies
- [ ] All dependencies properly declared in `package.json`
- [ ] Node.js version compatibility verified

### Environment Setup
- [ ] FFmpeg available in CI environment
- [ ] Python 3.10 installed (Unix systems)
- [ ] All required environment variables set
- [ ] Artifact directories created properly

## Deployment Checklist

### Pre-Deployment
- [ ] Backup current branch protection settings
- [ ] Verify GitHub token permissions
- [ ] Confirm target branch and repository
- [ ] Review rollback plan
- [ ] Notify team of deployment window

### During Deployment
- [ ] Apply branch protection updates
- [ ] Verify protection settings applied correctly
- [ ] Test with sample merge/PR
- [ ] Monitor for immediate issues
- [ ] Document deployment artifacts

### Post-Deployment
- [ ] Verify all contexts working correctly
- [ ] Check first few CI runs post-deployment
- [ ] Update monitoring systems
- [ ] Begin stabilization watch period
- [ ] Document deployment completion

## Stabilization Period Checklist (72 Hours)

### Daily Tasks
- [ ] **Day 1:**
  - [ ] Check stabilization logs for anomalies
  - [ ] Verify automated monitoring is working
  - [ ] Review any issues created automatically
  - [ ] Test manual logging tools
  - [ ] Document any observations

- [ ] **Day 2:**
  - [ ] Review previous day's CI runs
  - [ ] Check for any flaky behavior
  - [ ] Verify all contexts still healthy
  - [ ] Update stakeholders on status
  - [ ] Address any minor issues

- [ ] **Day 3:**
  - [ ] Final health check of all contexts
  - [ ] Review complete stabilization logs
  - [ ] Prepare stabilization report
  - [ ] Plan transition to normal operations
  - [ ] Schedule post-stabilization review

### Anomaly Response
If anomalies detected:
- [ ] Investigate root cause immediately
- [ ] Document findings in stabilization logs
- [ ] Determine if rollback is necessary
- [ ] Apply targeted remediation
- [ ] Verify fix effectiveness
- [ ] Update monitoring if needed

## Security Checklist

### Token Management
- [ ] GitHub tokens have minimum required permissions
- [ ] Temporary tokens documented with expiration
- [ ] Token usage logged in audit trail
- [ ] Unused tokens revoked promptly
- [ ] Token rotation schedule maintained

### Access Control
- [ ] Branch protection enforced on main
- [ ] Required status checks configured
- [ ] Admin bypass restrictions in place
- [ ] Review requirements met
- [ ] Audit trail maintained

## Maintenance Checklist

### Weekly
- [ ] Review CI performance metrics
- [ ] Check for workflow updates needed
- [ ] Verify branch protection settings
- [ ] Update documentation as needed
- [ ] Review security alerts

### Monthly
- [ ] Audit token usage and permissions
- [ ] Review and update operational procedures
- [ ] Performance analysis of CI pipeline
- [ ] Update emergency contact information
- [ ] Review automation backlog priorities

### Quarterly
- [ ] Comprehensive security review
- [ ] Update disaster recovery procedures
- [ ] Review and test rollback procedures
- [ ] Update team training materials
- [ ] Evaluate new tools and improvements

## Troubleshooting Checklist

### CI Context Failures
- [ ] Check GitHub Actions logs for errors
- [ ] Verify workflow file syntax
- [ ] Confirm working directory settings (`client/`)
- [ ] Check dependency installation (`package-lock.json`)
- [ ] Verify environment setup (FFmpeg, Python)
- [ ] Test locally to reproduce issue
- [ ] Check for recent code changes
- [ ] Review external service dependencies

### Branch Protection Issues
- [ ] Verify GitHub token permissions
- [ ] Check API rate limits
- [ ] Confirm repository and branch names
- [ ] Review protection rule configuration
- [ ] Test with sample PR/merge
- [ ] Check for conflicting settings
- [ ] Verify admin access if needed

### Performance Issues
- [ ] Check CI run duration trends
- [ ] Review resource usage patterns
- [ ] Identify bottlenecks in pipeline
- [ ] Consider parallel execution improvements
- [ ] Review caching strategies
- [ ] Monitor external service performance

## Emergency Procedures

### Critical Failure Response
1. [ ] **Immediate Assessment**
   - [ ] Identify scope of impact
   - [ ] Determine if rollback needed
   - [ ] Notify stakeholders
   - [ ] Document incident start

2. [ ] **Rollback (if required)**
   - [ ] Execute rollback procedure
   - [ ] Verify rollback success
   - [ ] Test basic functionality
   - [ ] Update monitoring systems

3. [ ] **Investigation**
   - [ ] Collect relevant logs and data
   - [ ] Identify root cause
   - [ ] Document findings
   - [ ] Plan remediation

4. [ ] **Recovery**
   - [ ] Implement fix
   - [ ] Test thoroughly
   - [ ] Gradual re-deployment
   - [ ] Monitor closely

5. [ ] **Post-Incident**
   - [ ] Complete incident report
   - [ ] Update procedures
   - [ ] Team debrief
   - [ ] Implement preventive measures

## Automation Integration

### Current Status
- [x] Stabilization monitoring workflow deployed
- [x] Manual logging tools available
- [x] Automated issue creation for anomalies
- [ ] CI log-harvest automation (Planned)
- [ ] Checklist validator integration (Planned)
- [ ] End-to-end traceability (Planned)

### Next Steps
- [ ] Implement CI log-harvest automation
- [ ] Integrate checklist validator with CI
- [ ] Develop compliance reporting
- [ ] Create monitoring dashboard
- [ ] Automate routine maintenance tasks

## Key Artifacts

### Documentation
- [ ] Operational runbook updated
- [ ] Rollback plan accessible
- [ ] Emergency procedures documented
- [ ] Contact information current

### Verification
- [ ] Verification artifacts stored: `branch-protection-updates/20251004T131352Z/`
- [ ] Merge commit documented: `8638dab2e9b7f45b807cf75c4fc0f933aab3f1a4d`
- [ ] Stabilization logs maintained: `stabilization-logs/`
- [ ] Audit trail complete

### Scripts and Tools
- [ ] Branch protection scripts tested
- [ ] Token verification tools available
- [ ] Logging scripts functional
- [ ] Rollback procedures tested

---

## Checklist Completion

**Deployment Date:** ________________  
**Completed By:** ________________  
**Reviewed By:** ________________  
**Stabilization End Date:** ________________  
**Final Sign-off:** ________________  

**Notes:**
_Use this space to document any deviations from the checklist, issues encountered, or additional steps taken._

---
*Checklist Version: 1.0*  
*Last Updated: 2024-10-04*  
*Next Review: Post-stabilization (2024-10-07)*