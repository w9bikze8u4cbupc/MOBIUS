# PR Merge Checklist

This document outlines the step-by-step process for merging pull requests with timeframes and approval requirements.

## Pre-merge Requirements

### Automated Validation ✅
- [ ] **Pre-merge validation workflow passes** (5-10 minutes)
  - Backup creation and verification
  - Smoke tests (health, metrics, API)
  - Database migration testing
  - Deployment dry-run validation
  - Logging system validation
  - LCM export functionality

### Code Review Requirements ✅
- [ ] **At least 2 approving reviews** from team members
- [ ] **No unresolved conversations** or change requests
- [ ] **All CI checks passing** (including golden tests)

## Merge Process Timeline

### Phase 1: Pre-merge Validation (5-10 minutes)
1. **Automated Backup Creation**
   - Creates verified ZIP backup with SHA256 checksum
   - Includes metadata and system information
   - Validates backup integrity

2. **Health and Smoke Testing**
   - Tests application health endpoints
   - Validates metrics collection
   - Performs API endpoint verification
   - Runs performance benchmarks

3. **Database Migration Validation**
   - Simulates pending migrations
   - Validates migration scripts
   - Creates migration backup

4. **Deployment Testing**
   - Runs deployment dry-run
   - Validates configuration
   - Tests rollback procedures

### Phase 2: Manual Review (Variable)
1. **Code Review Process**
   - Technical review by team lead
   - Architecture review (if needed)
   - Security review (for sensitive changes)

2. **Documentation Review**
   - README updates
   - API documentation
   - Deployment guides

### Phase 3: Merge and Deploy (10-15 minutes)
1. **Branch Protection Validation**
   - All status checks pass
   - Required reviews completed
   - Branch up-to-date with main

2. **Merge Execution**
   - Use "Squash and merge" for feature branches
   - Use "Merge commit" for release branches
   - Update merge commit message with PR summary

3. **Post-merge Monitoring**
   - Automatic deployment to staging
   - Health monitoring for 60 minutes
   - Metrics threshold validation

## Emergency Procedures

### Fast-track Merge (Critical Hotfixes)
1. **Requirements:**
   - Label PR with `hotfix` or `critical`
   - One approving review (must be maintainer)
   - Basic smoke tests pass

2. **Process:**
   - Skip extended validation
   - Direct merge to main
   - Immediate production deployment
   - Enhanced monitoring (24 hours)

### Rollback Procedures
1. **Automatic Rollback Triggers:**
   - Health check failures (3 consecutive)
   - Metrics threshold violations
   - Critical error rates above baseline

2. **Manual Rollback:**
   ```bash
   # Emergency rollback
   ./scripts/rollback_dhash.sh --env production --no-dry-run --force
   ```

## Branch Protection Configuration

### Required Status Checks
- `CI / build-and-qa`
- `premerge-validation / backup-and-smoke`
- `premerge-validation / deploy-test`
- `premerge-validation / validation-summary`

### Protection Rules
- Require pull request reviews: **2**
- Dismiss stale reviews when new commits are pushed
- Require review from code owners
- Restrict pushes that create files larger than 100MB
- Require branches to be up to date before merging

## Troubleshooting

### Common Issues

**Pre-merge validation fails:**
- Check artifact logs in GitHub Actions
- Review backup creation logs
- Validate environment configuration

**Merge blocked despite passing checks:**
- Verify all required reviewers approved
- Check branch is up-to-date with main
- Ensure no draft status

**Post-merge monitoring alerts:**
- Check health endpoints manually
- Review metrics for anomalies
- Consider immediate rollback if critical

### Support Contacts
- **DevOps Lead:** For deployment issues
- **Tech Lead:** For code review questions  
- **On-call Engineer:** For critical production issues

## Metrics and SLAs

### Target Timeframes
- Pre-merge validation: < 10 minutes
- Code review (simple changes): < 2 hours
- Code review (complex changes): < 1 business day
- Emergency hotfix: < 30 minutes

### Success Metrics
- Merge success rate: > 95%
- Rollback rate: < 5%
- Time to resolution (P1 issues): < 1 hour
- Automated test coverage: > 80%

---

*Last updated: December 2024*
*Next review: January 2025*