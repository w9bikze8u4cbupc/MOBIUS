# 🚀 COMPLETE DEPLOYMENT CHECKLIST - MOBIUS Preview Worker

## ✅ Pre-Deployment Checklist

### 1. Image Update (CRITICAL)
```powershell
# Run this to update the image placeholder
$oldImage = "YOUR_REGISTRY/mobius-preview-worker:TAG"
$newImage = "ghcr.io/mobius-org/mobius-preview-worker:1.0.0"  # CHANGE THIS TO YOUR ACTUAL IMAGE!

# Update all YAML files
Get-ChildItem -Path .\k8s\preview-worker\*.yaml -File | ForEach-Object {
    (Get-Content $_.FullName -Raw) -replace [Regex]::Escape($oldImage), $newImage |
      Set-Content -Path $_.FullName -NoNewline
    Write-Host "Updated $($_.Name)"
}

# Verify the change
Get-ChildItem -Path .\k8s\preview-worker\*.yaml -File | ForEach-Object {
    Write-Host "--- $($_.Name) ---"
    Select-String -Path $_.FullName -Pattern "image:" -SimpleMatch
}
```

### 2. Git Commit & Push
```powershell
# Ensure you're on the right branch
git checkout chore/harden-preview-worker

# Add and commit changes
git add k8s/preview-worker/*.yaml
git commit -m "chore(k8s): set preview-worker image to $newImage"

# Push to remote
git push origin chore/harden-preview-worker
```

### 3. Create Pull Request (Choose one method)

**Option A - GitHub CLI:**
```powershell
gh auth login  # if not already logged in
gh pr create --base main --head chore/harden-preview-worker `
  --title "chore(k8s): harden preview-worker manifests and set image" `
  --body "Adds hardened deployment with securityContext, probes, resource limits, RBAC, and smoke-test. Image set to $newImage."
```

**Option B - Web UI:**
Go to: https://github.com/your-org/mobius-games-tutorial-generator/pulls
Click "New pull request", select base: main, compare: chore/harden-preview-worker

## 🏗️ Cluster Deployment Steps

### 4. Create Namespace & Secrets
```powershell
# Create namespace
kubectl create namespace preview-worker --dry-run=client -o yaml | kubectl apply -f -

# Create registry secret (if using private registry)
kubectl create secret docker-registry regcred `
  --docker-server="ghcr.io" `
  --docker-username="your-username" `
  --docker-password="your-token" `
  --docker-email="your-email@domain.com" `
  -n preview-worker

# Create application secrets
kubectl -n preview-worker create secret generic preview-worker-secrets `
  --from-literal=REDIS_URL="redis://redis-host:6379" `
  --from-literal=SOME_API_KEY="your-api-key-here"
```

### 5. Deploy to Cluster
```powershell
# Option A - Full automation (recommended)
.\deploy-hardened-preview-worker.ps1 -ImageRegistry "ghcr.io" -ImageTag "1.0.0"

# Option B - Manual deployment
kubectl apply -f k8s/preview-worker/hardened-deployment.yaml -n preview-worker
kubectl apply -f k8s/preview-worker/rbac.yaml -n preview-worker  # Optional
```

### 6. Run Smoke Test
```powershell
# PowerShell smoke test
.\k8s\preview-worker\smoke-test-preview-worker.ps1

# Or manual verification
kubectl -n preview-worker rollout status deployment/preview-worker --timeout=180s
kubectl -n preview-worker get pods -o wide
kubectl -n preview-worker get svc
```

## 🔍 Post-Deployment Verification

### 7. Health Check
```powershell
# Port forward and test
Start-Job -ScriptBlock { kubectl -n preview-worker port-forward svc/preview-worker 8080:5001 }
Start-Sleep -Seconds 3
Invoke-WebRequest -Uri "http://localhost:8080/health" -UseBasicParsing
Get-Job | Stop-Job
```

### 8. Monitor Logs
```powershell
# Watch logs
kubectl -n preview-worker logs -f deployment/preview-worker

# Check events
kubectl -n preview-worker get events --sort-by='.lastTimestamp'

# Describe resources
kubectl -n preview-worker describe deployment preview-worker
```

## 🔄 Rollback Commands (if needed)
```powershell
# Quick rollback
kubectl -n preview-worker rollout undo deployment/preview-worker

# Check rollback status
kubectl -n preview-worker rollout status deployment/preview-worker

# View history
kubectl -n preview-worker rollout history deployment/preview-worker
```

## 📊 What You're Deploying

### Security Hardening ✅
- **ServiceAccount isolation** - No cluster privileges
- **Security context** - Non-root user (UID 1000), read-only filesystem
- **Resource limits** - 150m/500m CPU, 256Mi/512Mi memory
- **Dropped capabilities** - Minimal attack surface
- **Health probes** - Liveness/readiness with proper timing

### Operational Excellence ✅
- **Rolling updates** - Zero-downtime deployments
- **Graceful termination** - 30s shutdown window
- **Comprehensive smoke testing** - Validates deployment health
- **Easy rollback** - One-command recovery
- **Monitoring ready** - Prometheus metrics endpoints

## 🚨 Critical Reminders

1. **Update Image First** - Replace `ghcr.io/mobius-org/mobius-preview-worker:1.0.0` with your actual image
2. **Create Secrets** - Registry and application secrets are required for deployment
3. **Test in Staging** - Always validate in non-production environment first
4. **Monitor After Deploy** - Watch logs and metrics post-deployment
5. **Keep Rollback Ready** - Know the rollback commands before deploying

## 📞 Support & Troubleshooting

### Common Issues:
- **Image Pull Errors** - Check registry secret and image accessibility
- **Health Check Failures** - Verify application listens on correct port
- **Resource Limits** - Adjust CPU/memory if pods are throttled
- **RBAC Issues** - Ensure ServiceAccount has minimal required permissions

### Next Steps After Success:
1. **Monitor Performance** - Adjust resource requests/limits based on usage
2. **Set Up Monitoring** - Integrate with Prometheus/Grafana
3. **Configure Alerts** - Set up alerts for health check failures
4. **Document Changes** - Update runbooks with your configurations

---

**Ready to deploy?** Follow the checklist in order. The entire process should take 5-10 minutes once you have your image registry information ready!