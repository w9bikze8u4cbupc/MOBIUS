# Windows PowerShell Smoke Test Script for Preview Worker
# Save as: smoke-test-preview-worker.ps1

param(
    [string]$Namespace = "preview-worker",
    [int]$Port = 5001,
    [int]$LocalPort = 5001,
    [int]$Timeout = 180
)

# Helper functions
function Write-Info { param($Message) Write-Host "[INFO] $Message" -ForegroundColor Blue }
function Write-Success { param($Message) Write-Host "[SUCCESS] $Message" -ForegroundColor Green }
function Write-Error { param($Message) Write-Host "[ERROR] $Message" -ForegroundColor Red }

# Ensure namespace exists
Write-Info "Ensuring namespace exists"
try {
    kubectl create namespace $Namespace 2>$null
    Write-Success "Namespace $Namespace ready"
} catch {
    Write-Info "Namespace $Namespace already exists"
}

# Dry-run validation
Write-Info "Validating manifests (dry-run client)"
try {
    kubectl apply --dry-run=client -f k8s/preview-worker/ -n $Namespace
    Write-Success "Manifest validation passed"
} catch {
    Write-Error "Manifest validation failed: $_"
    exit 1
}

# Apply manifests
Write-Info "Applying manifests to cluster"
try {
    kubectl apply -f k8s/preview-worker/ -n $Namespace
    Write-Success "Manifests applied"
} catch {
    Write-Error "Failed to apply manifests: $_"
    exit 1
}

# Wait for rollout
Write-Info "Waiting for rollout"
try {
    kubectl -n $Namespace rollout status deployment/preview-worker --timeout ${Timeout}s
    Write-Success "Rollout completed"
} catch {
    Write-Error "Rollout failed or timed out: $_"
    exit 1
}

# Get first pod
Write-Info "Getting first pod"
try {
    $pod = kubectl -n $Namespace get pods -l app=preview-worker -o jsonpath='{.items[0].metadata.name}'
    if (-not $pod) {
        throw "No pods found"
    }
    Write-Info "Using pod: $pod"
} catch {
    Write-Error "Failed to get pod: $_"
    exit 1
}

# Port forward
Write-Info "Setting up port-forward"
$portForwardJob = Start-Job -ScriptBlock {
    param($Namespace, $Pod, $LocalPort, $Port)
    kubectl -n $Namespace port-forward $Pod $LocalPort`:$Port
} -ArgumentList $Namespace, $pod, $LocalPort, $Port

# Wait for port-forward to be ready
Start-Sleep -Seconds 3

# Health check
Write-Info "Health check (http://localhost:$LocalPort/health)"
try {
    $response = Invoke-WebRequest -Uri "http://localhost:$LocalPort/health" -TimeoutSec 5 -UseBasicParsing
    if ($response.StatusCode -eq 200) {
        Write-Success "Health check OK (HTTP 200)"
    } else {
        throw "Health check returned HTTP $($response.StatusCode)"
    }
} catch {
    Write-Error "Health check failed: $_"
    Write-Info "Printing last 200 log lines"
    kubectl -n $Namespace logs $pod --tail=200
    Stop-Job $portForwardJob -ErrorAction SilentlyContinue
    Remove-Job $portForwardJob -ErrorAction SilentlyContinue
    exit 1
}

# Optional test request
Write-Info "Optional test request (adjust endpoint if needed)"
try {
    $body = '{"test":"ping"}' | ConvertTo-Json
    $response = Invoke-WebRequest -Uri "http://localhost:$LocalPort/api/v1/test" `
      -Method POST -Body $body -ContentType "application/json" `
      -TimeoutSec 5 -UseBasicParsing
    
    if ($response.Content -match "ok" -or $response.StatusCode -eq 200) {
        Write-Success "Test endpoint responded OK"
    } else {
        Write-Info "No test endpoint responded OK (this is OK if your worker has no HTTP test route)"
    }
} catch {
    Write-Info "No test endpoint available (this is acceptable)"
}

# Cleanup port-forward
Stop-Job $portForwardJob -ErrorAction SilentlyContinue
Remove-Job $portForwardJob -ErrorAction SilentlyContinue

Write-Success "Smoke test complete"