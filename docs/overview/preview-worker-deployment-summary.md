# Preview Worker Deployment Summary

## Current Status

We have successfully:
1. Built the Docker image for the preview worker with the correct lowercase repository name
2. Created PowerShell scripts to handle the deployment process
3. Created corresponding bash scripts for cross-platform compatibility
4. Prepared Kubernetes manifests for deployment

## Scripts Created

### PowerShell Scripts (Windows)
- **[build-and-push.ps1](file:///c%3A/Users/danie/Documents/mobius-games-tutorial-generator/build-and-push.ps1)**: Handles building and pushing the Docker image to GHCR
- **[update-manifests.ps1](file:///c%3A/Users/danie/Documents/mobius-games-tutorial-generator/update-manifests.ps1)**: Updates Kubernetes manifests with the correct image name
- **[apply-manifests.ps1](file:///c%3A/Users/danie/Documents/mobius-games-tutorial-generator/apply-manifests.ps1)**: Applies Kubernetes manifests to deploy the application
- **[deploy-preview-worker.ps1](file:///c%3A/Users/danie/Documents/mobius-games-tutorial-generator/deploy-preview-worker.ps1)**: A comprehensive script that combines all steps (for when Kubernetes is properly configured)

### Bash Scripts (Unix/Linux/macOS)
- **[build-and-push.sh](file:///c%3A/Users/danie/Documents/mobius-games-tutorial-generator/build-and-push.sh)**: Handles building and pushing the Docker image to GHCR
- **[update-manifests.sh](file:///c%3A/Users/danie/Documents/mobius-games-tutorial-generator/update-manifests.sh)**: Updates Kubernetes manifests with the correct image name
- **[apply-manifests.sh](file:///c%3A/Users/danie/Documents/mobius-games-tutorial-generator/apply-manifests.sh)**: Applies Kubernetes manifests to deploy the application
- **[deploy-preview-worker.sh](file:///c%3A/Users/danie/Documents/mobius-games-tutorial-generator/deploy-preview-worker.sh)**: A comprehensive script that combines all steps (for when Kubernetes is properly configured)

## Next Steps

### Immediate Actions
1. Run `build-and-push.ps1` (Windows) or `build-and-push.sh` (Unix/Linux/macOS) to push the image to GHCR
2. Run `update-manifests.ps1` (Windows) or `update-manifests.sh` (Unix/Linux/macOS) to update the Kubernetes manifests
3. Ensure Kubernetes is properly configured in Docker Desktop

### When Kubernetes is Ready
1. Run `apply-manifests.ps1` (Windows) or `apply-manifests.sh` (Unix/Linux/macOS) to deploy the application to Kubernetes
2. Monitor the deployment with `kubectl -n preview-worker get pods`
3. Check logs with `kubectl -n preview-worker logs <pod-name>`

## Troubleshooting

### Kubernetes Connection Issues
If you encounter connection issues with Kubernetes:
1. Open Docker Desktop
2. Go to Settings → Kubernetes
3. Ensure "Enable Kubernetes" is checked
4. Click Apply & Restart
5. Wait for Kubernetes to start (this may take several minutes)

### Image Pull Issues
If the pods fail to pull the image:
1. Ensure the image exists in GHCR
2. Verify the imagePullSecret is correctly configured
3. Check that the ServiceAccount has the correct imagePullSecrets

## Rollback Procedure
If you need to rollback the deployment:
```bash
kubectl -n preview-worker rollout undo deployment/preview-worker
```