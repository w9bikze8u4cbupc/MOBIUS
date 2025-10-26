# CLI Usage Examples

This document provides practical examples of how to use the Mobius Preview Worker CLI tool for various deployment scenarios.

## Basic Deployment

### Simple Deployment
```bash
# Deploy with default settings
node cli/mobius-deploy.js deploy
```

### Deployment with Custom Image Tag
```bash
# Deploy with a specific image version
node cli/mobius-deploy.js deploy --image-tag ghcr.io/w9bikze8u4cbupc/mobius-preview-worker:v1.2.3
```

### Deployment to Custom Namespace
```bash
# Deploy to a specific namespace (e.g., production)
node cli/mobius-deploy.js deploy --namespace production
```

## Dry Run Mode

### Validate Deployment Process
```bash
# Test deployment without making changes
node cli/mobius-deploy.js deploy --dry-run

# Test with custom parameters
node cli/mobius-deploy.js deploy --dry-run --image-tag ghcr.io/w9bikze8u4cbupc/mobius-preview-worker:v1.2.3 --namespace staging
```

## Status Checking

### Check Overall Deployment Status
```bash
# Get current deployment status
node cli/mobius-deploy.js status

# Check status for specific namespace
node cli/mobius-deploy.js status --namespace production
```

## Log Management

### View Recent Logs
```bash
# View recent deployment logs
node cli/mobius-deploy.js logs

# View logs for specific namespace
node cli/mobius-deploy.js logs --namespace production
```

## Rollback Operations

### Rollback to Previous Version
```bash
# Rollback the default deployment
node cli/mobius-deploy.js rollback

# Rollback a specific namespace
node cli/mobius-deploy.js rollback --namespace production
```

## Verification

### Verify Deployment Health
```bash
# Run verification checks
node cli/mobius-deploy.js verify

# Verify specific namespace
node cli/mobius-deploy.js verify --namespace production
```

## Advanced Scenarios

### Complete Deployment Pipeline
```bash
# 1. Build and push image
node cli/mobius-deploy.js build-push

# 2. Update manifests
node cli/mobius-deploy.js update-manifests --image-tag ghcr.io/w9bikze8u4cbupc/mobius-preview-worker:v1.2.3

# 3. Deploy to staging
node cli/mobius-deploy.js apply-manifests --namespace staging

# 4. Verify deployment
node cli/mobius-deploy.js verify --namespace staging

# 5. Check status
node cli/mobius-deploy.js status --namespace staging
```

### Production Deployment with Rollback Preparation
```bash
# 1. Perform dry run first
node cli/mobius-deploy.js deploy --dry-run --namespace production

# 2. Deploy to production
node cli/mobius-deploy.js deploy --namespace production

# 3. Verify deployment
node cli/mobius-deploy.js verify --namespace production

# 4. Check status
node cli/mobius-deploy.js status --namespace production

# 5. View logs if needed
node cli/mobius-deploy.js logs --namespace production
```

### Emergency Rollback Procedure
```bash
# 1. Check current status
node cli/mobius-deploy.js status --namespace production

# 2. Rollback immediately
node cli/mobius-deploy.js rollback --namespace production

# 3. Verify rollback success
node cli/mobius-deploy.js verify --namespace production

# 4. Check final status
node cli/mobius-deploy.js status --namespace production
```

## Platform-Specific Usage

### Windows (PowerShell)
```powershell
# Use PowerShell scripts directly
.\deploy-preview-worker.ps1

# With parameters
.\deploy-preview-worker.ps1 -ImageTag "ghcr.io/w9bikze8u4cbupc/mobius-preview-worker:v1.2.3" -DryRun
```

### Unix/Linux/macOS (Bash)
```bash
# Make scripts executable (first time only)
chmod +x *.sh

# Use bash scripts directly
./deploy-preview-worker.sh

# With parameters
./deploy-preview-worker.sh --image-tag ghcr.io/w9bikze8u4cbupc/mobius-preview-worker:v1.2.3 --dry-run
```

## Environment Variables

Some operations may require environment variables:

```bash
# Set GHCR PAT for build operations
export GHCR_PAT=your_personal_access_token
node cli/mobius-deploy.js build-push

# Or pass directly (less secure)
GHCR_PAT=your_personal_access_token node cli/mobius-deploy.js build-push
```

## Troubleshooting Commands

### Check Prerequisites
```bash
# Verify Docker is running
docker version

# Verify kubectl is configured
kubectl version --client

# Check current Kubernetes context
kubectl config current-context
```

### Debug Deployment Issues
```bash
# Check pod status
kubectl -n preview-worker get pods

# Describe a specific pod
kubectl -n preview-worker describe pod <pod-name>

# View detailed logs
kubectl -n preview-worker logs <pod-name> --previous

# Check deployment status
kubectl -n preview-worker rollout status deployment/preview-worker
```

## CI/CD Integration Examples

### GitHub Actions Integration
```yaml
- name: Deploy Preview Worker
  run: |
    node cli/mobius-deploy.js deploy --image-tag ${{ github.sha }} --namespace staging
  env:
    GHCR_PAT: ${{ secrets.GHCR_PAT }}
    
- name: Verify Deployment
  run: |
    node cli/mobius-deploy.js verify --namespace staging
    
- name: Rollback on Failure
  if: failure()
  run: |
    node cli/mobius-deploy.js rollback --namespace staging
```

### Jenkins Pipeline Integration
```groovy
stage('Deploy') {
    steps {
        sh 'node cli/mobius-deploy.js deploy --image-tag ${BUILD_TAG} --namespace staging'
    }
}

stage('Verify') {
    steps {
        sh 'node cli/mobius-deploy.js verify --namespace staging'
    }
}

stage('Rollback') {
    when {
        expression { currentBuild.resultIsBetterOrEqualTo('UNSTABLE') }
    }
    steps {
        sh 'node cli/mobius-deploy.js rollback --namespace staging'
    }
}
```

## Best Practices

1. **Always use dry-run first**: Test your deployment commands with `--dry-run` before executing them
2. **Verify after deployment**: Always run `verify` after deployment to ensure everything is working
3. **Check status regularly**: Use `status` to monitor your deployments
4. **View logs when troubleshooting**: Use `logs` to debug issues
5. **Have a rollback plan**: Know how to use `rollback` in case of issues
6. **Use specific namespaces**: Deploy to specific namespaces for different environments
7. **Tag your images**: Use specific image tags for better version control

## Common Issues and Solutions

### Permission Denied on Bash Scripts
```bash
# Solution: Make scripts executable
chmod +x *.sh
```

### Docker Not Running
```bash
# Solution: Start Docker Desktop or Docker daemon
# On Windows: Start Docker Desktop application
# On Linux/macOS: Start Docker service
```

### Kubernetes Connection Issues
```bash
# Solution: Verify kubeconfig
kubectl config current-context
kubectl config get-contexts
```

### Image Pull Errors
```bash
# Solution: Verify image exists and credentials are correct
kubectl -n preview-worker describe pod <pod-name>
```