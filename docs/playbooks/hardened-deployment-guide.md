# Hardened Preview Worker Deployment - Complete Guide

## Overview
This guide provides hardened Kubernetes manifests for the preview-worker deployment with enhanced security, resource management, and operational best practices.

## 🚀 Quick Start

### 1. Prerequisites
```bash
# Ensure you have cluster access
kubectl cluster-info

# Check permissions
kubectl auth can-i create deployment -n preview-worker
kubectl auth can-i create serviceaccount -n preview-worker
```

### 2. One-Command Deployment
```bash
# Create namespace and deploy everything
kubectl create namespace preview-worker --dry-run=client -o yaml | kubectl apply -f -
kubectl apply -f k8s/preview-worker/hardened-deployment.yaml -n preview-worker
kubectl apply -f k8s/preview-worker/rbac.yaml -n preview-worker  # Optional
chmod +x k8s/preview-worker/smoke-test-preview-worker.sh
./k8s/preview-worker/smoke-test-preview-worker.sh
```

## 📋 Pre-Deployment Checklist

### Critical Updates Required
1. **Replace Image Placeholder** in `hardened-deployment.yaml`:
   ```yaml
   # CURRENT (placeholder):
   image: YOUR_REGISTRY/mobius-preview-worker:TAG
   
   # UPDATE to your actual registry:
   image: your-registry.com/mobius-preview-worker:1.0.0
   ```

2. **Create Registry Secret** (if using private registry):
   ```bash
   kubectl create secret docker-registry regcred \
     --docker-server=your-registry.com \
     --docker-username=your-username \
     --docker-password=your-password \
     --docker-email=your-email \
     -n preview-worker
   ```

3. **Create Application Secrets**:
   ```bash
   kubectl create secret generic preview-worker-secrets \
     --from-literal=REDIS_URL='redis://your-redis:6379' \
     --from-literal=API_KEY='your-api-key' \
     -n preview-worker
   ```

## 🔒 Security Hardening Features

### ServiceAccount & RBAC
- Dedicated ServiceAccount (`preview-worker`)
- Minimal RBAC permissions (namespace-scoped only)
- No cluster-wide privileges

### Security Context
- Runs as non-root user (UID 1000)
- Read-only root filesystem
- No privilege escalation
- All capabilities dropped
- Dedicated tmp and cache volumes

### Resource Management
- CPU requests: 150m, limits: 500m
- Memory requests: 256Mi, limits: 512Mi
- Conservative defaults for small workloads

### Health & Reliability
- Liveness probe: `/api/preview/worker/health`
- Readiness probe: `/api/preview/worker/health`
- Rolling update strategy
- Graceful termination (30s)

## 📁 Manifest Files

| File | Purpose | Status |
|------|---------|---------|
| `hardened-deployment.yaml` | Main deployment with security hardening | ✅ Ready |
| `rbac.yaml` | Optional RBAC configuration | ✅ Optional |
| `smoke-test-preview-worker.sh` | Comprehensive smoke test | ✅ Ready |

## 🛠️ Deployment Commands

### Safe Deployment Process
```bash
# 1. Validate manifests (dry-run)
kubectl apply --dry-run=client -f k8s/preview-worker/hardened-deployment.yaml -n preview-worker

# 2. Apply manifests
kubectl apply -f k8s/preview-worker/hardened-deployment.yaml -n preview-worker

# 3. Wait for rollout
kubectl -n preview-worker rollout status deployment/preview-worker --timeout=300s

# 4. Check status
kubectl -n preview-worker get pods -o wide
kubectl -n preview-worker get svc

# 5. Run smoke test
./k8s/preview-worker/smoke-test-preview-worker.sh
```

### Rollback Commands
```bash
# Quick rollback
kubectl -n preview-worker rollout undo deployment/preview-worker

# Check rollback status
kubectl -n preview-worker rollout status deployment/preview-worker

# View rollout history
kubectl -n preview-worker rollout history deployment/preview-worker
```

## 🔍 Monitoring & Troubleshooting

### Health Checks
```bash
# Check deployment status
kubectl -n preview-worker get deployment preview-worker

# Check pod logs
kubectl -n preview-worker logs -f deployment/preview-worker

# Check events
kubectl -n preview-worker get events --sort-by='.lastTimestamp'

# Port-forward for testing
kubectl -n preview-worker port-forward svc/preview-worker 8080:80
# Test: curl http://localhost:8080/api/preview/worker/health
```

