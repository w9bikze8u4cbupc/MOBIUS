# Windows PowerShell Deployment Guide for Hardened Preview Worker

## 🚀 Windows PowerShell Quick Start

### Step 1: Check Current Status
```powershell
# Check what files we have
Get-ChildItem k8s/preview-worker/

# Check git status
git status

# Check if hardened deployment exists
Test-Path k8s/preview-worker/hardened-deployment.yaml
```

### Step 2: Update Image Placeholder (Critical!)
```powershell
# Replace with your actual registry and image tag
# Example: registry.example.com/mobius-preview-worker:1.0.0

$oldImage = "YOUR_REGISTRY/mobius-preview-worker:TAG"
$newImage = "registry.example.com/mobius-preview-worker:1.0.0"  # Change this!

# Update the hardened deployment file
$content = Get-Content k8s/preview-worker/hardened-deployment.yaml -Raw
$updatedContent = $content -replace $oldImage, $newImage
Set-Content -Path k8s/preview-worker/hardened-deployment.yaml -Value $updatedContent -NoNewline

# Verify the change
Select-String -Path k8s/preview-worker/hardened-deployment.yaml -Pattern "image:"
```

### Step 3: Use the Hardened Deployment
```powershell
# Copy hardened deployment to replace the basic one
Copy-Item k8s/preview-worker/hardened-deployment.yaml k8s/preview-worker/sa-and-scc.yaml -Force

# Or use the hardened deployment directly
# The PowerShell script will use the hardened deployment file
```

### Step 4: Deploy with PowerShell Script
```powershell
# Make sure you have the deployment script
Test-Path deploy-hardened-preview-worker.ps1

# Basic deployment (interactive)
.\deploy-hardened-preview-worker.ps1

# Or with parameters
.\deploy-hardened-preview-worker.ps1 -ImageRegistry "registry.example.com" -ImageTag "1.0.0"

# Or dry-run to validate first
.\deploy-hardened-preview-worker.ps1 -DryRun
```

### Step 5: Create Required Secrets
```powershell
# Create registry secret (if using private registry)
kubectl create secret docker-registry regcred `
  --docker-server="your-registry.com" `
  --docker-username="your-username" `
  --docker-password="your-password" `
  --docker-email="your-email" `
  -n preview-worker

# Create application secrets
kubectl -n preview-worker create secret generic preview-worker-secrets `
  --from-literal=REDIS_URL="redis://your-redis:6379" `
  --from-literal=SOME_API_KEY="your-api-key"
```

### Step 6: Run Smoke Test
```powershell
# Run the PowerShell smoke test
.\k8s\preview-worker\smoke-test-preview-worker.ps1

# Or manual verification
kubectl -n preview-worker rollout status deployment/preview-worker --timeout=180s
kubectl -n preview-worker get pods -o wide
kubectl -n preview-worker get svc
```

## 🔧 Verification Commands (PowerShell)

### Health Check
```powershell
# Port forward and test
Start-Job -ScriptBlock { kubectl -n preview-worker port-forward svc/preview-worker 8080:5001 }
Start-Sleep -Seconds 3
Invoke-WebRequest -Uri "http://localhost:8080/health" -UseBasicParsing
Get-Job | Stop-Job
```

### Monitor Deployment
```powershell
# Watch logs
kubectl -n preview-worker logs -f deployment/preview-worker

# Check events
kubectl -n preview-worker get events --sort-by='.lastTimestamp'

# Describe resources
kubectl -n preview-worker describe deployment preview-worker
kubectl -n preview-worker describe pod -l app=preview-worker
```

## 🔄 Rollback Commands (PowerShell)

### Quick Rollback
```powershell
# Rollback to previous version
kubectl -n preview-worker rollout undo deployment/preview-worker

# Check rollback status
kubectl -n preview-worker rollout status deployment/preview-worker

# View rollout history
kubectl -n preview-worker rollout history deployment/preview-worker
```

## 📊 What You Get

### Security Hardening ✅
- ServiceAccount isolation (no cluster privileges)
- Security context (non-root, read-only filesystem)
- Resource limits (prevents resource exhaustion)
- Network isolation ready
- Minimal RBAC permissions

### Operational Excellence ✅
- Health probes with proper timing
- Rolling update strategy
- Graceful termination (30s)
- Comprehensive smoke testing
- Easy rollback capability

## 🚨 Critical Reminders

1. **Update Image Placeholder** - Replace `YOUR_REGISTRY/mobius-preview-worker:TAG` with your actual image
2. **Create Secrets** - Registry and application secrets are required
3. **Test in Staging First** - Always test in non-production environment
4. **Monitor After Deployment** - Watch logs and metrics post-deployment

## 🎯 Complete Deployment Example

```powershell
# 1. Update image (change this to your actual registry)
$oldImage = "YOUR_REGISTRY/mobius-preview-worker:TAG"
$newImage = "registry.example.com/mobius-preview-worker:1.0.0"
$content = Get-Content k8s/preview-worker/hardened-deployment.yaml -Raw
$updatedContent = $content -replace $oldImage, $newImage
Set-Content -Path k8s/preview-worker/hardened-deployment.yaml -Value $updatedContent -NoNewline

# 2. Deploy with automation
.\deploy-hardened-preview-worker.ps1 -ImageRegistry "registry.example.com" -ImageTag "1.0.0"

# 3. Create secrets
kubectl -n preview-worker create secret generic preview-worker-secrets `
  --from-literal=REDIS_URL="redis://your-redis:6379" `
  --from-literal=SOME_API_KEY="your-api-key"

# 4. Run smoke test
.\k8s\preview-worker\smoke-test-preview-worker.ps1
```

## 📞 Support

If you encounter issues:
1. Check the troubleshooting section in `HARDENED_DEPLOYMENT_GUIDE.md`
2. Run the smoke test script for diagnostic information
3. Check pod logs and events
4. Verify all secrets are created correctly

---

**Ready to deploy on Windows?** The PowerShell scripts handle all the complexity for you. Just update the image placeholder and run the deployment script!