# CI/CD Pipeline Finalization Guide

## Overview
This guide provides instructions for finalizing the CI/CD pipeline for the Mobius Preview Worker, including secrets management, branch protection, and pipeline integrity enforcement.

## GitHub Secrets Configuration

### Required Secrets
1. **GHCR_PAT**: GitHub Personal Access Token with read/write packages permissions
2. **KUBECONFIG_DATA**: Base64 encoded kubeconfig for Kubernetes cluster access
3. **SLACK_WEBHOOK**: Webhook URL for Slack notifications (optional)
4. **PAGERDUTY_ROUTING_KEY**: Routing key for PagerDuty alerts (optional)

### Setting Up GHCR_PAT
1. Navigate to GitHub Settings → Developer settings → Personal access tokens
2. Generate new token with `read:packages` and `write:packages` scopes
3. Copy the token value
4. In your repository, go to Settings → Secrets and variables → Actions
5. Add new repository secret named `GHCR_PAT` with the token value

### Setting Up KUBECONFIG_DATA
1. Obtain your kubeconfig file for the target Kubernetes cluster
2. Encode the file content in base64:
   ```bash
   # Linux/macOS
   cat ~/.kube/config | base64
   
   # Windows (PowerShell)
   [Convert]::ToBase64String([IO.File]::ReadAllBytes("~/.kube/config"))
   ```
3. Add the base64 output as a repository secret named `KUBECONFIG_DATA`

## Branch Protection Rules

### Main Branch Protection
1. Navigate to repository Settings → Branches
2. Add branch protection rule for `main` branch
3. Configure the following settings:
   - **Require status checks to pass before merging**:
     - `build-preview-worker` (GitHub Actions workflow)
     - `test-deployment-scripts` (GitHub Actions workflow)
   - **Require branches to be up to date before merging**: Enabled
   - **Require linear history**: Enabled
   - **Include administrators**: Enabled (recommended)
   - **Allow force pushes**: Disabled
   - **Allow deletions**: Disabled

### Staging Branch Protection (Optional)
1. Add branch protection rule for `staging` branch
2. Configure similar settings as main branch but with different required status checks

## Required Status Checks

### Build Workflow Checks
- **build-preview-worker**: Ensures Docker image builds and pushes successfully
- **dependency-review**: Checks for vulnerable dependencies (if enabled)
- **codeql-analysis**: Security scanning (if enabled)

### Test Workflow Checks
- **test-deployment-scripts**: Validates PowerShell and Bash deployment scripts
- **unit-tests**: Runs application unit tests
- **integration-tests**: Runs integration tests (if applicable)

### Deploy Workflow Checks
- **deploy-preview-worker**: Validates deployment to staging environment
- **smoke-tests**: Verifies basic functionality after deployment

## Pipeline Integrity Enforcement

### Workflow Permissions
Ensure all workflows have appropriate permissions by adding to each workflow file:
```yaml
permissions:
  contents: read
  packages: write
  deployments: write
```

### Environment Protection Rules
1. Navigate to repository Settings → Environments
2. Create environments for `staging` and `production`
3. Configure protection rules:
   - **Required reviewers**: Specify team members who must approve deployments
   - **Wait timer**: Add delay before production deployments (optional)
   - **Deployment branches**: Restrict which branches can deploy to each environment

### Workflow Dispatch Configuration
Enable manual triggering of workflows by adding to workflow files:
```yaml
on:
  workflow_dispatch:
    inputs:
      version:
        description: 'Version tag (e.g., v1.2.3)'
        required: false
```

## Secrets Management Best Practices

### 1. Rotation Schedule
- Rotate GHCR_PAT every 90 days
- Review and update kubeconfig credentials regularly
- Audit secret access logs periodically

### 2. Access Control
- Limit secret access to necessary workflows only
- Use environment-specific secrets when possible
- Regularly review secret permissions

### 3. Monitoring
- Enable audit logging for secret access
- Set up alerts for unusual secret usage patterns
- Monitor for unauthorized secret modifications

## Vault Integration (Optional)

### Setting Up HashiCorp Vault
1. Deploy Vault server (or use managed service)
2. Configure Kubernetes authentication method
3. Create policies for CI/CD pipeline access
4. Store secrets in Vault instead of GitHub Secrets

### Vault GitHub Actions Integration
Update workflows to use Vault instead of GitHub Secrets:
```yaml
- name: Authenticate to Vault
  uses: hashicorp/vault-action@v2
  with:
    url: ${{ secrets.VAULT_ADDR }}
    method: jwt
    role: cicd-role
    secrets: |
      secret/data/ci/docker/config token | DOCKER_TOKEN;
      secret/data/ci/kube/config data | KUBECONFIG_DATA;
```

## Pipeline Monitoring and Alerting

### Workflow Run Monitoring
1. Enable GitHub Actions notifications:
   - Go to repository Settings → Webhooks & Events → Notifications
   - Configure notifications for workflow failures

2. Set up Slack integration:
   - Install GitHub Slack app
   - Configure notifications for workflow runs

### Performance Monitoring
1. Track workflow execution times
2. Monitor resource usage during builds
3. Set up alerts for performance degradation

## Testing the Finalized Pipeline

### 1. Secret Configuration Test
- Trigger a build workflow manually
- Verify Docker image is pushed to GHCR
- Check that no secrets are exposed in logs

### 2. Branch Protection Test
- Create a pull request to main branch
- Verify required status checks are enforced
- Confirm branch protection rules are working

### 3. Environment Deployment Test
- Trigger a deployment to staging environment
- Verify deployment succeeds with proper approvals
- Check that environment protection rules are enforced

### 4. Security Scanning Test
- Push code with known vulnerabilities
- Verify security scans detect and block the push
- Confirm security alerts are sent

## Troubleshooting Common Issues

### Secret Access Issues
**Problem**: Workflows failing with "Resource not accessible by integration"
**Solution**: Check workflow permissions and repository secret access

**Problem**: "docker login" failing in workflows
**Solution**: Verify GHCR_PAT has correct scopes and is not expired

### Kubernetes Deployment Issues
**Problem**: "kubectl" commands failing with connection errors
**Solution**: Verify KUBECONFIG_DATA is correctly base64 encoded and contains valid config

**Problem**: Permission denied errors during deployment
**Solution**: Check RBAC permissions and service account configuration

### Branch Protection Issues
**Problem**: Unable to merge pull requests due to missing status checks
**Solution**: Verify workflow names match required status checks exactly

**Problem**: Required checks not appearing in branch protection settings
**Solution**: Run workflows at least once to make them available as status checks

## Conclusion

This guide provides a comprehensive approach to finalizing the CI/CD pipeline for the Mobius Preview Worker. By following these steps, you can ensure a secure, reliable, and well-monitored deployment pipeline that enforces best practices and maintains pipeline integrity.

Regular review and updates to this configuration will help maintain security and reliability as the project evolves.