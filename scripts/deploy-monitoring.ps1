# deploy-monitoring.ps1
# PowerShell script to deploy monitoring stack

Write-Host "Deploying monitoring stack to staging environment..." -ForegroundColor Green

# 1. Check prerequisites
Write-Host "1. Checking prerequisites..." -ForegroundColor Yellow

# Check if kubectl is installed
try {
    $kubectlVersion = kubectl version --client --short
    Write-Host "kubectl found: $kubectlVersion" -ForegroundColor Green
} catch {
    Write-Host "kubectl not found. Please install it and configure your kubeconfig." -ForegroundColor Red
    exit 1
}

# Check if Helm is installed
try {
    $helmVersion = helm version --short
    Write-Host "Helm found: $helmVersion" -ForegroundColor Green
} catch {
    Write-Host "Helm not found. Please install it from https://helm.sh/docs/intro/install/" -ForegroundColor Red
    exit 1
}

# Check if we can connect to the cluster
try {
    $clusterInfo = kubectl cluster-info
    Write-Host "Connected to Kubernetes cluster successfully" -ForegroundColor Green
} catch {
    Write-Host "Cannot connect to Kubernetes cluster. Please check your kubeconfig." -ForegroundColor Red
    exit 1
}

# 2. Install Prometheus Operator
Write-Host "2. Installing Prometheus Operator..." -ForegroundColor Yellow

# Add the prometheus-community Helm repository
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

# Create monitoring namespace if it doesn't exist
kubectl create namespace monitoring 2>$null
Write-Host "Monitoring namespace created/verified" -ForegroundColor Green

# Install Prometheus Operator
helm upgrade --install prometheus prometheus-community/kube-prometheus-stack `
    --namespace monitoring `
    --set grafana.adminPassword=admin `
    --set prometheus.prometheusSpec.serviceMonitorSelectorNilUsesHelmValues=false `
    --set prometheus.prometheusSpec.podMonitorSelectorNilUsesHelmValues=false

Write-Host "Prometheus Operator installed successfully" -ForegroundColor Green

# 3. Deploy ServiceMonitor for Preview Worker
Write-Host "3. Deploying ServiceMonitor for Preview Worker..." -ForegroundColor Yellow

# Create preview-worker namespace if it doesn't exist
kubectl create namespace preview-worker 2>$null
Write-Host "Preview-worker namespace created/verified" -ForegroundColor Green

# Apply the ServiceMonitor
kubectl apply -f k8s/preview-worker/servicemonitor.yaml
Write-Host "ServiceMonitor deployed successfully" -ForegroundColor Green

# 4. Deploy Alert Rules
Write-Host "4. Deploying Alert Rules..." -ForegroundColor Yellow

# Apply the alert rules
kubectl apply -f k8s/preview-worker/alert-rule-preview-worker.yaml
Write-Host "Alert rules deployed successfully" -ForegroundColor Green

# 5. Configure Alertmanager
Write-Host "5. Configuring Alertmanager..." -ForegroundColor Yellow

# Prompt for Slack webhook URL
$slackWebhook = Read-Host -Prompt "Enter Slack webhook URL (or press Enter to skip Slack integration)"

# Prompt for PagerDuty routing key
$pagerdutyKey = Read-Host -Prompt "Enter PagerDuty routing key (or press Enter to skip PagerDuty integration)"

# Create Alertmanager config
$alertmanagerConfig = @"
global:
  resolve_timeout: 5m

route:
  group_by: ['alertname']
  group_wait: 10s
  group_interval: 10s
  repeat_interval: 1h
  receiver: 'default-receiver'

receivers:
- name: 'default-receiver'
"@

if ($slackWebhook) {
    $alertmanagerConfig += @"
- name: 'slack-notifications'
  slack_configs:
  - api_url: '$slackWebhook'
    channel: '#alerts'
    send_resolved: true
"@
}

if ($pagerdutyKey) {
    $alertmanagerConfig += @"
- name: 'pagerduty-notifications'
  pagerduty_configs:
  - routing_key: '$pagerdutyKey'
    send_resolved: true
"@
}

# Save config to temporary file
$tempFile = [System.IO.Path]::GetTempFileName()
$alertmanagerConfig | Out-File -FilePath $tempFile -Encoding utf8

# Create secret with Alertmanager config
kubectl -n monitoring create secret generic alertmanager-main `
    --from-file=alertmanager.yaml=$tempFile `
    --dry-run=client -o yaml | kubectl apply -f -

# Clean up temporary file
Remove-Item $tempFile

Write-Host "Alertmanager configured successfully" -ForegroundColor Green

# 6. Verify deployment
Write-Host "6. Verifying deployment..." -ForegroundColor Yellow

# Wait for Prometheus pods to be ready
Write-Host "Waiting for Prometheus pods to be ready..." -ForegroundColor Yellow
kubectl -n monitoring wait --for=condition=ready pod -l app.kubernetes.io/name=prometheus --timeout=300s

# Wait for Alertmanager pods to be ready
Write-Host "Waiting for Alertmanager pods to be ready..." -ForegroundColor Yellow
kubectl -n monitoring wait --for=condition=ready pod -l app=alertmanager --timeout=300s

Write-Host "Monitoring stack deployed successfully!" -ForegroundColor Green
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Access Prometheus UI: kubectl -n monitoring port-forward svc/prometheus-kube-prometheus-prometheus 9090" -ForegroundColor Cyan
Write-Host "2. Access Grafana UI: kubectl -n monitoring port-forward svc/prometheus-grafana 3000" -ForegroundColor Cyan
Write-Host "3. Access Alertmanager UI: kubectl -n monitoring port-forward svc/prometheus-kube-prometheus-alertmanager 9093" -ForegroundColor Cyan
Write-Host "4. Validate alerts by checking the Prometheus Alerts tab" -ForegroundColor Cyan