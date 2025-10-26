# Next Steps Summary

This document outlines the recommended next steps to get the Preview Worker PR merge-ready.

## Immediate Actions Required

### 1. Merge Main into Feature Branch

**Why**: The PR shows "branch is out-of-date" which can cause false negatives in CI.

**How**:
```bash
# Option A: Use provided scripts
./merge-main-into-branch.sh  # Unix/Linux/macOS
.\merge-main-into-branch.ps1 # Windows PowerShell

# Option B: Manual commands
git fetch origin
git merge origin/main
npm ci
npm run test:preview-payloads
npm test
git add .
git commit -m "chore(ci): merge main into feat/preview-worker-k8s-final"
git push origin feat/preview-worker-k8s-final
```

### 2. Update Image Tag in Kubernetes Manifests

**Why**: Replace placeholder image with actual built image.

**How**:
```bash
# Option A: Use provided scripts (after you provide the image tag)
./update-preview-worker-image-with-tag.sh YOUR_REGISTRY/mobius-preview-worker:1.0.0  # Unix/Linux/macOS
.\update-preview-worker-image-with-tag.ps1 -ImageTag "YOUR_REGISTRY/mobius-preview-worker:1.0.0" # Windows PowerShell

# Option B: Manual update
# Edit k8s/preview-worker/deployment.yaml
# Replace: ghcr.io/your-org/mobius-preview-worker:latest
# With: YOUR_REGISTRY/mobius-preview-worker:1.0.0
```

## CI Troubleshooting

### If CI Checks Are Still Failing

1. **Check the logs**: Look at the first error message in each failing job
2. **Reproduce locally**: Run the same tests on your machine
3. **Common fixes**:
   - ESM/Jest issues: Use `NODE_OPTIONS=--experimental-vm-modules npm test`
   - Node version issues: Test with both Node 18 and 20
   - Missing dependencies: Run `npm ci` to ensure clean install

### Reference Materials

- `CI_TROUBLESHOOTING_GUIDE.md` - Detailed troubleshooting steps
- `.github/workflows/ci-preview-worker.yml` - Preview worker CI workflow
- `.github/workflows/ci.yml` - Main CI workflow

## Files Created

### Image Update Scripts
- `update-preview-worker-image-with-tag.sh` - Unix/Linux/macOS
- `update-preview-worker-image-with-tag.ps1` - Windows PowerShell

### Branch Management Scripts
- `merge-main-into-branch.sh` - Unix/Linux/macOS
- `merge-main-into-branch.ps1` - Windows PowerShell

### Documentation
- `CI_TROUBLESHOOTING_GUIDE.md` - Comprehensive CI troubleshooting guide
- `NEXT_STEPS_SUMMARY.md` - This document

## What You Need to Provide

To proceed with the next steps, please provide:

1. **Image Tag**: The final image tag you want to use in k8s manifests
   Example: `my-registry/mobius-preview-worker:1.0.0`

2. **Failing CI Logs**: If CI checks are still failing, please share:
   - The first 20-30 lines of the error message
   - The job name that's failing
   - Any specific error codes or stack traces

## Suggested Workflow

1. Merge main into your branch
2. Push the updated branch
3. Re-run failing workflows in GitHub UI
4. If CI is still failing, share the error logs
5. Once CI is green, update the image tag
6. Push final changes
7. Request final review and merge

## Final Verification

Before merging, ensure:

- [ ] All CI checks are passing
- [ ] Kubernetes manifests validate with `kubectl apply --dry-run=client`
- [ ] Image tag is updated to your production registry
- [ ] Documentation is complete and accurate
- [ ] All required reviewers have approved

The Preview Worker implementation is feature-complete and well-documented. With these steps, the PR should be ready for final review and merge.