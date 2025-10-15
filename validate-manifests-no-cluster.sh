#!/bin/bash
# validate-manifests-no-cluster.sh
# Manifest validation without cluster access

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
K8S_DIR="k8s/preview-worker"
NAMESPACE="preview-worker"

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check prerequisites (without cluster-dependent tools)
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check if manifest files exist
    if [ ! -d "$K8S_DIR" ]; then
        log_error "Kubernetes manifests directory not found: $K8S_DIR"
        return 1
    fi
    
    if [ ! -f "$K8S_DIR/deployment.yaml" ]; then
        log_error "Deployment manifest not found: $K8S_DIR/deployment.yaml"
        return 1
    fi
    
    if [ ! -f "$K8S_DIR/service.yaml" ]; then
        log_error "Service manifest not found: $K8S_DIR/service.yaml"
        return 1
    fi
    
    log_success "All manifest files found"
}

# Basic YAML structure validation
validate_yaml_structure() {
    log_info "Validating YAML structure..."
    
    local errors=0
    
    # Validate deployment.yaml
    log_info "Validating deployment.yaml..."
    if ! grep -q "apiVersion: apps/v1" "$K8S_DIR/deployment.yaml"; then
        log_error "Missing apiVersion in deployment.yaml"
        errors=$((errors + 1))
    fi
    
    if ! grep -q "kind: Deployment" "$K8S_DIR/deployment.yaml"; then
        log_error "Missing kind: Deployment in deployment.yaml"
        errors=$((errors + 1))
    fi
    
    if ! grep -q "name: preview-worker" "$K8S_DIR/deployment.yaml"; then
        log_error "Missing name: preview-worker in deployment.yaml"
        errors=$((errors + 1))
    fi
    
    # Validate service.yaml
    log_info "Validating service.yaml..."
    if ! grep -q "apiVersion: v1" "$K8S_DIR/service.yaml"; then
        log_error "Missing apiVersion in service.yaml"
        errors=$((errors + 1))
    fi
    
    if ! grep -q "kind: Service" "$K8S_DIR/service.yaml"; then
        log_error "Missing kind: Service in service.yaml"
        errors=$((errors + 1))
    fi
    
    if ! grep -q "name: preview-worker" "$K8S_DIR/service.yaml"; then
        log_error "Missing name: preview-worker in service.yaml"
        errors=$((errors + 1))
    fi
    
    if [ $errors -gt 0 ]; then
        log_error "Found $errors validation errors"
        return 1
    fi
    
    log_success "YAML structure validation passed"
}

# Check deployment configuration
check_deployment_config() {
    log_info "Checking deployment configuration..."
    
    local deployment_file="$K8S_DIR/deployment.yaml"
    
    # Check image placeholder
    if grep -q "YOUR_REGISTRY/mobius-preview-worker" "$deployment_file"; then
        log_warning "Image contains placeholder - needs to be updated before deployment"
        log_warning "Current image: $(grep "image:" "$deployment_file" | head -1)"
    fi
    
    # Check resource configuration
    if grep -q "resources:" "$deployment_file"; then
        log_info "Resource limits configured"
        grep -A 10 "resources:" "$deployment_file" | grep -E "(cpu|memory)" | while read -r line; do
            log_info "  $line"
        done
    else
        log_warning "No resource limits configured"
    fi
    
    # Check health probes
    if grep -q "readinessProbe:" "$deployment_file"; then
        log_info "Readiness probe configured"
    else
        log_warning "No readiness probe configured"
    fi
    
    if grep -q "livenessProbe:" "$deployment_file"; then
        log_info "Liveness probe configured"
    else
        log_warning "No liveness probe configured"
    fi
    
    # Check environment variables
    if grep -q "env:" "$deployment_file"; then
        log_info "Environment variables configured"
        grep -A 20 "env:" "$deployment_file" | grep "name:" | while read -r line; do
            log_info "  $line"
        done
    fi
    
    log_success "Deployment configuration check completed"
}

# Check service configuration
check_service_config() {
    log_info "Checking service configuration..."
    
    local service_file="$K8S_DIR/service.yaml"
    
    # Check port configuration
    if grep -q "port:" "$service_file"; then
        log_info "Service port configured"
        grep "port:" "$service_file" | while read -r line; do
            log_info "  $line"
        done
    fi
    
    # Check selector matches deployment
    if grep -q "app: preview-worker" "$service_file"; then
        log_info "Service selector matches deployment labels"
    else
        log_warning "Service selector may not match deployment labels"
    fi
    
    log_success "Service configuration check completed"
}

