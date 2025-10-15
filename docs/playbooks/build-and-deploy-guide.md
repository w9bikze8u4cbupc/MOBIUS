# Preview Worker Build and Deployment Guide

## Overview
This guide provides instructions for building and deploying the Preview Worker in both traditional (systemd) and containerized (Kubernetes) environments.

## Prerequisites
- Node.js 18+
- Docker (for containerized deployment)
- Kubernetes cluster (for Kubernetes deployment)
- Redis server (local or remote)
- Git

## Local Development and Testing

### Setup
1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd mobius-games-tutorial-generator
   ```

2. Install dependencies:
   ```bash
   npm ci
   ```

3. Ensure Redis is running:
   ```bash
   # Using Docker
   docker run -d -p 6379:6379 redis:alpine
   
   # Or start your existing Redis instance
   ```

### Testing
1. Run payload validation tests:
   ```bash
   npm run test:preview-payloads
   ```

2. Run unit tests:
   ```bash
   npm test
   ```

3. Run cross-platform verification scripts:
   ```bash
   # Unix/Linux/macOS
   ./scripts/verify-preview-worker.sh
   
   # Windows
   .\scripts\verify-preview-worker.ps1
   ```

### Local Execution
1. Start the worker:
   ```bash
   npm run worker:preview
   ```

2. Test the endpoints:
   ```bash
   # Health check
   curl http://localhost:5001/api/preview/worker/health
   
   # Submit a dry-run job
   curl -X POST http://localhost:5001/api/preview/job \
     -H "Content-Type: application/json" \
     -d @preview_payload_minimal.json
   ```

## Building the Docker Image

### Build Process
1. Build the Docker image:
   ```bash
   docker build -t YOUR_REGISTRY/mobius-preview-worker:latest .
   ```

2. Test the image locally:
   ```bash
   docker run -p 3000:3000 \
     -e REDIS_URL=redis://host.docker.internal:6379 \
     YOUR_REGISTRY/mobius-preview-worker:latest
   ```

3. Push the image to your registry:
   ```bash
   docker push YOUR_REGISTRY/mobius-preview-worker:latest
   ```

## Traditional Deployment (systemd)

### Installation
1. Copy the service file:
   ```bash
   sudo cp preview-worker.service /etc/systemd/system/
   ```

2. Create the environment file:
   ```bash
   sudo mkdir -p /etc/mobius
   sudo cp preview-worker.env.example /etc/mobius/preview-worker.env
   sudo nano /etc/mobius/preview-worker.env  # Edit with your values
   ```

3. Reload systemd and start the service:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable preview-worker
   sudo systemctl start preview-worker
   ```

4. Check the service status:
   ```bash
   sudo systemctl status preview-worker
   ```

5. View logs:
   ```bash
   sudo journalctl -u preview-worker -f
   ```

## Kubernetes Deployment

### Prerequisites
- Kubernetes cluster (v1.16+)
- kubectl configured
- Container registry with pushed image

### Deployment Steps
1. Create namespace (optional):
   ```bash
   kubectl create namespace mobius
   ```

2. Create ConfigMap:
   ```bash
   kubectl apply -f k8s/preview-worker/configmap.yaml
   ```

3. Create secrets (replace with your actual values):
   ```bash
   kubectl create secret generic preview-worker-secrets \
     --from-literal=REDIS_PASSWORD=your-redis-password
   ```

4. Deploy the worker:
   ```bash
   kubectl apply -f k8s/preview-worker/
   ```

5. Check deployment status:
   ```bash
   kubectl get pods -l app=preview-worker
   kubectl logs -l app=preview-worker
   ```

### Scaling
1. Scale manually:
   ```bash
   kubectl scale deployment preview-worker --replicas=3
   ```

2. Use HorizontalPodAutoscaler:
   ```bash
   kubectl get hpa preview-worker-hpa
   ```

## Monitoring and Observability

### Prometheus Metrics
The worker exposes metrics at `/metrics` endpoint. Configure your Prometheus to scrape this endpoint.

### Health Checks
The worker provides a health check endpoint at `/api/preview/worker/health`.

### Logs
All logs are output to stdout/stderr and can be collected by your logging solution.

## Environment Variables

### Required
- `REDIS_URL` - Redis connection string (e.g., redis://redis:6379)

### Optional
- `PREVIEW_QUEUE_NAME` - Name of the preview job queue (default: preview-jobs)
- `PREVIEW_WORKER_CONCURRENCY` - Number of concurrent jobs (default: 2)
- `PREVIEW_QUEUE_MAX` - Maximum queue size (default: 20)
- `DATA_DIR` - Directory for storing preview artifacts (default: ./data)
- `NODE_ENV` - Environment (production/development)

## Troubleshooting

### Common Issues
1. **Redis Connection Failed**
   - Check Redis URL and credentials
   - Ensure Redis is accessible from the worker
   - Verify network connectivity

2. **Job Processing Failures**
   - Check logs for error messages
   - Verify payload format using validation scripts
   - Check Dead Letter Queue for failed jobs

3. **Performance Issues**
   - Monitor queue length and processing times
   - Adjust concurrency settings
   - Scale worker instances

### Debugging Commands
```bash
# Check worker logs
kubectl logs -l app=preview-worker

# Check worker health
kubectl port-forward svc/preview-worker 3000:3000
curl http://localhost:3000/api/preview/worker/health

# Check queue metrics
curl http://localhost:3000/api/preview/queue/metrics
```

## Rollback Procedures

### systemd
```bash
# Stop the service
sudo systemctl stop preview-worker

# Revert to previous version
# (Replace with your rollback mechanism)

# Start the service
sudo systemctl start preview-worker
```

### Kubernetes
```bash
# Rollback to previous deployment
kubectl rollout undo deployment/preview-worker

# Or scale down
kubectl scale deployment/preview-worker --replicas=0
```

## Security Considerations

### Secrets Management
- Never store secrets in code or configuration files
- Use Kubernetes secrets or environment variables
- Rotate secrets regularly

### Network Security
- Restrict access to the worker endpoints
- Use TLS for external communications
- Implement proper authentication and authorization

### Container Security
- Run containers as non-root user
- Keep base images updated
- Scan images for vulnerabilities