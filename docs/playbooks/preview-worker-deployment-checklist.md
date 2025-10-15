# Preview Worker Deployment Checklist

## Pre-deployment

- [ ] Verify container image is available in registry
- [ ] Update Redis connection details if needed
- [ ] Add actual Redis password to secrets
- [ ] Review resource limits for your environment

## Deployment

- [ ] Create namespace: `kubectl create namespace preview-worker`
- [ ] Apply manifests: `kubectl apply -f k8s/preview-worker/`
- [ ] Verify deployment: `kubectl -n preview-worker get deployments`
- [ ] Check pod status: `kubectl -n preview-worker get pods`

## Health Checks

- [ ] Port forward: `kubectl -n preview-worker port-forward service/preview-worker 3000:3000`
- [ ] Health endpoint: `curl http://localhost:3000/api/preview/worker/health`
- [ ] Metrics endpoint: `curl http://localhost:3000/metrics`

## Functionality Tests

- [ ] Submit dry-run job: `curl -X POST http://localhost:3000/api/preview/job -H "Content-Type: application/json" -d @preview_payload_minimal.json`
- [ ] Check HPA status: `kubectl -n preview-worker get hpa`
- [ ] Verify ServiceMonitor: `kubectl -n preview-worker get servicemonitor`

## Monitoring

- [ ] Check Prometheus is scraping metrics
- [ ] Verify alert rules are loaded
- [ ] Confirm logs are being collected

## Rollback (if needed)

- [ ] Delete resources: `kubectl delete -f k8s/preview-worker/`
- [ ] Delete namespace: `kubectl delete namespace preview-worker`