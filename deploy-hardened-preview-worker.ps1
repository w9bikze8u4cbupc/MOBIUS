# Windows PowerShell Deployment Script for Hardened Preview Worker
# Save as: deploy-hardened-preview-worker.ps1

param(
    [string]$Namespace = "preview-worker",
    [string]$ImageRegistry = "",
    [string]$ImageTag = "latest",
    [switch]$SkipSecrets,
    [switch]$DryRun,
    [switch]$Help
)

# Show help
if ($Help) {
    Write-Host @"
Usage: .\deploy-hardened-preview-worker.ps1 [OPTIONS]

Deploy hardened preview-worker manifests to Kubernetes cluster.

OPTIONS:
    -Namespace <name>      Kubernetes namespace (default: preview-worker)
    -ImageRegistry <url>   Docker registry URL (e.g., registry.example.com)
    -ImageTag <tag>        Image tag (default: latest)
    -SkipSecrets          Skip secret creation prompts
    -DryRun               Validate only, don't apply to cluster
    -Help                 Show this help message

EXAMPLES:
    .\deploy-hardened-preview-worker.ps1
    .\deploy-hardened-preview-worker.ps1 -ImageRegistry "registry.example.com" -ImageTag "1.0.0"
    .\deploy-hardened-preview-worker.ps1 -DryRun
    .\deploy-hardened-preview-worker.ps1 -SkipSecrets -ImageRegistry "docker.io" -ImageTag "v1.2.3"
"@
    exit 0
}

# Helper functions
function Write-Info { param($Message) Write-Host "[INFO] $Message" -ForegroundColor Blue }
function Write-Success { param($Message) Write-Host "[SUCCESS] $Message" -ForegroundColor Green }
function Write-Error { param($Message) Write-Host "[ERROR] $Message" -ForegroundColor Red }
function Write-Warning { param($Message) Write-Host "[WARNING] $Message" -ForegroundColor Yellow }

# Check prerequisites
function Test-Prerequisites {
    Write-Info "Checking prerequisites..."
    
    # Check kubectl
    if (!(Get-Command kubectl -ErrorAction SilentlyContinue)) {
        Write-Error "kubectl not found in PATH"
        exit 1
    }
    
    # Check cluster connection
    try {
        kubectl cluster-info | Out-Null
        Write-Success "Connected to Kubernetes cluster"
    } catch {
        Write-Error "Cannot connect to Kubernetes cluster: $_"
        exit 1
    }
}

# Update image in manifest
function Update-ImagePlaceholder {
    param($ManifestPath, $Registry, $Tag)
    
    Write-Info "Updating image placeholder in $ManifestPath..."
    
    $oldImage = "YOUR_REGISTRY/mobius-preview-worker:TAG"
    $newImage = "$Registry/mobius-preview-worker:$Tag"
    
    try {
        $content = Get-Content $ManifestPath -Raw
        $updatedContent = $content -replace $oldImage, $newImage
        Set-Content -Path $ManifestPath -Value $updatedContent -NoNewline
        Write-Success "Image updated to: $newImage"
    } catch {
        Write-Error "Failed to update image: $_"
        exit 1
    }
}

# Create namespace
function New-Namespace {
    param($Name)
    
    Write-Info "Creating namespace: $Name"
    try {
        kubectl create namespace $Name --dry-run=client -o yaml | kubectl apply -f -
        Write-Success "Namespace $Name ready"
    } catch {
        Write-Warning "Namespace $Name may already exist or creation failed: $_"
    }
}

