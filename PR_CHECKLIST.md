# PR Checklist: Add cross-platform MOBIUS verification scripts + GitHub Actions workflow

## PR Details
- **Branch**: feature/mobius-verification-scripts
- **Target**: main
- **Title**: Add cross-platform MOBIUS verification scripts + GitHub Actions workflow
- **Labels**: chore, ci

## Files to Include in PR

### Verification Scripts
- [ ] mobius-verify.sh
- [ ] mobius-verify.cmd
- [ ] mobius-verify.mjs

### Utility Scripts
- [ ] scripts/kill-ports.sh
- [ ] scripts/kill-ports.ps1
- [ ] scripts/consolidate-mobius-folders.sh
- [ ] scripts/consolidate-mobius-folders.ps1

### CI/CD Workflow
- [ ] .github/workflows/mobius-verify.yml

### Documentation
- [ ] MOBIUS_SCRIPTS_SUMMARY.md
- [ ] MOBIUS_VERIFICATION_READY.md
- [ ] CHANGELOG.md

### Configuration Updates
- [ ] package.json (updated scripts section)

## Quality Assurance Checklist

### Build & Test Verification
- [ ] Branch builds successfully on CI
- [ ] GitHub Actions workflow passes
- [ ] All scripts are executable (Unix)
- [ ] All scripts run without errors (Windows)

### Cross-Platform Compatibility
- [ ] Unix verification runs successfully (bash ./mobius-verify.sh)
- [ ] Windows verification runs successfully (mobius-verify.cmd)
- [ ] Node.js verification runs successfully (node mobius-verify.mjs)
- [ ] PowerShell scripts execute correctly
- [ ] Port killing utilities work on both platforms
- [ ] Folder consolidation scripts work on both platforms

### Documentation Completeness
- [ ] README.md updated with new verification commands
- [ ] MOBIUS_SCRIPTS_SUMMARY.md accurate and complete
- [ ] MOBIUS_VERIFICATION_READY.md accurate and complete
- [ ] CHANGELOG.md properly updated
- [ ] PR description includes all necessary information

### Code Quality
- [ ] Scripts follow consistent formatting
- [ ] Error handling is robust
- [ ] Logging is standardized and clear
- [ ] No hardcoded paths (uses relative paths)
- [ ] Scripts clean up after themselves
- [ ] Health checks are reliable

### Security & Best Practices
- [ ] No secrets or sensitive information in scripts
- [ ] Scripts use proper error handling
- [ ] Temporary files are cleaned up
- [ ] Process management is safe
- [ ] Scripts don't make destructive changes to system

## Testing Instructions

### Local Testing
1. Ensure Node dependencies are installed:
   ```bash
   npm ci
   cd client && npm ci && cd ..
   ```

2. Test Unix verification:
   ```bash
   chmod +x mobius-verify.sh scripts/*.sh
   npm run mobius:verify:unix
   ```

3. Test Windows verification:
   ```cmd
   npm run mobius:verify
   ```

4. Test Node.js verification:
   ```bash
   npm run mobius:verify:node
   ```

5. Check log files:
   - Unix: `/tmp/mobius-backend.log`, `/tmp/mobius-frontend.log`
   - Windows: `%TEMP%\mobius-backend.log`, `%TEMP%\mobius-frontend.log`

### CI Testing
1. Push branch to remote repository
2. Verify GitHub Actions workflow triggers automatically
3. Check workflow execution completes successfully
4. Verify all verification steps pass in CI environment

## Post-Merge Actions
- [ ] Delete feature branch after merge
- [ ] Update developer onboarding documentation to mention `npm run mobius:verify`
- [ ] Announce new verification capabilities to development team
- [ ] Monitor CI runs for any issues

## Suggested Reviewers
- [ ] @frontend-lead (replace with actual GitHub username)
- [ ] @backend-lead (replace with actual GitHub username)

## Additional Notes
- Replace `SMOKE_CMD` in verification scripts if your smoke script name differs
- CI assumes smoke tests run headlessly (Playwright or curl-based)
- Update workflow if tests require browsers installed