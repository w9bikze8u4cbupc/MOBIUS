# Add CI/CD and Deployment Tooling for Preview Worker

This PR adds the necessary CI/CD workflow and deployment tooling for the Preview Worker.

## Summary of Changes

### CI/CD Workflow
- Added `.github/workflows/preview-worker-build-push.yml` to automatically build and push Docker images on merge to main
- Workflow includes testing on PRs and building/pushing on main branch merges
- Uses GitHub Container Registry (GHCR) for image storage

### Deployment Scripts
- Added `scripts/update-preview-worker-image.sh` for Unix/Linux/macOS systems
- Added `scripts/update-preview-worker-image.ps1` for Windows systems
- Scripts safely update the container image tag in Kubernetes manifests

### Documentation
- Added `PREVIEW_WORKER_DEPLOYMENT_GUIDE.md` with comprehensive deployment instructions
- Includes step-by-step deployment process, testing procedures, and rollback instructions

## How to Use

### Building and Pushing Images
The CI workflow will automatically build and push images when changes are merged to main. To build locally:
```bash
docker build -t YOUR_REGISTRY/mobius-preview-worker:1.0.0 -f Dockerfile .
docker push YOUR_REGISTRY/mobius-preview-worker:1.0.0
```

### Updating Image Tags
Use the provided scripts to update image tags in manifests:
```bash
# Unix/Linux/macOS
./scripts/update-preview-worker-image.sh YOUR_REGISTRY/mobius-preview-worker:1.0.0

# Windows
.\scripts\update-preview-worker-image.ps1 -ImageTag "YOUR_REGISTRY/mobius-preview-worker:1.0.0"
```

### Deploying to Kubernetes
```bash
kubectl create namespace preview-worker --dry-run=client -o yaml | kubectl apply -f -
kubectl apply -n preview-worker -f k8s/preview-worker/
```

## Testing
The workflow runs all relevant tests on PRs:
- Payload validation tests
- Unit tests
- Worker-specific tests

## Next Steps
After merging this PR, the Preview Worker will be ready for deployment following the instructions in `PREVIEW_WORKER_DEPLOYMENT_GUIDE.md`.