# PR Merge Checklist - MOBIUS Game Tutorial Generator

## Pre-Merge Validation Gates

### ✅ CI/CD Pipeline Status
- [ ] **All CI workflows passing**: Verify `CI`, `Golden Preview Checks` workflows are green
- [ ] **Multi-OS compatibility**: Ubuntu, macOS, and Windows builds all successful
- [ ] **No failing tests**: Jest unit tests and golden file validation tests pass
- [ ] **FFmpeg integration working**: Video/audio processing pipeline operational across all platforms

### ✅ Code Quality & Standards  
- [ ] **TypeScript compilation**: No TS errors or warnings in build output
- [ ] **Node.js compatibility**: Code works with Node.js 20+ (as specified in workflows)
- [ ] **Dependency security**: No critical vulnerabilities in `npm audit` results
- [ ] **ESLint/formatting**: Code follows established style guidelines

### ✅ Golden File Validation
- [ ] **Golden tests passing**: All golden file comparisons within tolerance thresholds
  - SSIM threshold: ≥0.995 for video frames
  - LUFS tolerance: ±1.0 dB for audio levels  
  - True Peak tolerance: ±1.0 dB for audio peaks
- [ ] **Platform-specific baselines**: Per-OS golden files updated if `GOLDEN_PER_OS=1`
- [ ] **JUnit reports generated**: Test results available in `tests/golden/reports/` 
- [ ] **Debug artifacts**: Diff images available if tests fail for investigation

### ✅ Required Files & Documentation
- [ ] **README.md**: Updated with any new features or API changes
- [ ] **package.json**: Version bumped appropriately (major/minor/patch)
- [ ] **Dependencies**: New dependencies properly declared with appropriate versions
- [ ] **Environment variables**: Any new env vars documented in .env.example or README
- [ ] **API documentation**: Client-server interface changes documented

## Backup & Rollback Verification

### ✅ Pre-Merge Backup
- [ ] **Current main branch**: Create backup branch `backup/pre-merge-$(date +%Y%m%d)`
- [ ] **Golden files archived**: Backup current golden baselines to `archive/golden-$(date +%Y%m%d)/`
- [ ] **Database schema**: If applicable, backup any database state
- [ ] **Config files**: Backup production configuration files

### ✅ Rollback Strategy Prepared
- [ ] **Rollback commands documented**: Step-by-step rollback procedure in place
- [ ] **Database migrations**: Reversible migrations tested (if applicable)  
- [ ] **Golden baseline rollback**: Previous golden files ready to restore if needed
- [ ] **Deployment rollback**: Previous deployment artifacts accessible for quick revert

## Review & Approval Process

### ✅ Code Review Requirements
- [ ] **Primary reviewer approval**: Technical lead or senior developer approval
- [ ] **Domain expert review**: Game tutorial pipeline specialist review (if available)
- [ ] **Security review**: If touching authentication, file upload, or external APIs
- [ ] **Performance review**: For changes affecting video processing or large file handling

### ✅ Recommended Reviewers
- [ ] **Technical Lead**: Primary code review and architectural approval
- [ ] **DevOps/Infrastructure**: If changing CI/CD, Docker, or deployment configs
- [ ] **QA Lead**: If changing test infrastructure or golden file validation
- [ ] **Product Owner**: For user-facing features or API changes

## Merge Strategy & Process

### ✅ Pre-Merge Steps
- [ ] **Rebase on latest main**: Ensure clean history with `git rebase origin/main`
- [ ] **Squash related commits**: Combine related commits for clean history
- [ ] **Conflict resolution**: All merge conflicts resolved and tested
- [ ] **Final CI run**: Last commit has successful CI run before merge

### ✅ Merge Execution
- [ ] **Merge method**: Use "Squash and Merge" for feature branches, "Create Merge Commit" for release branches
- [ ] **Merge commit message**: Clear, descriptive commit message following conventional commits format
- [ ] **Branch cleanup**: Delete feature branch after successful merge
- [ ] **Tag creation**: Create version tag if this is a release (`git tag v1.2.3`)

## Post-Merge Verification

### ✅ Immediate Smoke Tests
- [ ] **Main branch CI**: Verify main branch CI passes after merge
- [ ] **Video generation pipeline**: Test end-to-end video generation for sample game
- [ ] **Golden file validation**: Run `npm run golden:check` to verify baselines still valid
- [ ] **Client build**: Test React client builds and serves correctly
- [ ] **API endpoints**: Verify critical API endpoints respond correctly

### ✅ Environment-Specific Validation
- [ ] **Development environment**: Local development setup still works post-merge
- [ ] **Staging deployment**: If applicable, deploy to staging and verify functionality
- [ ] **Production readiness**: Verify production deployment artifacts build correctly
- [ ] **Cross-platform testing**: Spot-check functionality on different OS platforms

### ✅ Golden File Management
- [ ] **Baseline updates**: If golden files changed, update baseline artifacts
- [ ] **Archive old baselines**: Move superseded golden files to archive directory
- [ ] **Document changes**: Update golden file changelog with reasoning for baseline changes
- [ ] **Notification**: Inform team of golden file baseline changes

## Emergency Procedures

### ✅ If Merge Breaks Main
- [ ] **Immediate assessment**: Quickly determine scope and impact of breakage  
- [ ] **Communication**: Notify team immediately via agreed communication channel
- [ ] **Quick fix vs rollback**: Decide between immediate hotfix or full rollback
- [ ] **Execute rollback**: If needed, execute prepared rollback strategy
- [ ] **Post-incident**: Document incident and improve process to prevent recurrence

### ✅ Rollback Execution Steps
1. **Stop deployments**: Halt any ongoing or scheduled deployments
2. **Revert merge commit**: `git revert -m 1 <merge-commit-hash>`  
3. **Restore golden files**: Copy from backup archive if golden tests affected
4. **Verify rollback**: Run smoke tests to confirm rollback successful
5. **Communicate status**: Update team on rollback completion and next steps

## Labels & Project Management

### ✅ GitHub Labels (Apply as appropriate)
- [ ] **`enhancement`**: For new features or improvements
- [ ] **`bug`**: For bug fixes
- [ ] **`breaking-change`**: For backward-incompatible changes
- [ ] **`golden-files`**: If golden baseline files are updated  
- [ ] **`docs`**: For documentation-only changes
- [ ] **`ci`**: For CI/CD or build system changes
- [ ] **`performance`**: For performance-related changes
- [ ] **`security`**: For security-related changes

### ✅ Project Tracking
- [ ] **Issue linking**: PR linked to relevant issues using "Closes #123" syntax
- [ ] **Milestone assignment**: PR assigned to appropriate project milestone
- [ ] **Epic tracking**: Large features tracked in project board/epic
- [ ] **Release notes**: Changes documented for next release announcement

---

## Checklist Completion Sign-off

**Merge Approver**: ___________________ **Date**: _______________

**Golden Files Validated by**: ___________________ **Date**: _______________  

**Final CI Status**: ✅ All Green **Timestamp**: _______________

---

*This checklist ensures comprehensive validation before merging changes to the MOBIUS game tutorial generator pipeline. All items should be verified before proceeding with merge.*