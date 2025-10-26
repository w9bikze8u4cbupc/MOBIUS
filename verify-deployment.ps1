# Verify deployment status
Write-Host "=== Preview Worker Deployment Verification ==="

# Check if Docker is running
Write-Host "1. Checking Docker status..."
try {
    $dockerVersion = docker version --format '.Server.Version'
    Write-Host "   Docker is running. Version: $dockerVersion" -ForegroundColor Green
} catch {
    Write-Host "   Docker is not running or not installed." -ForegroundColor Red
    exit 1
}

# Check if Kubernetes is configured
Write-Host "2. Checking Kubernetes configuration..."
try {
    $kubectlVersion = kubectl version --request-timeout='5s' --client=true
    Write-Host "   kubectl is available." -ForegroundColor Green
    
    # Check if there's a current context
    $currentContext = kubectl config current-context 2>$null
    if ($currentContext) {
        Write-Host "   Current context: $currentContext" -ForegroundColor Green
    } else {
        Write-Host "   No current context set." -ForegroundColor Yellow
    }
} catch {
    Write-Host "   kubectl is not available or not properly configured." -ForegroundColor Red
}

# Check if the image exists locally
Write-Host "3. Checking for local Docker image..."
$imageName = "ghcr.io/w9bikze8u4cbupc/mobius-preview-worker:staging-1"
$images = docker images --format "{{.Repository}}:{{.Tag}}" | Where-Object { $_ -eq $imageName }
if ($images) {
    Write-Host "   Image $imageName found locally." -ForegroundColor Green
} else {
    Write-Host "   Image $imageName not found locally." -ForegroundColor Yellow
}

# Check if Kubernetes namespace exists
Write-Host "4. Checking for Kubernetes namespace..."
$namespace = "preview-worker"
try {
    $namespaces = kubectl get namespaces -o name 2>$null | ForEach-Object { $_.Replace("namespace/", "") }
    if ($namespaces -contains $namespace) {
        Write-Host "   Namespace $namespace exists." -ForegroundColor Green
        
        # Check if deployment exists
        try {
            $deployments = kubectl -n $namespace get deployments -o name 2>$null
            if ($deployments) {
                Write-Host "   Deployments in $namespace:" -ForegroundColor Green
                $deployments | ForEach-Object { Write-Host "     $_" }
            } else {
                Write-Host "   No deployments found in $namespace." -ForegroundColor Yellow
            }
        } catch {
            Write-Host "   Unable to check deployments." -ForegroundColor Yellow
        }
    } else {
        Write-Host "   Namespace $namespace does not exist." -ForegroundColor Yellow
    }
} catch {
    Write-Host "   Unable to check namespaces (Kubernetes may not be running)." -ForegroundColor Yellow
}

Write-Host "=== Verification Complete ==="