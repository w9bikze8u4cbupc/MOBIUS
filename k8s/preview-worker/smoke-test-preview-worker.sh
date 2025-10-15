#!/usr/bin/env bash
set -euo pipefail

# smoke-test-preview-worker.sh
# Comprehensive smoke test for preview-worker deployment
# Tests deployment, health checks, and basic functionality

NAMESPACE="preview-worker"
DEPLOYMENT="preview-worker"
SERVICE="preview-worker"
PORT=80
LOCAL_PORT=8080
TIMEOUT=300  # 5 minutes

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

# Create namespace if needed
create_namespace() {
    log_info "Creating namespace if needed..."
    kubectl create namespace "${NAMESPACE}" 2>/dev/null || {
        log_info "Namespace ${NAMESPACE} already exists"
    }
}

# Validate manifests (dry-run)
validate_manifests() {
    log_info "Validating manifests (dry-run)..."
    
    if kubectl apply --dry-run=client -f k8s/preview-worker/ -n "${NAMESPACE}"; then
        log_success "Manifest validation passed"
    else
        log_error "Manifest validation failed"
        exit 1
    fi
}

# Apply manifests
apply_manifests() {
    log_info "Applying manifests to cluster..."
    
    if kubectl apply -f k8s/preview-worker/ -n "${NAMESPACE}"; then
        log_success "Manifests applied successfully"
    else
        log_error "Failed to apply manifests"
        exit 1
    fi
}

# Wait for deployment rollout
wait_for_rollout() {
    log_info "Waiting for deployment rollout..."
    
    if kubectl -n "${NAMESPACE}" rollout status deployment/"${DEPLOYMENT}" --timeout=${TIMEOUT}s; then
        log_success "Deployment rolled out successfully"
    else
        log_error "Deployment rollout failed or timed out"
        log_info "Checking deployment status..."
        kubectl describe deployment "${DEPLOYMENT}" -n "${NAMESPACE}"
        exit 1
    fi
}

# Check pod status
check_pods() {
    log_info "Checking pod status..."
    
    local pods_ready=$(kubectl -n "${NAMESPACE}" get pods -l app="${DEPLOYMENT}" -o jsonpath='{.items[?(@.status.phase=="Running")].status.conditions[?(@.type=="Ready")].status}' | grep -o "True" | wc -l)
    local total_pods=$(kubectl -n "${NAMESPACE}" get pods -l app="${DEPLOYMENT}" --no-headers | wc -l)
    
    log_info "Pods ready: ${pods_ready}/${total_pods}"
    kubectl -n "${NAMESPACE}" get pods -l app="${DEPLOYMENT}" -o wide
    
    if [ "${pods_ready}" -eq "${total_pods}" ] && [ "${total_pods}" -gt 0 ]; then
        log_success "All pods are ready"
    else
        log_error "Not all pods are ready"
        return 1
    fi
}

# Check service
check_service() {
    log_info "Checking service..."
    
    if kubectl -n "${NAMESPACE}" get svc "${SERVICE}" &> /dev/null; then
        log_success "Service exists"
        kubectl -n "${NAMESPACE}" get svc "${SERVICE}"
    else
        log_error "Service not found"
        return 1
    fi
}