# Create registry secret
function New-RegistrySecret {
    param($Namespace, $SecretName = "regcred")
    
    # Check if secret already exists
    try {
        kubectl get secret $SecretName -n $Namespace | Out-Null
        Write-Info "Registry secret $SecretName already exists"
        return
    } catch {
        Write-Info "Registry secret $SecretName not found"
    }
    
    # Prompt for creation
    $createSecret = Read-Host "Do you want to create a registry secret now? (y/N)"
    if ($createSecret -ne 'y' -and $createSecret -ne 'Y') {
        Write-Warning "Skipping registry secret creation"
        return
    }
    
    $registryServer = Read-Host "Enter registry server (e.g., docker.io)"
    $registryUsername = Read-Host "Enter registry username"
    $registryPassword = Read-Host "Enter registry password" -AsSecureString
    $registryEmail = Read-Host "Enter registry email"
    
    # Convert secure string to plain text
    $registryPasswordPlain = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto(
        [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($registryPassword)
    )
    
    try {
        kubectl create secret docker-registry $SecretName `
          --docker-server=$registryServer `
          --docker-username=$registryUsername `
          --docker-password=$registryPasswordPlain `
          --docker-email=$registryEmail `
          -n $Namespace
        
        Write-Success "Registry secret created"
    } catch {
        Write-Error "Failed to create registry secret: $_"
    } finally {
        # Clear password from memory
        $registryPasswordPlain = $null
    }
}

# Create application secrets
function New-AppSecrets {
    param($Namespace, $SecretName = "preview-worker-secrets")
    
    # Check if secret already exists
    try {
        kubectl get secret $SecretName -n $Namespace | Out-Null
        Write-Info "Application secret $SecretName already exists"
        return
    } catch {
        Write-Info "Application secret $SecretName not found"
    }
    
    # Prompt for creation
    $createSecret = Read-Host "Do you want to create application secrets now? (y/N)"
    if ($createSecret -ne 'y' -and $createSecret -ne 'Y') {
        Write-Warning "Skipping application secrets creation"
        return
    }
    
    $redisUrl = Read-Host "Enter Redis URL (e.g., redis://host:6379)"
    $apiKey = Read-Host "Enter API key"
    
    try {
        kubectl create secret generic $SecretName `
          --from-literal=REDIS_URL=$redisUrl `
          --from-literal=SOME_API_KEY=$apiKey `
          -n $Namespace
        
        Write-Success "Application secrets created"
    } catch {
        Write-Error "Failed to create application secrets: $_"
    }
}

# Validate manifests
function Test-Manifests {
    param($Namespace, $ManifestPath)
    
    Write-Info "Validating manifests (dry-run)..."
    try {
        kubectl apply --dry-run=client -f $ManifestPath -n $Namespace
        Write-Success "Manifest validation passed"
    } catch {
        Write-Error "Manifest validation failed: $_"
        exit 1
    }
}

# Apply manifests
function Invoke-Manifests {
    param($Namespace, $ManifestPath)
    
    if ($DryRun) {
        Write-Info "Dry run mode - skipping manifest application"
        return
    }
    
    Write-Info "Applying manifests to cluster..."
    try {
        kubectl apply -f $ManifestPath -n $Namespace
        Write-Success "Manifests applied successfully"
    } catch {
        Write-Error "Failed to apply manifests: $_"
        exit 1
    }
}

# Wait for deployment
function Wait-Deployment {
    param($Namespace, $DeploymentName = "preview-worker", $Timeout = 300)
    
    Write-Info "Waiting for deployment to be ready..."
    try {
        kubectl -n $Namespace rollout status deployment/$DeploymentName --timeout=${Timeout}s
        Write-Success "Deployment is ready"
    } catch {
        Write-Error "Deployment failed to become ready: $_"
        kubectl -n $Namespace describe deployment $DeploymentName
        exit 1
    }
}

# Run smoke test
function Invoke-SmokeTest {
    param($Namespace)
    
    $smokeTestPath = "k8s/preview-worker/smoke-test-preview-worker.sh"
    if (Test-Path $smokeTestPath) {
        Write-Info "Running smoke test..."
        try {
            # Make executable on Unix systems (no-op on Windows)
            if (Get-Command chmod -ErrorAction SilentlyContinue) {
                chmod +x $smokeTestPath
            }
            
            # Run the smoke test
            & $smokeTestPath
            Write-Success "Smoke test completed"
        } catch {
            Write-Warning "Smoke test failed or encountered issues: $_"
        }
    } else {
        Write-Warning "Smoke test script not found, skipping"
    }
}

# Verify deployment
function Test-Deployment {
    param($Namespace)
    
    Write-Info "Post-deployment verification..."
    
    Write-Info "Deployment status:"
    kubectl -n $Namespace get deployment preview-worker
    
    Write-Info "Pod status:"
    kubectl -n $Namespace get pods -l app=preview-worker -o wide
    
    Write-Info "Service status:"
    kubectl -n $Namespace get svc preview-worker
    
    Write-Success "Deployment verification completed"
}

# Main execution
function Main {
    Write-Info "Starting hardened preview-worker deployment..."
    
    # Check prerequisites
    Test-Prerequisites
    
    # Update image if registry provided
    if ($ImageRegistry) {
        $manifestPath = "k8s/preview-worker/hardened-deployment.yaml"
        if (Test-Path $manifestPath) {
            Update-ImagePlaceholder -ManifestPath $manifestPath -Registry $ImageRegistry -Tag $ImageTag
        } else {
            Write-Error "Hardened deployment manifest not found at $manifestPath"
            exit 1
        }
    } else {
        Write-Warning "No image registry provided - make sure to update the image placeholder manually"
    }
    
    # Create namespace
    New-Namespace -Name $Namespace
    
    # Create secrets (unless skipped)
    if (!$SkipSecrets) {
        New-RegistrySecret -Namespace $Namespace
        New-AppSecrets -Namespace $Namespace
    }
    
    # Validate and apply manifests
    $manifestPath = "k8s/preview-worker/hardened-deployment.yaml"
    Test-Manifests -Namespace $Namespace -ManifestPath $manifestPath
    Invoke-Manifests -Namespace $Namespace -ManifestPath $manifestPath
    
    # Apply RBAC if exists
    $rbacPath = "k8s/preview-worker/rbac.yaml"
    if (Test-Path $rbacPath) {
        Write-Info "Applying RBAC configuration..."
        try {
            kubectl apply -f $rbacPath -n $Namespace
            Write-Success "RBAC configuration applied"
        } catch {
            Write-Warning "Failed to apply RBAC configuration (optional): $_"
        }
    }
    
    # Wait for deployment and test
    Wait-Deployment -Namespace $Namespace
    Invoke-SmokeTest -Namespace $Namespace
    Test-Deployment -Namespace $Namespace
    
    Write-Success "Hardened preview-worker deployment completed successfully!"
    Write-Info "Next steps:"
    Write-Info "  - Monitor logs: kubectl logs -f deployment/preview-worker -n $Namespace"
    Write-Info "  - Port forward for testing: kubectl port-forward svc/preview-worker 8080:5001 -n $Namespace"
    Write-Info "  - Health check: curl http://localhost:8080/health"
    Write-Info "  - Rollback if needed: kubectl -n $Namespace rollout undo deployment/preview-worker"
}

# Execute main function
Main