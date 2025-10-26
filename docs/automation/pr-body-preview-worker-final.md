# Finalize Preview Worker Kubernetes Manifests

This PR finalizes the Kubernetes manifests for the Preview Worker with production-ready configurations.

## Summary of Changes

- Updated all Kubernetes manifests with default production values
- Added namespace to all resources
- Configured HPA with appropriate scaling parameters
- Set up ServiceMonitor for Prometheus integration
- Updated container image to `ghcr.io/your-org/mobius-preview-worker:latest`
- Configured Redis connection to `redis.default.svc.cluster.local:6379`

## Files Modified

- `k8s/preview-worker/deployment.yaml`
- `k8s/preview-worker/configmap.yaml`
- `k8s/preview-worker/service.yaml`
- `k8s/preview-worker/hpa.yaml`
- `k8s/preview-worker/servicemonitor.yaml`
- `k8s/preview-worker/secret-example.yaml`

## Deployment Instructions

1. Create the namespace:
   ```bash
   kubectl create namespace preview-worker
   ```

2. Apply the manifests:
   ```bash
   kubectl apply -f k8s/preview-worker/
   ```

3. Verify deployment:
   ```bash
   kubectl -n preview-worker get deployments
   kubectl -n preview-worker get pods
   ```

## Testing

- Health endpoint is available at `/api/preview/worker/health`
- Metrics are exposed at `/metrics`
- HPA is configured for automatic scaling (1-6 replicas)

## Next Steps

- Replace the placeholder container image with your actual image
- Update Redis connection details as needed
- Add actual Redis password to the secrets
- Adjust resource limits based on your environment