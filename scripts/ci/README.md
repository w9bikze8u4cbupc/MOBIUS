# CI/CD Scripts Documentation

This directory contains scripts and documentation for Continuous Integration and Deployment workflows for the MOBIUS project.

## Operator Verification Workflow

### Overview
The operator verification workflow ensures comprehensive pre-release validation through automated checks and manual review processes.

### Scripts

#### `../operator_full_verify.sh`
Automated operator verification tool that performs comprehensive checks before release.

**Usage:**
```bash
# Dry-run mode (safe for testing)
./scripts/operator_full_verify.sh --mode dryrun

# Full execution mode
./scripts/operator_full_verify.sh --mode full
```

**Modes:**
- **Dry-run**: Simulates all checks without executing potentially disruptive commands
- **Full**: Executes all verification checks and generates real artifacts

**Verification Checks:**
1. **Dependencies**: NPM audit and package integrity verification
2. **Build**: Clean build process validation
3. **Tests**: Test suite execution with coverage analysis
4. **Security**: Dependency vulnerability scanning
5. **Container**: Container configuration and permissions validation
6. **Resources**: Resource usage and performance analysis
7. **Runbook**: Deployment procedures and documentation validation

**Artifacts Generated:**
- Timestamped artifacts directory: `operator_verification/<timestamp>/`
- Verification summary report
- Individual check results and logs
- Artifact index for easy reference

### Integration with Release Process

The operator verification workflow integrates with the GENESIS RAG release checklist:

1. **Operator Team**: Runs verification script and reviews artifacts
2. **Security Team**: Reviews security scan results and runtime validation
3. **Operations Team**: Validates runbook and deployment procedures
4. **Director**: Provides final sign-off after all team approvals

### CI/CD Pipeline Integration

To integrate with automated CI/CD pipelines:

```yaml
# Example GitHub Actions workflow
name: Operator Verification
on:
  pull_request:
    branches: [main]
  
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      - name: Install dependencies
        run: npm install
      - name: Run operator verification
        run: ./scripts/operator_full_verify.sh --mode full
      - name: Upload artifacts
        uses: actions/upload-artifact@v3
        with:
          name: operator-verification-artifacts
          path: operator_verification/
```

### Troubleshooting

**Common Issues:**
- **Permission denied**: Ensure the script is executable (`chmod +x scripts/operator_full_verify.sh`)
- **Node.js not found**: Verify Node.js and npm are installed and in PATH
- **Failed dependencies**: Run `npm install` to ensure all dependencies are available

**Artifact Review:**
- Review `verification_summary.md` for an overview of all checks
- Check individual log files for detailed error information
- Use `artifact_index.txt` to locate specific artifacts

### Support

For questions or issues with the operator verification workflow:
1. Check the verification logs for specific error details
2. Review the GENESIS RAG release checklist for process guidance
3. Contact the DevOps team for CI/CD pipeline integration support