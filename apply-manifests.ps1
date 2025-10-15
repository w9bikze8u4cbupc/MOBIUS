# VARIABLES (edit only if needed)
$K8S_DIR = 'k8s/preview-worker'     # directory containing manifests to apply
$Namespace = 'preview-worker'

# Check if namespace exists, create if not
Write-Host "Creating namespace $Namespace if it doesn't exist..."
kubectl create namespace $Namespace 2>$null
if ($LASTEXITCODE -eq 0) {
    Write-Host "Namespace $Namespace created."
} else {
    Write-Host "Namespace $Namespace already exists or creation failed."
}

# Apply manifests
Write-Host "Applying manifests from $K8S_DIR to namespace $Namespace ..."
kubectl -n $Namespace apply -f $K8S_DIR
if ($LASTEXITCODE -ne 0) {
    Write-Error "kubectl apply failed"
    exit 1
}

Write-Host "Manifests applied successfully."