# Test health endpoint
test_health_endpoint() {
    log_info "Testing health endpoint..."
    
    # Get pod name
    local pod_name=$(kubectl -n "${NAMESPACE}" get pods -l app="${DEPLOYMENT}" -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")
    
    if [ -z "${pod_name}" ]; then
        log_error "No pods found for deployment"
        return 1
    fi
    
    log_info "Using pod: ${pod_name}"
    
    # Port forward
    log_info "Setting up port-forward..."
    kubectl -n "${NAMESPACE}" port-forward "${pod_name}" ${LOCAL_PORT}:${PORT} >/dev/null 2>&1 &
    local pf_pid=$!
    
    # Wait for port-forward to be ready
    sleep 3
    
    # Test health endpoint
    log_info "Testing health endpoint at http://localhost:${LOCAL_PORT}/api/preview/worker/health"
    if curl -sSf -m 10 http://localhost:${LOCAL_PORT}/api/preview/worker/health; then
        log_success "Health endpoint responding successfully"
    else
        log_error "Health endpoint test failed"
        kill ${pf_pid} 2>/dev/null || true
        return 1
    fi
    
    # Clean up port-forward
    kill ${pf_pid} 2>/dev/null || true
    wait ${pf_pid} 2>/dev/null || true
}

# Check logs for issues
check_logs() {
    log_info "Checking recent logs for issues..."
    
    local pod_name=$(kubectl -n "${NAMESPACE}" get pods -l app="${DEPLOYMENT}" -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")
    
    if [ -n "${pod_name}" ]; then
        log_info "Recent logs from pod ${pod_name}:"
        kubectl -n "${NAMESPACE}" logs "${pod_name}" --tail=100
        
        # Check for common error patterns
        log_info "Checking for error patterns..."
        if kubectl -n "${NAMESPACE}" logs "${pod_name}" --tail=200 | grep -i -E 'error|exception|failed|panic'; then
            log_warning "Found potential errors in logs (review above)"
        else
            log_success "No obvious errors found in logs"
        fi
    fi
}

# Test basic functionality
test_functionality() {
    log_info "Testing basic functionality..."
    
    local pod_name=$(kubectl -n "${NAMESPACE}" get pods -l app="${DEPLOYMENT}" -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")
    
    if [ -z "${pod_name}" ]; then
        log_error "No pods found for functionality test"
        return 1
    fi
    
    # Test if pod can execute basic commands
    log_info "Testing pod execution capability..."
    if kubectl -n "${NAMESPACE}" exec "${pod_name}" -- echo "test" &> /dev/null; then
        log_success "Pod can execute commands"
    else
        log_warning "Pod may not support exec (this is normal for some security configurations)"
    fi
    
    # Test metrics endpoint if available
    log_info "Testing metrics endpoint..."
    kubectl -n "${NAMESPACE}" port-forward "${pod_name}" ${LOCAL_PORT}:${PORT} >/dev/null 2>&1 &
    local pf_pid=$!
    sleep 3
    
    if curl -s -m 5 http://localhost:${LOCAL_PORT}/metrics 2>/dev/null | head -5; then
        log_success "Metrics endpoint accessible"
    else
        log_info "Metrics endpoint not available (this is optional)"
    fi
    
    kill ${pf_pid} 2>/dev/null || true
}

# Check deployment events
check_events() {
    log_info "Checking recent events..."
    
    kubectl -n "${NAMESPACE}" get events --sort-by='.lastTimestamp' | tail -10
    
    # Check for warning events
    local warning_events=$(kubectl -n "${NAMESPACE}" get events --field-selector type=Warning --no-headers 2>/dev/null | wc -l)
    if [ "${warning_events}" -gt 0 ]; then
        log_warning "Found ${warning_events} warning events (review above)"
    else
        log_success "No warning events found"
    fi
}

# Cleanup function
cleanup() {
    log_info "Cleaning up..."
    # Kill any remaining port-forwards
    pkill -f "kubectl.*port-forward.*${NAMESPACE}" 2>/dev/null || true
}

# Main execution
main() {
    log_info "Starting preview-worker smoke test..."
    
    # Set trap for cleanup
    trap cleanup EXIT
    
    # Run tests
    check_prerequisites
    create_namespace
    validate_manifests
    apply_manifests
    wait_for_rollout
    check_pods
    check_service
    test_health_endpoint
    check_logs
    test_functionality
    check_events
    
    log_success "Smoke test completed successfully!"
    log_info "Preview-worker deployment appears to be working correctly."
    log_info "You can now:"
    log_info "  - Access the service internally at: preview-worker.${NAMESPACE}.svc.cluster.local:80"
    log_info "  - Monitor logs with: kubectl logs -f deployment/${DEPLOYMENT} -n ${NAMESPACE}"
    log_info "  - Scale the deployment: kubectl scale deployment/${DEPLOYMENT} --replicas=3 -n ${NAMESPACE}"
}

# Run main function
main "$@"