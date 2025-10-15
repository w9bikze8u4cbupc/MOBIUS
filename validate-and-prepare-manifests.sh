#!/bin/bash
# validate-and-prepare-manifests.sh
# Comprehensive manifest validation and preparation for preview-worker deployment

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
DEPLOYMENT_NAME="preview-worker"
SERVICE_NAME="preview-worker"

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

# Check if required tools are available
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    local missing_tools=()
    
    if ! command -v kubectl &> /dev/null; then
        missing_tools+=("kubectl")
    fi
    
    if ! command -v yq &> /dev/null; then
        missing_tools+=("yq")
    fi
    
    if ! command -v jq &> /dev/null; then
        missing_tools+=("jq")
    fi
    
    if [ ${#missing_tools[@]} -ne 0 ]; then
        log_error "Missing required tools: ${missing_tools[*]}"
        log_info "Please install: ${missing_tools[*]}"
        return 1
    fi
    
    log_success "All prerequisites satisfied"
}

# Validate YAML syntax
validate_yaml_syntax() {
    log_info "Validating YAML syntax..."
    
    local yaml_files=("$K8S_DIR"/*.yaml)
    local invalid_files=()
    
    for file in "${yaml_files[@]}"; do
        if [ -f "$file" ]; then
            if ! yq eval '.' "$file" &> /dev/null; then
                invalid_files+=("$file")
            fi
        fi
    done
    
    if [ ${#invalid_files[@]} -ne 0 ]; then
        log_error "Invalid YAML files: ${invalid_files[*]}"
        return 1
    fi
    
    log_success "All YAML files are syntactically valid"
}

# Validate Kubernetes manifests
validate_k8s_manifests() {
    log_info "Validating Kubernetes manifests..."
    
    # Check if kubectl is available and can connect to cluster
    if kubectl cluster-info &> /dev/null; then
        log_info "Cluster connection available - performing full validation"
        
        # Client-side dry-run validation
        log_info "Running client-side dry-run validation..."
        if ! kubectl apply --dry-run=client -f "$K8S_DIR/"; then
            log_error "Client-side validation failed"
            return 1
        fi
        
        # Server-side dry-run validation (if supported)
        if kubectl apply --help | grep -q "server-dry-run"; then
            log_info "Running server-side dry-run validation..."
            if ! kubectl apply --server-dry-run=client -f "$K8S_DIR/"; then
                log_warning "Server-side validation failed (may be due to cluster version)"
            fi
        fi
        
        # Show diff if supported
        if kubectl diff -f "$K8S_DIR/" &> /dev/null; then
            log_info "Showing diff (if any changes would be applied):"
            kubectl diff -f "$K8S_DIR/" || true
        fi
    else
        log_warning "No cluster connection available - performing basic manifest validation"
        
        # Basic manifest structure validation
        for file in "$K8S_DIR"/*.yaml; do
            if [ -f "$file" ]; then
                log_info "Validating $file..."
                
                # Check for required fields
                if ! yq eval '.apiVersion' "$file" &> /dev/null; then
                    log_error "Missing apiVersion in $file"
                    return 1
                fi
                
                if ! yq eval '.kind' "$file" &> /dev/null; then
                    log_error "Missing kind in $file"
                    return 1
                fi
                
                if ! yq eval '.metadata.name' "$file" &> /dev/null; then
                    log_error "Missing metadata.name in $file"
                    return 1
                fi
            fi
        done
    fi
    
    log_success "Manifest validation completed"
}

# Check deployment configuration
validate_deployment_config() {
    log_info "Validating deployment configuration..."
    
    local deployment_file="$K8S_DIR/deployment.yaml"
    
    if [ ! -f "$deployment_file" ]; then
        log_error "Deployment file not found: $deployment_file"
        return 1
    fi
    
    # Check image placeholder
    local image=$(yq eval '.spec.template.spec.containers[0].image' "$deployment_file")
    if [[ "$image" == *"YOUR_REGISTRY"* ]] || [[ "$image" == *"PLACEHOLDER"* ]]; then
        log_warning "Image contains placeholder: $image"
        log_warning "Remember to replace with actual registry/image:tag before deployment"
    fi
    
    # Check resource limits
    local cpu_request=$(yq eval '.spec.template.spec.containers[0].resources.requests.cpu' "$deployment_file")
    local memory_request=$(yq eval '.spec.template.spec.containers[0].resources.requests.memory' "$deployment_file")
    local cpu_limit=$(yq eval '.spec.template.spec.containers[0].resources.limits.cpu' "$deployment_file")
    local memory_limit=$(yq eval '.spec.template.spec.containers[0].resources.limits.memory' "$deployment_file")
    
    log_info "Resource configuration:"
    log_info "  CPU Request: $cpu_request"
    log_info "  Memory Request: $memory_request"
    log_info "  CPU Limit: $cpu_limit"
    log_info "  Memory Limit: $memory_limit"
    
    # Check health probes
    local readiness_path=$(yq eval '.spec.template.spec.containers[0].readinessProbe.httpGet.path' "$deployment_file")
    local liveness_path=$(yq eval '.spec.template.spec.containers[0].livenessProbe.httpGet.path' "$deployment_file")
    
    log_info "Health probes:"
    log_info "  Readiness: $readiness_path"
    log_info "  Liveness: $liveness_path"
    
    log_success "Deployment configuration validation completed"
}

# Check service configuration
validate_service_config() {
    log_info "Validating service configuration..."
    
    local service_file="$K8S_DIR/service.yaml"
    
    if [ ! -f "$service_file" ]; then
        log_error "Service file not found: $service_file"
        return 1
    fi
    
    # Check service type and ports
    local service_type=$(yq eval '.spec.type // "ClusterIP"' "$service_file")
    local port=$(yq eval '.spec.ports[0].port' "$service_file")
    local target_port=$(yq eval '.spec.ports[0].targetPort' "$service_file")
    
    log_info "Service configuration:"
    log_info "  Type: $service_type"
    log_info "  Port: $port"
    log_info "  Target Port: $target_port"
    
    # Check selector matches deployment
    local selector=$(yq eval '.spec.selector' "$service_file" | yq eval 'to_entries | map(.key + ":" + .value) | join(",")' -)
    log_info "  Selector: $selector"
    
    log_success "Service configuration validation completed"
}

# Generate deployment script
generate_deploy_script() {
    log_info "Generating deployment script..."
    
    cat > deploy-preview-worker.sh << 'EOF'
#!/bin/bash
# deploy-preview-worker.sh
# Safe deployment script for preview-worker

set -euo pipefail

NAMESPACE="preview-worker"
K8S_DIR="k8s/preview-worker"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Check cluster connection
if ! kubectl cluster-info &> /dev/null; then
    log_error "Cannot connect to Kubernetes cluster"
    exit 1
fi

# Create namespace if it doesn't exist
log_info "Creating namespace: $NAMESPACE"
kubectl create namespace "$NAMESPACE" --dry-run=client -o yaml | kubectl apply -f -

# Validate manifests before applying
log_info "Validating manifests..."
kubectl apply --dry-run=client -f "$K8S_DIR/"

# Apply manifests
log_info "Applying manifests..."
kubectl apply -f "$K8S_DIR/" -n "$NAMESPACE"

# Wait for deployment to be ready
log_info "Waiting for deployment to be ready..."
kubectl rollout status deployment/preview-worker -n "$NAMESPACE" --timeout=5m

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
kubectl get deployment "$DEPLOYMENT_NAME" -n "$NAMESPACE" -o wide

# Rollback deployment
log_info "Rolling back deployment..."
kubectl rollout undo deployment "$DEPLOYMENT_NAME" -n "$NAMESPACE"

# Wait for rollback to complete
log_info "Waiting for rollback to complete..."
kubectl rollout status deployment "$DEPLOYMENT_NAME" -n "$NAMESPACE" --timeout=5m

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
kubectl get deployment "$DEPLOYMENT_NAME" -n "$NAMESPACE"

# Check pods
log_info "Checking pod status..."
kubectl get pods -n "$NAMESPACE" -o wide

# Check service
log_info "Checking service..."
kubectl get svc "$SERVICE_NAME" -n "$NAMESPACE"

# Check logs from the most recent pod
log_info "Checking logs from most recent pod..."
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

log_info "Health check completed"
EOF

    chmod +x health-check-preview-worker.sh
    log_success "Health check script generated: health-check-preview-worker.sh"
}

# Main execution
main() {
    log_info "Starting manifest validation and preparation..."
    
    # Check prerequisites
    if ! check_prerequisites; then
        log_warning "Some prerequisites missing - continuing with basic validation"
    fi
    
    # Validate YAML syntax
    validate_yaml_syntax
    
    # Validate deployment configuration
    validate_deployment_config
    
    # Validate service configuration
    validate_service_config
    
    # Validate Kubernetes manifests (if cluster available)
    validate_k8s_manifests
    
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
    log_info "  2. When you have cluster access, run: ./deploy-preview-worker.sh"
    log_info "  3. After deployment, run: ./health-check-preview-worker.sh"
    log_info "  4. If issues occur, run: ./rollback-preview-worker.sh"
}

# Run main function
main "$@"