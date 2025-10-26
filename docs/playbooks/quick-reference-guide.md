# Mobius Preview Worker Deployment - Quick Reference Guide

## Essential Commands

### CLI Deployment
```bash
# Deploy to default namespace
node cli/mobius-deploy.js deploy

# Deploy with custom image tag
node cli/mobius-deploy.js deploy --image-tag ghcr.io/w9bikze8u4cbupc/mobius-preview-worker:v1.2.3

# Deploy to specific namespace
node cli/mobius-deploy.js deploy --namespace production

# Dry run (test without making changes)
node cli/mobius-deploy.js deploy --dry-run
```

### Status and Verification
```bash
# Check deployment status
node cli/mobius-deploy.js status

# Verify deployment health
node cli/mobius-deploy.js verify

# View deployment logs
node cli/mobius-deploy.js logs
```

### Rollback Operations
```bash
# Rollback deployment
node cli/mobius-deploy.js rollback

# Rollback specific namespace
node cli/mobius-deploy.js rollback --namespace production
```

## Platform-Specific Scripts

### Windows (PowerShell)
```powershell
# Build and push image
.\build-and-push.ps1

# Update manifests
.\update-manifests.ps1

# Apply manifests
.\apply-manifests.ps1

# Full deployment
.\deploy-preview-worker.ps1

# Verify deployment
.\verify-deployment.ps1
```

### Unix/Linux/macOS (Bash)
```bash
# Make scripts executable (first time only)
chmod +x *.sh

# Build and push image
./build-and-push.sh

# Update manifests
./update-manifests.sh

# Apply manifests
./apply-manifests.sh

# Full deployment
./deploy-preview-worker.sh

# Verify deployment
./verify-deployment.sh
```

## Kubernetes Commands

### Basic Operations
```bash
# Check pod status
kubectl -n preview-worker get pods

# View pod logs
kubectl -n preview-worker logs <pod-name>

# Check deployment status
kubectl -n preview-worker rollout status deployment/preview-worker

# Describe pod for detailed info
kubectl -n preview-worker describe pod <pod-name>
```

### Resource Monitoring
```bash
# Check resource usage
kubectl -n preview-worker top pods

# View recent events
kubectl -n preview-worker get events --sort-by=.metadata.creationTimestamp

# Check service endpoints
kubectl -n preview-worker get endpoints
```

## GitHub Actions Workflows

### Manual Triggers
- **Build Workflow**: Can be triggered manually with custom version tags
- **Deploy Workflow**: Can be triggered manually with environment selection and rollback option
- **Test Workflow**: Runs automatically on script changes

### Workflow URLs
- Build: `.github/workflows/preview-worker-build.yaml`
- Deploy: `.github/workflows/preview-worker-deploy.yaml`
- Test: `.github/workflows/test-deployment-scripts.yaml`

## Environment Variables

### Required Variables
```bash
# GHCR Personal Access Token (for image push)
GHCR_PAT=your_personal_access_token

# Kubernetes namespace (optional, defaults to preview-worker)
NAMESPACE=preview-worker
```

## Common Issues and Solutions

### Docker Issues
**Problem**: Docker not running
**Solution**: Start Docker Desktop or Docker daemon

**Problem**: Permission denied when pushing to GHCR
**Solution**: Verify GHCR PAT has correct permissions

### Kubernetes Issues
**Problem**: Cannot connect to cluster
**Solution**: Verify kubeconfig is correct and cluster is accessible

**Problem**: Pods stuck in Pending state
**Solution**: Check resource quotas and node capacity

**Problem**: ImagePullBackOff error
**Solution**: Verify image exists and image pull secrets are correct

### Script Issues
**Problem**: Scripts not found
**Solution**: Ensure running from project root directory

**Problem**: Permission denied on bash scripts
**Solution**: Run `chmod +x *.sh` on script files

## Security Best Practices

1. **Never commit PATs** to the repository
2. **Use environment variables** for sensitive data
3. **Rotate PATs regularly** for security
4. **Follow principle of least privilege** for all credentials
5. **Use dry-run mode** to test deployments safely

## Documentation Resources

### Core Documentation
- [CLI_DEPLOYMENT_TOOL.md](file:///c%3A/Users/danie/Documents/mobius-games-tutorial-generator/CLI_DEPLOYMENT_TOOL.md) - Complete CLI documentation
- [CLI_USAGE_EXAMPLES.md](file:///c%3A/Users/danie/Documents/mobius-games-tutorial-generator/CLI_USAGE_EXAMPLES.md) - Practical usage examples
- [DEPLOYMENT_CHECKLIST.md](file:///c%3A/Users/danie/Documents/mobius-games-tutorial-generator/DEPLOYMENT_CHECKLIST.md) - Deployment checklist

### Team Resources
- [TEAM_ONBOARDING_GUIDE.md](file:///c%3A/Users/danie/Documents/mobius-games-tutorial-generator/TEAM_ONBOARDING_GUIDE.md) - Onboarding guide
- [MONITORING_AND_ALERTING.md](file:///c%3A/Users/danie/Documents/mobius-games-tutorial-generator/MONITORING_AND_ALERTING.md) - Monitoring setup
- [DEPLOYMENT_DOCUMENTATION_SUMMARY.md](file:///c%3A/Users/danie/Documents/mobius-games-tutorial-generator/DEPLOYMENT_DOCUMENTATION_SUMMARY.md) - Documentation overview

## Emergency Procedures

### Immediate Rollback
1. Execute: `node cli/mobius-deploy.js rollback`
2. Verify: `node cli/mobius-deploy.js verify`
3. Check status: `node cli/mobius-deploy.js status`

### Complete System Failure
1. Contact system administrators
2. Check infrastructure provider status pages
3. Follow disaster recovery procedures

## Contact Information

### For Deployment Issues
- Team Lead: [team-lead-email]
- Operations: [ops-email]

### For Security Concerns
- Security Team: [security-email]

### For Documentation Updates
- Documentation Lead: [docs-email]