# Generate deployment script
generate_deploy_script() {
    log_info "Generating deployment script..."
    
    cat > deploy-preview-worker.sh << 'EOF'
#!/bin/bash
# deploy-preview-worker.sh
# Safe deployment script for preview-worker (cluster-ready)

set -euo pipefail

NAMESPACE="preview-worker"
K8S_DIR="k8s/preview-worker"
DEPLOYMENT_NAME="preview-worker"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Check cluster connection
if ! kubectl cluster-info &> /dev/null; then
    log_error "Cannot connect to Kubernetes cluster"
    log_error "Please ensure you have cluster access and kubectl is configured"
    exit 1
fi

log_success "Connected to Kubernetes cluster"

# Check if namespace exists, create if not
if ! kubectl get namespace "$NAMESPACE" &> /dev/null; then
    log_info "Creating namespace: $NAMESPACE"
    kubectl create namespace "$NAMESPACE"
else
    log_info "Namespace $NAMESPACE already exists"
fi

# Validate manifests before applying
log_info "Validating manifests..."
if kubectl apply --dry-run=client -f "$K8S_DIR/" -n "$NAMESPACE"; then
    log_success "Manifest validation passed"
else
    log_error "Manifest validation failed"
    exit 1
fi

# Apply manifests
log_info "Applying manifests..."
kubectl apply -f "$K8S_DIR/" -n "$NAMESPACE"

# Wait for deployment to be ready
log_info "Waiting for deployment to be ready..."
if kubectl rollout status deployment/$DEPLOYMENT_NAME -n "$NAMESPACE" --timeout=5m; then
    log_success "Deployment rolled out successfully"
else
    log_error "Deployment rollout failed or timed out"
    log_info "Checking deployment status..."
    kubectl describe deployment $DEPLOYMENT_NAME -n "$NAMESPACE"
    exit 1
fi

# Check pod status
log_info "Checking pod status..."
kubectl get pods -n "$NAMESPACE" -o wide

# Check service
log_info "Checking service..."
kubectl get svc -n "$NAMESPACE"

log_success "Deployment completed successfully!"

# Optional: Port forward for testing
read -p "Do you want to port-forward the service for testing? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    log_info "Port-forwarding service to localhost:8080..."
    log_info "Access health endpoint at: http://localhost:8080/api/preview/worker/health"
    kubectl port-forward svc/preview-worker 8080:80 -n "$NAMESPACE"
fi
EOF

    chmod +x deploy-preview-worker.sh
    log_success "Deployment script generated: deploy-preview-worker.sh"
}

# Generate rollback script
generate_rollback_script() {
    log_info "Generating rollback script..."
    
    cat > rollback-preview-worker.sh << 'EOF'
#!/bin/bash
# rollback-preview-worker.sh
# Rollback script for preview-worker deployment

set -euo pipefail

NAMESPACE="preview-worker"
DEPLOYMENT_NAME="preview-worker"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Check cluster connection
if ! kubectl cluster-info &> /dev/null; then
    log_error "Cannot connect to Kubernetes cluster"
    exit 1
fi

# Show current deployment status
log_info "Current deployment status:"
kubectl get deployment "$DEPLOYMENT_NAME" -n "$NAMESPACE" -o wide 2>/dev/null || {
    log_error "Deployment $DEPLOYMENT_NAME not found in namespace $NAMESPACE"
    exit 1
}

# Rollback deployment
log_info "Rolling back deployment..."
kubectl rollout undo deployment "$DEPLOYMENT_NAME" -n "$NAMESPACE"

# Wait for rollback to complete
log_info "Waiting for rollback to complete..."
if kubectl rollout status deployment "$DEPLOYMENT_NAME" -n "$NAMESPACE" --timeout=5m; then
    log_success "Rollback completed successfully"
else
    log_error "Rollback failed or timed out"
    exit 1
fi

# Check pod status after rollback
log_info "Pod status after rollback:"
kubectl get pods -n "$NAMESPACE" -o wide

log_success "Rollback completed successfully!"

# Optional: Show deployment history
read -p "Do you want to see deployment history? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    log_info "Deployment history:"
    kubectl rollout history deployment "$DEPLOYMENT_NAME" -n "$NAMESPACE"
fi
EOF

    chmod +x rollback-preview-worker.sh
    log_success "Rollback script generated: rollback-preview-worker.sh"
}

