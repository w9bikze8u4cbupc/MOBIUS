# Monitoring and Alerting Guide

This guide explains how to set up monitoring and alerting for the Mobius Preview Worker deployment infrastructure.

## Overview

The monitoring infrastructure includes:
1. Built-in health checks and metrics
2. CLI tools for status checking and log viewing
3. GitHub Actions for deployment monitoring
4. Kubernetes-native monitoring capabilities
5. Alerting mechanisms for critical issues

## Built-in Monitoring Features

### Health Checks
The Preview Worker includes built-in health check endpoints:
- `/healthz`: Basic health check
- `/metrics`: Prometheus metrics endpoint

### CLI Monitoring Commands
```bash
# Check deployment status
node cli/mobius-deploy.js status

# View deployment logs
node cli/mobius-deploy.js logs

# Verify deployment health
node cli/mobius-deploy.js verify
```

## Kubernetes Monitoring

### Pod Status Monitoring
```bash
# Check pod status
kubectl -n preview-worker get pods

# Get detailed pod information
kubectl -n preview-worker describe pod <pod-name>

# View pod logs
kubectl -n preview-worker logs <pod-name>

# View logs from previous container instance
kubectl -n preview-worker logs <pod-name> --previous
```

### Deployment Monitoring
```bash
# Check deployment status
kubectl -n preview-worker rollout status deployment/preview-worker

# View deployment history
kubectl -n preview-worker rollout history deployment/preview-worker

# Check resource usage
kubectl -n preview-worker top pods
```

### Service Monitoring
```bash
# Check service status
kubectl -n preview-worker get services

# Check endpoints
kubectl -n preview-worker get endpoints
```

## GitHub Actions Monitoring

### Workflow Status
Monitor GitHub Actions workflow status through:
1. GitHub repository Actions tab
2. GitHub notifications
3. GitHub API for programmatic access

### Workflow Logs
View detailed logs for each workflow run to troubleshoot issues.

## Setting Up Prometheus Monitoring

