# Monitoring Deployment Guide

## Overview
This guide provides instructions for deploying and configuring the monitoring stack for the Mobius Preview Worker, including Prometheus integration, alerting rules, and validation procedures.

## Prerequisites

### Kubernetes Cluster
- Access to a Kubernetes cluster with appropriate permissions
- kubectl CLI configured and authenticated
- Helm CLI installed (optional but recommended)

### Monitoring Tools
- Prometheus Operator installed in the cluster
- Alertmanager configured for alert routing
- Grafana for dashboard visualization (optional)

## Prometheus Deployment

### Installing Prometheus Operator
If not already installed, deploy Prometheus Operator using Helm:

```bash
# Add the prometheus-community Helm repository
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts

# Update Helm repositories
helm repo update

# Install Prometheus Operator
helm install prometheus prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  --create-namespace
```

### Verifying Prometheus Installation
```bash
# Check Prometheus pods
kubectl -n monitoring get pods -l app.kubernetes.io/name=prometheus

# Check Prometheus service
kubectl -n monitoring get svc prometheus-kube-prometheus-prometheus

# Port forward to access Prometheus UI
kubectl -n monitoring port-forward svc/prometheus-kube-prometheus-prometheus 9090
```

## ServiceMonitor Configuration

### Deploying ServiceMonitor
The Mobius Preview Worker includes a ServiceMonitor configuration that needs to be applied:

```bash
# Apply the ServiceMonitor
kubectl apply -f k8s/preview-worker/servicemonitor.yaml
```

### Verifying ServiceMonitor
```bash
# Check if ServiceMonitor is created
kubectl -n preview-worker get servicemonitor

# Check if Prometheus is scraping the endpoint
# In Prometheus UI, go to Status → Targets and look for preview-worker
```

## Alert Rules Configuration

### Deploying Alert Rules
The Mobius Preview Worker includes alert rules that need to be applied:

```bash
# Apply the alert rules
kubectl apply -f k8s/preview-worker/alert-rule-preview-worker.yaml
```

### Verifying Alert Rules
```bash
# Check if alert rules are loaded
# In Prometheus UI, go to Alerts tab

# Or use kubectl to check rules
kubectl -n monitoring get prometheusrules
```

## Alertmanager Configuration

### Configuring Alertmanager
Create or update the Alertmanager configuration:

```yaml
# alertmanager-config.yaml
global:
  resolve_timeout: 5m

route:
  group_by: ['alertname']
  group_wait: 10s
  group_interval: 10s
  repeat_interval: 1h
  receiver: 'slack-notifications'

receivers:
- name: 'slack-notifications'
  slack_configs:
  - api_url: '<SLACK_WEBHOOK_URL>'
    channel: '#alerts'
    send_resolved: true
    title: '{{ template "slack.default.title" . }}'
    text: '{{ template "slack.default.text" . }}'

- name: 'pagerduty-notifications'
  pagerduty_configs:
  - routing_key: '<PAGERDUTY_ROUTING_KEY>'
    send_resolved: true
```

Apply the configuration:
```bash
# Create a secret with the Alertmanager configuration
kubectl -n monitoring create secret generic alertmanager-main \
  --from-file=alertmanager.yaml=alertmanager-config.yaml \
  --dry-run=client -o yaml | kubectl apply -f -
```

## Grafana Dashboard Setup

### Installing Grafana
If not already installed, deploy Grafana using Helm:

```bash
# Install Grafana
helm install grafana grafana/grafana \
  --namespace monitoring \
  --set adminPassword=admin \
  --set service.type=LoadBalancer
```

### Creating Dashboards
Create a dashboard for the Preview Worker:

```json
{
  "dashboard": {
    "id": null,
    "title": "Preview Worker Dashboard",
    "tags": ["preview-worker"],
    "timezone": "browser",
    "schemaVersion": 16,
    "version": 0,
    "refresh": "25s",
    "panels": [
      {
        "id": 1,
        "title": "Job Processing Rate",
        "type": "graph",
        "datasource": "Prometheus",
        "targets": [
          {
            "expr": "rate(preview_worker_job_outcomes_total[5m])",
            "legendFormat": "{{outcome}}",
            "refId": "A"
          }
        ]
      },
      {
        "id": 2,
        "title": "Job Duration",
        "type": "graph",
        "datasource": "Prometheus",
        "targets": [
          {
            "expr": "histogram_quantile(0.95, rate(preview_worker_job_duration_seconds_bucket[5m]))",
            "legendFormat": "95th percentile",
            "refId": "A"
          }
        ]
      },
      {
        "id": 3,
        "title": "Active Jobs",
        "type": "singlestat",
        "datasource": "Prometheus",
        "targets": [
          {
            "expr": "sum(preview_worker_active_jobs)",
            "refId": "A"
          }
        ]
      }
    ]
  }
}
```

