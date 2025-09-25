# PR Merge Checklist

This checklist ensures thorough review and validation before merging any pull request into the main branch.

## Pre-merge Automation ✅

The following checks are automated via the `.github/workflows/premerge.yml` workflow:

- [ ] **Dependency checks** - All required system dependencies are available
- [ ] **Unit tests** - All tests pass (or no tests exist for new repositories)
- [ ] **Golden validation** - Video/audio quality checks pass (when applicable)
- [ ] **Linting** - Code style checks pass (when configured)
- [ ] **Cross-platform validation** - Checks pass on Ubuntu, macOS, and Windows
- [ ] **Artifact generation** - All validation artifacts are properly generated and uploaded

## Manual Review Requirements 👥

### Code Review
- [ ] **Two reviewers minimum** - At least 2 team members have approved the PR
- [ ] **Ops/SRE review required** - At least 1 reviewer from Ops/SRE team has approved
- [ ] **Code quality** - Code follows project conventions and best practices
- [ ] **Security review** - No sensitive data, credentials, or security vulnerabilities introduced
- [ ] **Performance impact** - Changes don't introduce performance regressions

### Documentation
- [ ] **README updates** - Documentation reflects any new features or changes
- [ ] **API documentation** - Public APIs are properly documented
- [ ] **Breaking changes** - Breaking changes are clearly documented and versioned
- [ ] **Migration guides** - Instructions provided for any required migrations

### Testing
- [ ] **Test coverage** - New code includes appropriate test coverage
- [ ] **Integration tests** - Changes are covered by integration tests where applicable
- [ ] **Manual testing** - Critical paths have been manually validated
- [ ] **Edge cases** - Known edge cases are handled appropriately

## Pre-Merge Validation Results 📊

Reviewers should verify the following from the automated premerge workflow:

### Artifacts to Review
- [ ] **System info** - Check `system_info.txt` for environment details
- [ ] **Test logs** - Review `npm_test.log` for any test warnings or issues
- [ ] **Golden checks** - Verify `golden_checks.log` shows expected results
- [ ] **Package consistency** - Ensure `package.json` and `package-lock.json` are consistent

### Success Criteria
- [ ] **All platforms pass** - Ubuntu, macOS, and Windows builds are successful
- [ ] **No failing tests** - All test suites pass or are appropriately skipped
- [ ] **Golden validation** - Video/audio quality meets thresholds (when applicable)
- [ ] **Artifact uploads** - All expected artifacts are available for download

## Final Checks ✋

Before clicking "Merge":

- [ ] **Branch is up-to-date** - PR branch is current with target branch
- [ ] **No merge conflicts** - All conflicts have been resolved
- [ ] **Squash/merge strategy** - Appropriate merge strategy selected
- [ ] **Commit messages** - Final commit messages are clear and descriptive

## Post-Merge Actions 🚀

After merging:

- [ ] **Monitor deployment** - Watch for any issues in staging/production
- [ ] **Notify stakeholders** - Inform relevant teams of the changes
- [ ] **Close related issues** - Link and close any related GitHub issues
- [ ] **Update project boards** - Move cards to "Done" in project management tools

---

## Workflow Configuration

The premerge workflow can be customized via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `ARTIFACT_DIR` | `premerge_artifacts` | Directory for validation artifacts |
| `BACKUP_DIR` | `backups` | Directory for backup files |
| `DRY_RUN_ENV` | `staging` | Environment for dry run operations |
| `AUTO_CREATE_PR` | `false` | Whether to auto-create follow-up PRs |
| `LOG_DIR` | `logs` | Directory for log files |
| `CI_UPLOAD_CMD` | `""` | Optional command for uploading artifacts |

## Troubleshooting 🔧

### Common Issues

**Premerge checks failing on specific platforms:**
- Download the platform-specific artifacts from the failed workflow run
- Review the logs in the `reports/` directory
- Check `system_info.txt` for environment differences

**Golden checks failing:**
- Verify input files exist in expected locations
- Check golden reference files are up-to-date
- Review SSIM/LUFS tolerance thresholds

**Dependency issues:**
- Ensure FFmpeg is properly installed on all platforms
- Verify poppler-utils installation (optional but recommended)
- Check Node.js and npm versions match requirements

### Getting Help

- **Artifacts**: Download workflow artifacts for detailed logs and debug info
- **Platform issues**: Review platform-specific build logs
- **Questions**: Tag @ops-team or @sre-team for infrastructure questions

---

**Note**: This checklist is enforced by branch protection rules. All automated checks must pass before merge is allowed.