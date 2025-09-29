# GENESIS RAG Release Checklist

## Purpose
Operator/security/ops checklist to validate the GENESIS RAG release before cut.

## Release Information
- **Release Version**: [TO BE FILLED]
- **Target Release Date**: [TO BE FILLED]
- **Release Manager**: [TO BE FILLED]

## Pre-Release Validation Checklist

### Operator Validation
- [ ] **Dry-run executed and artifacts attached** under `operator_verification/`
  - [ ] Run: `./scripts/operator_full_verify.sh --mode dryrun`
  - [ ] Verify artifacts generated in `operator_verification/` directory
  - [ ] Attach artifacts to PR as evidence

### Development & Testing
- [ ] **Health & readiness smoke-tests passed** (local/CI)
  - [ ] All unit tests passing
  - [ ] Integration tests passing
  - [ ] End-to-end tests completed successfully
  - [ ] Performance benchmarks within acceptable ranges

### Security Review
- [ ] **Image scan & vulnerability report attached**
  - [ ] Container image security scan completed
  - [ ] No critical vulnerabilities found
  - [ ] Vulnerability report attached to PR
- [ ] **Secrets & config review completed** (no production secrets in CI)
  - [ ] No hardcoded secrets in codebase
  - [ ] Environment variables properly configured
  - [ ] Secret management system properly integrated
- [ ] **Non-root image runtime and file permissions validated**
  - [ ] Container runs as non-root user
  - [ ] File permissions follow security best practices
  - [ ] Runtime security policies enforced

### Operations Readiness
- [ ] **Ops runbook updated and verified**
  - [ ] Deployment procedures documented
  - [ ] Monitoring and alerting configured
  - [ ] Logging properly implemented
  - [ ] Health check endpoints functional
- [ ] **Rollback steps verified and feasible**
  - [ ] Rollback procedures tested
  - [ ] Database migration rollback tested (if applicable)
  - [ ] Backup and restore procedures validated

### Final Approvals
- [ ] **Final approval from Security**
  - Security team lead: [NAME] ✓ Date: [DATE]
- [ ] **Final approval from Director**
  - Director: [NAME] ✓ Date: [DATE]

## Verification Commands

### Operator Dry-Run
```bash
./scripts/operator_full_verify.sh --mode dryrun
```

### Check Artifacts
```bash
ls -la operator_verification/
```

## Sign-off

### Operator Team
- Name: _________________________ Date: _____________
- Signature: _____________________

### Security Team
- Name: _________________________ Date: _____________
- Signature: _____________________

### Operations Team
- Name: _________________________ Date: _____________
- Signature: _____________________

### Release Director
- Name: _________________________ Date: _____________
- Signature: _____________________

---

**Notes**: 
- All checkboxes must be completed before release approval
- Attach all verification artifacts to the corresponding PR
- This checklist should be completed and reviewed before any production deployment
- Contact the release manager if any blockers are encountered

**Emergency Contact**: [TO BE FILLED]
**Slack Channel**: #genesis-rag-release