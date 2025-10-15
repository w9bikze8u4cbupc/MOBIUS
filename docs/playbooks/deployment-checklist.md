# Mobius Preview Worker Deployment Checklist

## Pre-Deployment Checklist

### Environment Setup
- [ ] Docker is installed and running
- [ ] Kubernetes CLI (kubectl) is installed and configured
- [ ] GitHub Container Registry (GHCR) Personal Access Token is available
- [ ] Kubernetes cluster is accessible and running
- [ ] Required namespaces exist or can be created

### Code and Configuration
- [ ] Latest code is pulled from the repository
- [ ] All tests pass locally
- [ ] Dockerfile is up to date
- [ ] Kubernetes manifests are validated
- [ ] Environment-specific configurations are correct

### Security
- [ ] GHCR PAT has appropriate permissions
- [ ] Kubernetes secrets are properly configured
- [ ] Image pull secrets are set up
- [ ] RBAC permissions are verified

## Deployment Process

### 1. Build and Push Docker Image
- [ ] Run `node cli/mobius-deploy.js build-push` or platform-specific script
- [ ] Verify image is pushed to GHCR successfully
- [ ] Confirm image tag is correct

### 2. Update Kubernetes Manifests
- [ ] Run `node cli/mobius-deploy.js update-manifests` or platform-specific script
- [ ] Verify manifests are updated with correct image tag
- [ ] Check that all YAML files have been updated

### 3. Apply Kubernetes Manifests
- [ ] Run `node cli/mobius-deploy.js apply-manifests` or platform-specific script
- [ ] Verify namespace exists or is created
- [ ] Confirm all resources are applied successfully

### 4. Monitor Deployment
- [ ] Run `node cli/mobius-deploy.js status` to check deployment status
- [ ] Monitor pod status: `kubectl -n preview-worker get pods`
- [ ] Check deployment rollout status: `kubectl -n preview-worker rollout status deployment/preview-worker`

### 5. Verify Deployment
- [ ] Run `node cli/mobius-deploy.js verify` or platform-specific script
- [ ] Check service endpoints are accessible
- [ ] Verify health checks pass
- [ ] Confirm metrics are being collected

## Post-Deployment Checklist

### Validation
- [ ] Run smoke tests to verify functionality
- [ ] Check application logs: `node cli/mobius-deploy.js logs`
- [ ] Verify metrics are being collected
- [ ] Test rollback procedure (optional but recommended)

### Documentation
- [ ] Update deployment documentation if needed
- [ ] Record deployment details (version, timestamp, deployer)
- [ ] Notify relevant stakeholders of successful deployment

### Cleanup
- [ ] Remove any temporary files or configurations
- [ ] Clear sensitive data from command history
- [ ] Update any internal tracking systems

## Rollback Procedure

If issues are detected after deployment:

1. Run `node cli/mobius-deploy.js rollback` or use kubectl directly:
   ```bash
   kubectl -n preview-worker rollout undo deployment/preview-worker
   ```

2. Monitor the rollback process:
   ```bash
   kubectl -n preview-worker rollout status deployment/preview-worker
   ```

3. Verify the rollback was successful:
   ```bash
   node cli/mobius-deploy.js verify
   ```

4. Investigate the cause of the issues and plan next steps

## Troubleshooting

### Common Issues and Solutions

#### Docker Issues
- **Problem**: Docker not running
  - **Solution**: Start Docker Desktop or Docker daemon

- **Problem**: Permission denied when pushing to GHCR
  - **Solution**: Verify GHCR PAT has correct permissions

#### Kubernetes Issues
- **Problem**: Cannot connect to cluster
  - **Solution**: Verify kubeconfig is correct and cluster is accessible

- **Problem**: Pods stuck in Pending state
  - **Solution**: Check resource quotas and node capacity

- **Problem**: ImagePullBackOff error
  - **Solution**: Verify image exists and image pull secrets are correct

#### Script Issues
- **Problem**: Scripts not found
  - **Solution**: Ensure running from project root directory

- **Problem**: Permission denied on bash scripts
  - **Solution**: Run `chmod +x *.sh` on script files

### Emergency Procedures

#### Immediate Rollback
If critical issues are detected immediately after deployment:
1. Execute rollback command
2. Notify team of rollback
3. Investigate issues in a separate branch

#### Complete System Failure
If the entire system is down:
1. Contact system administrators
2. Check infrastructure provider status pages
3. Follow disaster recovery procedures