# MOBIUS Verification Scripts PR Review Checklist

## Overview
This checklist helps reviewers systematically evaluate the MOBIUS verification scripts PR. Please check off items as they are verified.

## Code Review

### Core Verification Scripts
- [ ] `mobius-verify.sh` - Bash script functionality
- [ ] `mobius-verify.cmd` - Windows batch script functionality
- [ ] `mobius-verify.mjs` - Node.js orchestrator functionality

### Utility Scripts
- [ ] `scripts/kill-ports.sh` - Port killing (Unix)
- [ ] `scripts/kill-ports.ps1` - Port killing (Windows)
- [ ] `scripts/consolidate-mobius-folders.sh` - Folder consolidation (Unix)
- [ ] `scripts/consolidate-mobius-folders.ps1` - Folder consolidation (Windows)
- [ ] `scripts/run-full-verification.sh` - Full verification (Unix)
- [ ] `scripts/run-full-verification.ps1` - Full verification (Windows)

### Cross-Platform Compatibility
- [ ] All critical scripts provided in both .sh and .ps1 versions
- [ ] Scripts use appropriate platform-specific commands
- [ ] Error handling works on both platforms
- [ ] Logging works consistently on both platforms

### Security & Safety
- [ ] No hardcoded secrets or sensitive information
- [ ] Scripts properly handle process cleanup
- [ ] Port conflicts are handled gracefully
- [ ] Temporary files are cleaned up
- [ ] Scripts don't make destructive changes to system

## CI/CD Review

### GitHub Actions Workflow
- [ ] `.github/workflows/mobius-verify.yml` - Workflow syntax
- [ ] Workflow triggers correctly
- [ ] Dependencies are properly installed
- [ ] Verification steps execute successfully
- [ ] Logs are accessible
- [ ] Failure cases are handled

## Documentation Review

### Technical Documentation
- [ ] `MOBIUS_SCRIPTS_SUMMARY.md` - Accuracy and completeness
- [ ] `MOBIUS_VERIFICATION_READY.md` - Clarity and correctness
- [ ] `CHANGELOG.md` - Properly updated with changes

### Process Documentation
- [ ] `PR_CHECKLIST.md` - Completeness and accuracy
- [ ] `DEPLOYMENT_PLAYBOOK.md` - Clarity and completeness
- [ ] `TEAM_ANNOUNCEMENT.md` - Appropriateness for team communication

### Configuration
- [ ] `package.json` - Script definitions are correct
- [ ] New npm commands work as expected

## Functional Testing

### Local Verification
- [ ] Unix/Linux verification works
- [ ] Windows verification works
- [ ] Node.js verification works
- [ ] Health endpoints respond correctly
- [ ] Smoke tests execute successfully
- [ ] Process cleanup works properly
- [ ] Log files are created and populated

### CI Verification
- [ ] GitHub Actions workflow passes
- [ ] All platforms tested in CI
- [ ] Artifacts are accessible
- [ ] Error cases handled in CI

## Integration Review

### Port Configuration
- [ ] Frontend port (3000) correctly configured
- [ ] Backend port (5001) correctly configured
- [ ] Port conflicts handled properly

### Log Locations
- [ ] Unix log locations correct (/tmp/)
- [ ] Windows log locations correct (%TEMP%)
- [ ] Log format consistent and readable

### Error Handling
- [ ] Timeout handling for service startup
- [ ] Error messages are clear and helpful
- [ ] Graceful degradation when services fail

## Merge Readiness
- [ ] All checklist items completed
- [ ] No critical or high severity issues
- [ ] Documentation reviewed and approved
- [ ] Code reviewed and approved
- [ ] CI workflow passes
- [ ] Ready for merge to main branch

## Post-Merge Tasks (to be completed after merge)
- [ ] Delete feature branch
- [ ] Update developer onboarding documentation
- [ ] Announce to team
- [ ] Monitor CI for any issues