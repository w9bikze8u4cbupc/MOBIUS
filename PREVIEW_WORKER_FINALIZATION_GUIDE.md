# Preview Worker PR Finalization Guide

This document explains how to finalize the Preview Worker PR with your specific image tag.

## Files Created

1. `preview-worker-image-update.patch` - A patch file template for updating the image tag
2. `update-preview-worker-image-tag.sh` - Bash script to update the image tag
3. `update-preview-worker-image-tag.ps1` - PowerShell script to update the image tag
4. `finalize-preview-worker-pr.sh` - Complete bash script to finalize the PR
5. `finalize-preview-worker-pr.ps1` - Complete PowerShell script to finalize the PR

## How to Finalize the PR

### Option 1: Using the Complete Scripts (Recommended)

#### On Unix/Linux/macOS:
```bash
# Run the finalization script with your image tag
./finalize-preview-worker-pr.sh YOUR_REGISTRY/mobius-preview-worker:TAG

# Push the branch and create the PR
git push -u origin feat/preview-worker-k8s-final
gh pr create --title "k8s: add preview-worker manifests + cross-platform deployment tooling (BullMQ preview worker)" \
  --body-file PR_BODY_PREVIEW_WORKER_COMPLETE.md --base main --head feat/preview-worker-k8s-final
```

#### On Windows:
```powershell
# Run the finalization script with your image tag
.\finalize-preview-worker-pr.ps1 -ImageTag "YOUR_REGISTRY/mobius-preview-worker:TAG"

# Push the branch and create the PR
git push -u origin feat/preview-worker-k8s-final
gh pr create --title "k8s: add preview-worker manifests + cross-platform deployment tooling (BullMQ preview worker)" \
  --body-file PR_BODY_PREVIEW_WORKER_COMPLETE.md --base main --head feat/preview-worker-k8s-final
```

### Option 2: Manual Process

1. Create a new branch:
   ```bash
   git checkout -b feat/preview-worker-k8s-final
   ```

2. Update the image tag using the appropriate script:
   
   **On Unix/Linux/macOS:**
   ```bash
   ./update-preview-worker-image-tag.sh YOUR_REGISTRY/mobius-preview-worker:TAG
   ```
   
   **On Windows:**
   ```powershell
   .\update-preview-worker-image-tag.ps1 -ImageTag "YOUR_REGISTRY/mobius-preview-worker:TAG"
   ```

3. Commit the changes:
   ```bash
   git add k8s/preview-worker/deployment.yaml
   git commit -m "chore(k8s): finalize preview-worker manifests with image tag YOUR_REGISTRY/mobius-preview-worker:TAG"
   ```

4. Push the branch and create the PR:
   ```bash
   git push -u origin feat/preview-worker-k8s-final
   gh pr create --title "k8s: add preview-worker manifests + cross-platform deployment tooling (BullMQ preview worker)" \
     --body-file PR_BODY_PREVIEW_WORKER_COMPLETE.md --base main --head feat/preview-worker-k8s-final
   ```

## Verification Steps

After updating the image tag, verify the change:

```bash
# Check the deployment file
grep -A 2 "image:" k8s/preview-worker/deployment.yaml

# Dry-run Kubernetes apply
kubectl apply --dry-run=client -f k8s/preview-worker/
```

## Next Steps After PR Creation

1. Ensure all CI checks pass
2. Deploy to staging environment
3. Run smoke tests
4. Verify Prometheus metrics scraping
5. Test rollback procedures

The Preview Worker is now ready for final review and deployment with your specific image tag.