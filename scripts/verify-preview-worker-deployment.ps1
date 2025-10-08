# Preview Worker Deployment Verification Script (PowerShell)

Write-Host "=== Preview Worker Deployment Verification ===" -ForegroundColor Green

# Configuration
$NAMESPACE = "preview-worker"
$SERVICE_NAME = "preview-worker"
$DEPLOYMENT_NAME = "preview-worker"
$HPA_NAME = "preview-worker-hpa"

Write-Host "1. Checking if namespace exists..." -ForegroundColor Yellow
try {
    kubectl get namespace $NAMESPACE | Out-Null
    Write-Host "   Namespace $NAMESPACE exists" -ForegroundColor Green
} catch {
    Write-Host "   ERROR: Namespace $NAMESPACE does not exist" -ForegroundColor Red
    exit 1
}

Write-Host "2. Checking deployment status..." -ForegroundColor Yellow
try {
    kubectl -n $NAMESPACE get deployment $DEPLOYMENT_NAME | Out-Null
    Write-Host "   Deployment $DEPLOYMENT_NAME found" -ForegroundColor Green
} catch {
    Write-Host "   ERROR: Deployment $DEPLOYMENT_NAME not found" -ForegroundColor Red
    exit 1
}

Write-Host "3. Checking pod status..." -ForegroundColor Yellow
try {
    $pods = kubectl -n $NAMESPACE get pods -l app=preview-worker -o json | ConvertFrom-Json
    if ($pods.items.Count -eq 0) {
        Write-Host "   ERROR: No pods found for preview-worker" -ForegroundColor Red
        exit 1
    }
    Write-Host "   Found $($pods.items.Count) preview-worker pods" -ForegroundColor Green
} catch {
    Write-Host "   ERROR: Failed to get pod status" -ForegroundColor Red
    exit 1
}

Write-Host "4. Checking service status..." -ForegroundColor Yellow
try {
    kubectl -n $NAMESPACE get service $SERVICE_NAME | Out-Null
    Write-Host "   Service $SERVICE_NAME found" -ForegroundColor Green
} catch {
    Write-Host "   ERROR: Service $SERVICE_NAME not found" -ForegroundColor Red
    exit 1
}

Write-Host "5. Checking HPA status..." -ForegroundColor Yellow
try {
    kubectl -n $NAMESPACE get hpa $HPA_NAME | Out-Null
    Write-Host "   HPA $HPA_NAME found" -ForegroundColor Green
} catch {
    Write-Host "   ERROR: HPA $HPA_NAME not found" -ForegroundColor Red
    exit 1
}

Write-Host "=== All checks passed! Preview Worker is deployed and healthy. ===" -ForegroundColor Green