### Common Issues

#### Image Pull Errors
```bash
# Check events
kubectl -n preview-worker get events --field-selector type=Warning

# Verify registry secret
kubectl -n preview-worker get secret regcred -o yaml

# Test image pull manually
kubectl -n preview-worker run test-pull --image=your-registry.com/mobius-preview-worker:1.0.0 --rm -it -- /bin/sh
```

#### Pod CrashLoopBackOff
```bash
# Check logs
kubectl -n preview-worker logs deployment/preview-worker --previous

# Check resource usage
kubectl -n preview-worker top pods

# Describe pod for events
kubectl -n preview-worker describe pod -l app=preview-worker
```

## 📊 Resource Scaling

### Horizontal Scaling
```bash
# Scale to 3 replicas
kubectl -n preview-worker scale deployment/preview-worker --replicas=3

# Check scaling
kubectl -n preview-worker get pods -l app=preview-worker
```

### Resource Adjustment
Edit `hardened-deployment.yaml` and adjust:
```yaml
resources:
  requests:
    cpu: "300m"      # Increase for higher load
    memory: "512Mi"
  limits:
    cpu: "1000m"
    memory: "1Gi"
```

## 🔧 Customization Options

### Environment Variables
Add custom environment variables in the deployment:
```yaml
env:
  - name: CUSTOM_VAR
    value: "custom-value"
  - name: SECRET_VAR
    valueFrom:
      secretKeyRef:
        name: preview-worker-secrets
        key: SECRET_VAR
```

### Health Probe Paths
If your app uses different health endpoints:
```yaml
livenessProbe:
  httpGet:
    path: /your/health/path
    port: http
```

### Network Policies
Add network policies for additional security:
```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: preview-worker-network-policy
  namespace: preview-worker
spec:
  podSelector:
    matchLabels:
      app: preview-worker
  policyTypes:
  - Ingress
  - Egress
```

## 🧪 Testing

### Smoke Test
The included smoke test script performs:
- Manifest validation
- Deployment rollout verification
- Pod health checks
- Service connectivity tests
- Health endpoint verification
- Log analysis for errors

### Manual Testing
```bash
# Port forward
kubectl -n preview-worker port-forward svc/preview-worker 8080:80

# Test health
curl -s http://localhost:8080/api/preview/worker/health

# Test metrics (if available)
curl -s http://localhost:8080/metrics
```

## 🚨 Emergency Procedures

### Quick Rollback
```bash
# Immediate rollback
kubectl -n preview-worker rollout undo deployment/preview-worker

# Force rollout restart
kubectl -n preview-worker rollout restart deployment/preview-worker
```

### Complete Removal
```bash
# Delete everything
kubectl delete namespace preview-worker

# Or delete specific resources
kubectl -n preview-worker delete -f k8s/preview-worker/hardened-deployment.yaml
```

## 📈 Performance Tuning

### Resource Optimization
- Monitor CPU/memory usage with `kubectl top`
- Adjust requests/limits based on actual usage
- Use horizontal pod autoscaling for dynamic scaling

### Startup Optimization
- Optimize container image size
- Use multi-stage builds
- Implement proper health check timing

## 🔗 Integration

### CI/CD Integration
```bash
# Add to your CI pipeline
kubectl apply --dry-run=client -f k8s/preview-worker/hardened-deployment.yaml
kubectl apply -f k8s/preview-worker/hardened-deployment.yaml -n preview-worker
kubectl -n preview-worker rollout status deployment/preview-worker
./k8s/preview-worker/smoke-test-preview-worker.sh
```

### GitOps Integration
- Store manifests in Git repository
- Use ArgoCD or Flux for automated deployment
- Implement progressive delivery with Flagger

## 📚 Additional Resources

### Kubernetes Documentation
- [Security Best Practices](https://kubernetes.io/docs/concepts/security/)
- [Resource Management](https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/)
- [Health Checks](https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/)

### Monitoring Tools
- Prometheus + Grafana for metrics
- Jaeger for distributed tracing
- ELK stack for centralized logging

---

**Next Steps:**
1. Update the image registry in `hardened-deployment.yaml`
2. Create required secrets
3. Run the smoke test script
4. Monitor deployment health
5. Adjust resources based on actual usage

**Support:** If you encounter issues, check the troubleshooting section or run the smoke test script for diagnostic information.