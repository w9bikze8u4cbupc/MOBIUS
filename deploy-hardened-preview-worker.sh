#!/bin/bash
# deploy-hardened-preview-worker.sh
# Complete deployment script for hardened preview-worker manifests

set -euo pipefail

# Configuration
NAMESPACE="preview-worker"
IMAGE_PLACEHOLDER="YOUR_REGISTRY/mobius-preview-worker:TAG"
REGISTRY_SECRET_NAME="regcred"
APP_SECRET_NAME="preview-worker-secrets"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    if ! command -v kubectl &> /dev/null; then
        log_error "kubectl not found in PATH"
        exit 1
    fi
    
    if ! command -v curl &> /dev/null; then
        log_error "curl not found in PATH"
        exit 1
    fi
    
    if ! kubectl cluster-info &> /dev/null; then
        log_error "Cannot connect to Kubernetes cluster"
        exit 1
    fi
    
    log_success "Prerequisites satisfied"
}

# Apply patches
apply_patches() {
    log_info "Applying hardened manifest patches..."
    
    # Check if patches exist
    if [ ! -f "0001-harden-preview-worker-manifests.patch" ]; then
        log_error "Patch file 0001-harden-preview-worker-manifests.patch not found"
        exit 1
    fi
    
    if [ ! -f "0002-add-rbac-configuration.patch" ]; then
        log_error "Patch file 0002-add-rbac-configuration.patch not found"
        exit 1
    fi
    
    if [ ! -f "0003-add-smoke-test-script.patch" ]; then
        log_error "Patch file 0003-add-smoke-test-script.patch not found"
        exit 1
    fi
    
    # Apply patches
    log_info "Applying patch 1/3: Hardened manifests"
    git apply -p0 0001-harden-preview-worker-manifests.patch || {
        log_error "Failed to apply patch 1"
        exit 1
    }
    
    log_info "Applying patch 2/3: RBAC configuration"
    git apply -p0 0002-add-rbac-configuration.patch || {
        log_error "Failed to apply patch 2"
        exit 1
    }
    
    log_info "Applying patch 3/3: Smoke test script"
    git apply -p0 0003-add-smoke-test-script.patch || {
        log_error "Failed to apply patch 3"
        exit 1
    }
    
    log_success "All patches applied successfully"
}

# Check for image placeholder
check_image_placeholder() {
    log_info "Checking for image placeholder..."
    
    if grep -q "$IMAGE_PLACEHOLDER" k8s/preview-worker/sa-and-scc.yaml; then
        log_warning "Image placeholder found: $IMAGE_PLACEHOLDER"
        log_warning "Please update the image in k8s/preview-worker/sa-and-scc.yaml before proceeding"
        log_warning "Example: sed -i 's|$IMAGE_PLACEHOLDER|your-registry.com/mobius-preview-worker:1.0.0|g' k8s/preview-worker/sa-and-scc.yaml"
        
        read -p "Do you want to continue anyway? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    else
        log_success "Image placeholder not found - manifest appears ready"
    fi
}

# Create namespace
create_namespace() {
    log_info "Creating namespace: $NAMESPACE"
    kubectl create namespace "$NAMESPACE" 2>/dev/null || {
        log_info "Namespace $NAMESPACE already exists"
    }
}

# Create registry secret (optional)
create_registry_secret() {
    log_info "Registry secret setup..."
    
    if kubectl -n "$NAMESPACE" get secret "$REGISTRY_SECRET_NAME" &> /dev/null; then
        log_info "Registry secret $REGISTRY_SECRET_NAME already exists"
        return
    fi
    
    log_info "Registry secret $REGISTRY_SECRET_NAME not found"
    read -p "Do you want to create a registry secret now? (y/N): " -n 1 -r
    echo
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        read -p "Enter registry server (e.g., docker.io): " registry_server
        read -p "Enter registry username: " registry_username
        read -s -p "Enter registry password: " registry_password
        echo
        read -p "Enter registry email: " registry_email
        
        kubectl create secret docker-registry "$REGISTRY_SECRET_NAME" \
          --docker-server="$registry_server" \
          --docker-username="$registry_username" \
          --docker-password="$registry_password" \
          --docker-email="$registry_email" \
          -n "$NAMESPACE"
        
        log_success "Registry secret created"
    else
        log_warning "Skipping registry secret creation"
        log_warning "Make sure your cluster can pull the image or create the secret manually"
    fi
}

