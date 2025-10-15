# Preview Worker Final Manifests Summary

This document summarizes the finalized Kubernetes manifests for the Preview Worker implementation with default configuration values.

## Configuration Used

- **Container Image**: `ghcr.io/your-org/mobius-preview-worker:latest`
- **Namespace**: `preview-worker`
- **Image Pull Policy**: `IfNotPresent`
- **Replicas**: `1`
- **Worker Concurrency**: `2`
- **Redis Connection**: `redis://redis.default.svc.cluster.local:6379`
- **HPA**: Enabled (1→6 replicas, CPU target 60%)
- **Prometheus ServiceMonitor Label**: `release=prometheus`

## Updated Manifest Files

All manifest files have been updated with the namespace and default configuration values:

1. `k8s/preview-worker/deployment.yaml`
2. `k8s/preview-worker/configmap.yaml`
3. `k8s/preview-worker/service.yaml`
4. `k8s/preview-worker/hpa.yaml`
5. `k8s/preview-worker/servicemonitor.yaml`
6. `k8s/preview-worker/secret-example.yaml`
7. `k8s/preview-worker/alert-rule-preview-worker.yaml` (unchanged)

## Deployment Commands

To deploy the Preview Worker to your Kubernetes cluster:

```bash
# Create the namespace
kubectl create namespace preview-worker

# Apply the manifests
kubectl apply -f k8s/preview-worker/

# Check deployment status
kubectl -n preview-worker get deployments
kubectl -n preview-worker get pods
```

## Smoke Test Checklist

1. **Health Endpoint Check**:
   ```bash
   kubectl -n preview-worker port-forward service/preview-worker 3000:3000
   # In another terminal:
   curl http://localhost:3000/api/preview/worker/health
   ```

2. **Dry-run Job Submission**:
   ```bash
   # Create a dry-run job
   curl -X POST http://localhost:3000/api/preview/job \
     -H "Content-Type: application/json" \
     -d @preview_payload_minimal.json
   ```

3. **Verify Metrics Endpoint**:
   ```bash
   curl http://localhost:3000/metrics
   ```

4. **Check HPA Status**:
   ```bash
   kubectl -n preview-worker get hpa
   ```

5. **Verify ServiceMonitor**:
   ```bash
   kubectl -n preview-worker get servicemonitor
   ```

## Rollback Commands

To rollback the deployment:

```bash
kubectl delete -f k8s/preview-worker/
kubectl delete namespace preview-worker
```

## Next Steps

1. Replace `ghcr.io/your-org/mobius-preview-worker:latest` with your actual container image
2. Update Redis connection details in the ConfigMap if needed
3. Add actual Redis password to the secrets
4. Adjust resource limits based on your environment
5. Configure proper monitoring and alerting