# CI Scripts and Workflows

This directory contains continuous integration scripts and documentation for the MOBIUS game tutorial generation pipeline.

## Available Scripts

### Golden File Validation
- **Purpose**: Validates generated video outputs against golden reference files
- **Location**: `../check_golden.js` and `../generate_golden.js`
- **Usage**: See npm scripts in `package.json`

### Operator Verification Workflow
- **Purpose**: Comprehensive pre-release validation for Operator team
- **Location**: `../operator_full_verify.sh`
- **Modes**:
  - `--mode dryrun`: Simulates all verification checks
  - `--mode full`: Executes actual verification checks

#### Usage Examples

```bash
# Dry-run verification (recommended for testing)
./scripts/operator_full_verify.sh --mode dryrun

# Full verification (for actual release validation)
./scripts/operator_full_verify.sh --mode full
```

#### Generated Artifacts

The operator verification script produces timestamped artifacts in `operator_verification/YYYYMMDD_HHMMSS/`:

- `verification_summary.md` - Overall verification results
- `artifact_index.txt` - Complete file listing
- `env-info.txt` - System environment metadata
- `logs/` - Detailed logs for each verification step:
  - `dependencies-*.log` - Dependency audit results
  - `build-*.log` - Build verification logs
  - `tests-*.log` - Test execution results
  - `security-scan-*.log` - Security scan outputs
  - `container-*.log` - Container validation logs
  - `resource-usage-*.log` - Performance measurements
  - `runbook-*.log` - Runbook validation results

## GitHub Actions Workflows

### Current Workflows
Located in `.github/workflows/`:

- `ci.yml` - Main CI pipeline with build, test, and golden file validation
- `golden-approve.yml` - Automated golden file approval workflow
- `golden-preview-checks.yml` - Preview-specific golden file validation

### Integration with Release Process

The operator verification workflow integrates with the GENESIS RAG release process:

1. **Operator Phase**: Run `operator_full_verify.sh` and attach artifacts
2. **Security Phase**: Review security scan results and container validation
3. **Operations Phase**: Validate runbook and deployment procedures
4. **Director Approval**: Final sign-off based on complete checklist

## Release Checklist Integration

The complete release validation process is documented in:
- `GENESIS_RAG_release_checklist.md` - Comprehensive release checklist
- Contains sections for Operator, Security, Operations, and Director approval
- References operator verification artifacts for evidence-based validation

## Development Workflow

### For Operators
1. Run dry-run verification during development: `./scripts/operator_full_verify.sh --mode dryrun`
2. Fix any issues identified in the logs
3. Run full verification before release: `./scripts/operator_full_verify.sh --mode full`
4. Attach generated artifacts to release PR

### For Security Team
1. Review security scan logs in `operator_verification/*/logs/security-scan-*.log`
2. Validate container security in `container-*.log`
3. Complete security section of release checklist

### For Operations Team
1. Review runbook validation in `runbook-*.log`
2. Validate resource usage analysis in `resource-usage-*.log`
3. Complete operations section of release checklist

## Troubleshooting

### Common Issues

1. **Script Permission Denied**
   ```bash
   chmod +x scripts/operator_full_verify.sh
   ```

2. **Missing Dependencies**
   ```bash
   npm install
   ```

3. **Docker Build Failures**
   - Check Dockerfile syntax
   - Ensure Docker daemon is running
   - Review container validation logs

4. **Test Failures**
   - Review test logs in `logs/tests-*.log`
   - Run individual test suites: `npm test`
   - Update golden files if needed: `npm run golden:approve`

### Log Analysis

All verification logs include:
- Timestamp information
- Detailed command outputs
- Pass/fail status for each check
- Resource usage metrics
- Environment context

### Artifact Management

- Artifacts are automatically excluded from git via `.gitignore`
- Artifacts should be attached to release PRs for review
- Old artifacts can be safely deleted after release completion

## Best Practices

1. **Always run dry-run first** to validate the verification environment
2. **Review all logs** before proceeding with release
3. **Attach complete artifact directory** to release PRs
4. **Update checklists** based on actual verification results
5. **Document issues** and resolutions in release notes

## Support

For issues with CI scripts or workflows:
1. Check the generated logs for specific error messages
2. Review the verification summary for overall status
3. Consult the troubleshooting section above
4. Contact the DevOps team for infrastructure issues

---

*Last updated: $(date)*
*Version: 1.0*