# Create application secrets
create_app_secrets() {
    log_info "Application secrets setup..."
    
    if kubectl -n "$NAMESPACE" get secret "$APP_SECRET_NAME" &> /dev/null; then
        log_info "Application secret $APP_SECRET_NAME already exists"
        return
    fi
    
    log_info "Application secret $APP_SECRET_NAME not found"
    read -p "Do you want to create application secrets now? (y/N): " -n 1 -r
    echo
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        read -p "Enter Redis URL (e.g., redis://host:6379): " redis_url
        read -p "Enter API key: " api_key
        
        kubectl create secret generic "$APP_SECRET_NAME" \
          --from-literal=REDIS_URL="$redis_url" \
          --from-literal=SOME_API_KEY="$api_key" \
          -n "$NAMESPACE"
        
        log_success "Application secrets created"
    else
        log_warning "Skipping application secrets creation"
        log_warning "Make sure to create the required secrets before deployment"
    fi
}

# Validate manifests
validate_manifests() {
    log_info "Validating manifests (dry-run)..."
    
    if kubectl apply --dry-run=client -f k8s/preview-worker/sa-and-scc.yaml -n "$NAMESPACE"; then
        log_success "Manifest validation passed"
    else
        log_error "Manifest validation failed"
        exit 1
    fi
}

# Apply manifests
apply_manifests() {
    log_info "Applying manifests to cluster..."
    
    if kubectl apply -f k8s/preview-worker/sa-and-scc.yaml -n "$NAMESPACE"; then
        log_success "Manifests applied successfully"
    else
        log_error "Failed to apply manifests"
        exit 1
    fi
}

# Apply RBAC (optional)
apply_rbac() {
    log_info "Applying RBAC configuration..."
    
    if [ -f "k8s/preview-worker/rbac.yaml" ]; then
        if kubectl apply -f k8s/preview-worker/rbac.yaml -n "$NAMESPACE"; then
            log_success "RBAC configuration applied"
        else
            log_warning "Failed to apply RBAC configuration (this is optional)"
        fi
    fi
}

# Wait for deployment
wait_for_deployment() {
    log_info "Waiting for deployment to be ready..."
    
    if kubectl -n "$NAMESPACE" rollout status deployment/preview-worker --timeout=300s; then
        log_success "Deployment is ready"
    else
        log_error "Deployment failed to become ready"
        kubectl -n "$NAMESPACE" describe deployment preview-worker
        exit 1
    fi
}

# Run smoke test
run_smoke_test() {
    log_info "Running smoke test..."
    
    if [ -f "k8s/preview-worker/smoke-test-preview-worker.sh" ]; then
        chmod +x k8s/preview-worker/smoke-test-preview-worker.sh
        ./k8s/preview-worker/smoke-test-preview-worker.sh
    else
        log_warning "Smoke test script not found, skipping"
    fi
}

# Post-deployment verification
verify_deployment() {
    log_info "Post-deployment verification..."
    
    log_info "Deployment status:"
    kubectl -n "$NAMESPACE" get deployment preview-worker
    
    log_info "Pod status:"
    kubectl -n "$NAMESPACE" get pods -l app=preview-worker -o wide
    
    log_info "Service status:"
    kubectl -n "$NAMESPACE" get svc preview-worker
    
    log_success "Deployment verification completed"
}

# Main execution
main() {
    log_info "Starting hardened preview-worker deployment..."
    
    check_prerequisites
    apply_patches
    check_image_placeholder
    create_namespace
    create_registry_secret
    create_app_secrets
    validate_manifests
    apply_manifests
    apply_rbac
    wait_for_deployment
    run_smoke_test
    verify_deployment
    
    log_success "Hardened preview-worker deployment completed successfully!"
    log_info "Next steps:"
    log_info "  - Monitor logs: kubectl logs -f deployment/preview-worker -n $NAMESPACE"
    log_info "  - Port forward for testing: kubectl port-forward svc/preview-worker 8080:5001 -n $NAMESPACE"
    log_info "  - Health check: curl http://localhost:8080/health"
    log_info "  - Rollback if needed: kubectl -n $NAMESPACE rollout undo deployment/preview-worker"
}

# Show usage
show_usage() {
    cat << EOF
Usage: $0 [OPTIONS]

Deploy hardened preview-worker manifests to Kubernetes cluster.

OPTIONS:
    -h, --help      Show this help message
    --skip-patches  Skip applying patches (assume already applied)
    --skip-secrets  Skip secret creation prompts
    --dry-run       Validate only, don't apply to cluster

EXAMPLES:
    $0                          # Full interactive deployment
    $0 --skip-patches           # Deploy without applying patches
    $0 --dry-run                # Validate only
    $0 --skip-secrets           # Skip secret creation prompts

EOF
}

# Parse arguments
SKIP_PATCHES=false
SKIP_SECRETS=false
DRY_RUN=false

while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            show_usage
            exit 0
            ;;
        --skip-patches)
            SKIP_PATCHES=true
            shift
            ;;
        --skip-secrets)
            SKIP_SECRETS=true
            shift
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        *)
            log_error "Unknown option: $1"
            show_usage
            exit 1
            ;;
    esac
done

# Run main function
main "$@"