## Alerting Integrations

### Slack Integration
1. Create a Slack app and webhook URL
2. Update the Alertmanager configuration with the webhook URL
3. Test the integration by creating a test alert

### PagerDuty Integration
1. Create a PagerDuty service and obtain the routing key
2. Update the Alertmanager configuration with the routing key
3. Test the integration by creating a test alert

### Email Integration
Configure email alerts in Alertmanager:

```yaml
receivers:
- name: 'email-notifications'
  email_configs:
  - to: 'team@example.com'
    from: 'alerts@example.com'
    smarthost: 'smtp.example.com:587'
    auth_username: 'alerts@example.com'
    auth_password: '<SMTP_PASSWORD>'
```

## Validation Procedures

### 1. Metrics Validation
```bash
# Check if metrics are being exposed by the application
kubectl -n preview-worker port-forward svc/preview-worker 8080:80
curl http://localhost:8080/metrics

# Check if Prometheus is scraping the metrics
# In Prometheus UI, go to Status → Targets
```

### 2. Alert Rule Validation
```bash
# Simulate a high failure rate to trigger alerts
# This would require a script to generate failed jobs

# Check if alerts are firing
# In Prometheus UI, go to Alerts tab
```

### 3. Alertmanager Validation
```bash
# Check Alertmanager status
kubectl -n monitoring port-forward svc/alertmanager-main 9093
# Visit http://localhost:9093

# Send a test alert
curl -H "Content-Type: application/json" -d '[{"status": "firing", "labels": {"alertname": "TestAlert"}, "annotations": {"summary": "Test alert"}}]' http://localhost:9093/api/v1/alerts
```

### 4. Integration Testing
```bash
# Simulate deployment failure
kubectl -n preview-worker scale deployment preview-worker --replicas=0

# Wait for alerts to fire
sleep 60

# Check notifications in Slack/PagerDuty/email
```

## Monitoring Dashboard

### Key Metrics to Monitor
1. **Job Processing Rate**: Rate of jobs by outcome (success, failure, etc.)
2. **Job Duration**: Time taken to process jobs (95th percentile)
3. **Active Jobs**: Number of currently processing jobs
4. **Queue Size**: Number of jobs waiting in queue
5. **Resource Usage**: CPU and memory utilization
6. **Error Rate**: Percentage of failed jobs

### Dashboard Layout
1. **Top Row**: Key metrics overview (single stats)
2. **Middle Row**: Job processing trends (graphs)
3. **Bottom Row**: Resource utilization and error rates

## Troubleshooting Common Issues

### Metrics Not Appearing
**Problem**: Metrics not showing in Prometheus
**Solution**: 
1. Verify ServiceMonitor is correctly configured
2. Check that the application is exposing metrics on the correct port
3. Verify network policies allow Prometheus to scrape the endpoint

### Alerts Not Firing
**Problem**: Alert rules not triggering
**Solution**:
1. Verify alert rules are correctly formatted
2. Check that the metrics exist and have the expected labels
3. Verify Alertmanager is correctly configured

### Notifications Not Working
**Problem**: Alerts firing but notifications not received
**Solution**:
1. Check Alertmanager configuration
2. Verify integration credentials (webhook URLs, API keys)
3. Test integrations manually

### Performance Issues
**Problem**: High resource usage or slow metrics collection
**Solution**:
1. Optimize metric collection intervals
2. Reduce cardinality of metrics
3. Scale Prometheus horizontally if needed

## Conclusion

This guide provides a comprehensive approach to deploying and configuring monitoring for the Mobius Preview Worker. By following these steps, you can ensure comprehensive observability with proper alerting and dashboard visualization.

Regular review and updates to the monitoring configuration will help maintain visibility into the system's health and performance as it evolves.