# Generate health check script
generate_health_check_script() {
    log_info "Generating health check script..."
    
    cat > health-check-preview-worker.sh << 'EOF'
#!/bin/bash
# health-check-preview-worker.sh
# Health check script for preview-worker deployment

set -euo pipefail

NAMESPACE="preview-worker"
DEPLOYMENT_NAME="preview-worker"
SERVICE_NAME="preview-worker"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Check cluster connection
if ! kubectl cluster-info &> /dev/null; then
    log_error "Cannot connect to Kubernetes cluster"
    exit 1
fi

# Check if namespace exists
if ! kubectl get namespace "$NAMESPACE" &> /dev/null; then
    log_error "Namespace $NAMESPACE does not exist"
    exit 1
fi

# Check deployment
log_info "Checking deployment status..."
kubectl get deployment "$DEPLOYMENT_NAME" -n "$NAMESPACE" 2>/dev/null || {
    log_error "Deployment $DEPLOYMENT_NAME not found in namespace $NAMESPACE"
    exit 1
}

# Check pods
log_info "Checking pod status..."
kubectl get pods -n "$NAMESPACE" -o wide

# Check service
log_info "Checking service..."
kubectl get svc "$SERVICE_NAME" -n "$NAMESPACE" 2>/dev/null || {
    log_error "Service $SERVICE_NAME not found in namespace $NAMESPACE"
    exit 1
}

# Check logs from the most recent pod
POD_NAME=$(kubectl get pods -n "$NAMESPACE" -l app=preview-worker -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")
if [ -n "$POD_NAME" ]; then
    log_info "Recent logs from pod $POD_NAME:"
    kubectl logs "$POD_NAME" -n "$NAMESPACE" --tail=50
    
    # Check health endpoint if pod is running
    if kubectl get pod "$POD_NAME" -n "$NAMESPACE" -o jsonpath='{.status.phase}' | grep -q "Running"; then
        log_info "Checking health endpoint..."
        
        # Try to exec curl from inside the pod
        if kubectl exec "$POD_NAME" -n "$NAMESPACE" -- curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/preview/worker/health &> /dev/null; then
            HEALTH_STATUS=$(kubectl exec "$POD_NAME" -n "$NAMESPACE" -- curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/preview/worker/health)
            if [ "$HEALTH_STATUS" = "200" ]; then
                log_success "Health endpoint responding with HTTP 200"
            else
                log_error "Health endpoint responding with HTTP $HEALTH_STATUS"
            fi
        else
            log_warning "Could not check health endpoint (curl not available in pod)"
        fi
    fi
else
    log_error "No pods found for deployment"
fi

# Check deployment events for any issues
log_info "Checking recent events..."
kubectl get events -n "$NAMESPACE" --sort-by='.lastTimestamp' | tail -10

log_info "Health check completed"
EOF

    chmod +x health-check-preview-worker.sh
    log_success "Health check script generated: health-check-preview-worker.sh"
}

# Main execution
main() {
    log_info "Starting manifest validation and preparation (no cluster required)..."
    
    # Check prerequisites
    check_prerequisites
    
    # Validate YAML structure
    validate_yaml_structure
    
    # Check deployment configuration
    check_deployment_config
    
    # Check service configuration
    check_service_config
    
    # Generate scripts
    generate_deploy_script
    generate_rollback_script
    generate_health_check_script
    
    log_success "Manifest validation and preparation completed!"
    log_info "Generated scripts:"
    log_info "  - deploy-preview-worker.sh (deployment script)"
    log_info "  - rollback-preview-worker.sh (rollback script)"
    log_info "  - health-check-preview-worker.sh (health check script)"
    log_info ""
    log_info "Next steps:"
    log_info "  1. Review the generated scripts"
    log_info "  2. Update the image registry in k8s/preview-worker/deployment.yaml"
    log_info "  3. When you have cluster access, run: ./deploy-preview-worker.sh"
    log_info "  4. After deployment, run: ./health-check-preview-worker.sh"
    log_info "  5. If issues occur, run: ./rollback-preview-worker.sh"
}

# Run main function
main "$@"