### Service Monitor Configuration
The deployment includes a ServiceMonitor for Prometheus integration:
- File: [k8s/preview-worker/servicemonitor.yaml](file:///c%3A/Users/danie/Documents/mobius-games-tutorial-generator/k8s/preview-worker/servicemonitor.yaml)
- Scrapes metrics from the `/metrics` endpoint

### Alert Rules
The deployment includes alert rules for common issues:
- File: [k8s/preview-worker/alert-rule-preview-worker.yaml](file:///c%3A/Users/danie/Documents/mobius-games-tutorial-generator/k8s/preview-worker/alert-rule-preview-worker.yaml)
- Alerts on high failure rates

## Setting Up Alerting

### Kubernetes Events Alerting
Monitor Kubernetes events for issues:
```bash
# View recent events
kubectl -n preview-worker get events --sort-by=.metadata.creationTimestamp

# Watch events in real-time
kubectl -n preview-worker get events --watch
```

### Log-Based Alerting
Set up log-based alerting using tools like:
- Elasticsearch, Logstash, Kibana (ELK) stack
- Fluentd with Prometheus
- Cloud provider logging solutions

### Health Check Alerting
Set up alerts based on health check failures:
```bash
# Example script for health check monitoring
#!/bin/bash
HEALTH_CHECK_URL="http://preview-worker.preview-worker.svc.cluster.local/healthz"

if ! curl -f -s $HEALTH_CHECK_URL > /dev/null; then
    echo "Health check failed!" | tee /dev/stderr
    # Send alert (email, Slack, etc.)
    exit 1
fi
```

## Custom Monitoring Scripts

### Deployment Status Script
```bash
#!/bin/bash
# monitor-deployment.sh

NAMESPACE=${1:-preview-worker}

echo "=== Deployment Status Report ==="
echo "Namespace: $NAMESPACE"
echo "Timestamp: $(date)"

# Check pod status
echo "Pod Status:"
kubectl -n $NAMESPACE get pods

# Check deployment status
echo "Deployment Status:"
kubectl -n $NAMESPACE get deployments

# Check service status
echo "Service Status:"
kubectl -n $NAMESPACE get services

# Check recent events
echo "Recent Events:"
kubectl -n $NAMESPACE get events --sort-by=.metadata.creationTimestamp | tail -10
```

### Log Analysis Script
```bash
#!/bin/bash
# analyze-logs.sh

NAMESPACE=${1:-preview-worker}
ERROR_THRESHOLD=${2:-5}

echo "=== Log Analysis Report ==="
echo "Namespace: $NAMESPACE"
echo "Error Threshold: $ERROR_THRESHOLD"
echo "Timestamp: $(date)"

# Count error logs
ERROR_COUNT=$(kubectl -n $NAMESPACE logs deployment/preview-worker | grep -i error | wc -l)

echo "Error Count: $ERROR_COUNT"

if [ $ERROR_COUNT -gt $ERROR_THRESHOLD ]; then
    echo "WARNING: Error count exceeds threshold!"
    echo "Recent errors:"
    kubectl -n $NAMESPACE logs deployment/preview-worker | grep -i error | tail -5
fi
```

## Alerting Integrations

### Slack Notifications
Set up Slack notifications for critical alerts:
```yaml
# GitHub Actions workflow with Slack notification
- name: Notify on Failure
  if: failure()
  uses: 8398a7/action-slack@v3
  with:
    status: ${{ job.status }}
    channel: '#deployments'
  env:
    SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK }}
```

### Email Alerts
Set up email alerts for critical issues:
```bash
# Example email alert script
#!/bin/bash
RECIPIENT="team@example.com"
SUBJECT="Preview Worker Deployment Alert"

echo "Critical issue detected in Preview Worker deployment" | mail -s "$SUBJECT" "$RECIPIENT"
```

### PagerDuty Integration
For critical production alerts, integrate with PagerDuty:
```bash
# Example PagerDuty alert
curl -X POST \
  'https://events.pagerduty.com/v2/enqueue' \
  -H 'Content-Type: application/json' \
  -d '{
  "routing_key": "YOUR_ROUTING_KEY",
  "event_action": "trigger",
  "payload": {
    "summary": "Preview Worker deployment failed",
    "source": "preview-worker-deployment",
    "severity": "critical"
  }
}'
```

## Monitoring Dashboard

### Kubernetes Dashboard
Access the Kubernetes dashboard for visual monitoring:
```bash
# Start proxy to access dashboard
kubectl proxy

# Access dashboard at http://localhost:8001/api/v1/namespaces/kubernetes-dashboard/services/https:kubernetes-dashboard:/proxy/
```

### Custom Dashboard
Create custom dashboards using tools like:
- Grafana with Prometheus data source
- Cloud provider monitoring dashboards
- Custom web interfaces

## Performance Monitoring

### Resource Usage
Monitor CPU and memory usage:
```bash
# Check resource usage
kubectl -n preview-worker top pods

# Check node resource usage
kubectl top nodes
```

### Request Latency
Monitor request latency through application metrics:
```bash
# Example curl to metrics endpoint
curl -s http://preview-worker.preview-worker.svc.cluster.local/metrics | grep latency
```

## Security Monitoring

### Security Scanning
Integrate security scanning into the deployment pipeline:
```yaml
- name: Scan Docker Image
  uses: aquasecurity/trivy-action@master
  with:
    image-ref: 'ghcr.io/w9bikze8u4cbupc/mobius-preview-worker:latest'
    format: 'table'
    exit-code: '1'
    ignore-unfixed: true
```

### Audit Logs
Monitor audit logs for security events:
```bash
# Check for security-related events
kubectl -n preview-worker get events | grep -i security
```

## Best Practices

### Proactive Monitoring
1. Set up alerts for critical metrics
2. Regularly review logs and metrics
3. Monitor resource usage trends
4. Test alerting mechanisms regularly

### Reactive Monitoring
1. Respond quickly to alerts
2. Document issues and resolutions
3. Implement preventive measures
4. Share knowledge with the team

### Performance Optimization
1. Monitor resource usage
2. Optimize resource requests and limits
3. Identify and resolve bottlenecks
4. Scale based on demand

### Security Monitoring
1. Monitor for unauthorized access
2. Regularly scan for vulnerabilities
3. Review audit logs
4. Implement security best practices

## Troubleshooting Monitoring Issues

### Metrics Not Appearing
1. Verify the ServiceMonitor is correctly configured
2. Check that Prometheus is scraping the endpoint
3. Verify the application is exposing metrics
4. Check network policies and firewall rules

### Alerts Not Firing
1. Verify alert rules are correctly configured
2. Check that the metrics exist
3. Verify alertmanager configuration
4. Test alerting mechanisms manually

### Log Collection Issues
1. Verify logging configuration
2. Check log file permissions
3. Verify log collection agents are running
4. Check network connectivity for remote logging

## Conclusion

This monitoring and alerting guide provides a comprehensive approach to monitoring the Mobius Preview Worker deployment. By implementing these practices, you can ensure the reliability, performance, and security of your deployments.

Regular monitoring and alerting are essential for maintaining a healthy production environment. Set up the appropriate monitoring tools and alerting mechanisms for your specific needs, and regularly review and improve your monitoring strategy.