#!/bin/bash

# deploy-monitoring.sh
# Bash script to deploy monitoring stack

echo -e "\033[0;32mDeploying monitoring stack to staging environment...\033[0m"

# 1. Check prerequisites
echo -e "\033[1;33m1. Checking prerequisites...\033[0m"

# Check if kubectl is installed
if ! command -v kubectl &> /dev/null; then
    echo -e "\033[0;31mkubectl not found. Please install it and configure your kubeconfig.\033[0m"
    exit 1
fi

echo -e "\033[0;36mkubectl found: $(kubectl version --client --short)\033[0m"

# Check if Helm is installed
if ! command -v helm &> /dev/null; then
    echo -e "\033[0;31mHelm not found. Please install it from https://helm.sh/docs/intro/install/\033[0m"
    exit 1
fi

echo -e "\033[0;36mHelm found: $(helm version --short)\033[0m"

# Check if we can connect to the cluster
if ! kubectl cluster-info &> /dev/null; then
    echo -e "\033[0;31mCannot connect to Kubernetes cluster. Please check your kubeconfig.\033[0m"
    exit 1
fi

echo -e "\033[0;32mConnected to Kubernetes cluster successfully\033[0m"

# 2. Install Prometheus Operator
echo -e "\033[1;33m2. Installing Prometheus Operator...\033[0m"

# Add the prometheus-community Helm repository
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

# Create monitoring namespace if it doesn't exist
kubectl create namespace monitoring 2>/dev/null || echo "Namespace monitoring already exists"
echo -e "\033[0;32mMonitoring namespace created/verified\033[0m"

# Install Prometheus Operator
helm upgrade --install prometheus prometheus-community/kube-prometheus-stack \
    --namespace monitoring \
    --set grafana.adminPassword=admin \
    --set prometheus.prometheusSpec.serviceMonitorSelectorNilUsesHelmValues=false \
    --set prometheus.prometheusSpec.podMonitorSelectorNilUsesHelmValues=false

echo -e "\033[0;32mPrometheus Operator installed successfully\033[0m"

# 3. Deploy ServiceMonitor for Preview Worker
echo -e "\033[1;33m3. Deploying ServiceMonitor for Preview Worker...\033[0m"

# Create preview-worker namespace if it doesn't exist
kubectl create namespace preview-worker 2>/dev/null || echo "Namespace preview-worker already exists"
echo -e "\033[0;32mPreview-worker namespace created/verified\033[0m"

# Apply the ServiceMonitor
kubectl apply -f k8s/preview-worker/servicemonitor.yaml
echo -e "\033[0;32mServiceMonitor deployed successfully\033[0m"

# 4. Deploy Alert Rules
echo -e "\033[1;33m4. Deploying Alert Rules...\033[0m"

# Apply the alert rules
kubectl apply -f k8s/preview-worker/alert-rule-preview-worker.yaml
echo -e "\033[0;32mAlert rules deployed successfully\033[0m"

# 5. Configure Alertmanager
echo -e "\033[1;33m5. Configuring Alertmanager...\033[0m"

# Prompt for Slack webhook URL
read -p "Enter Slack webhook URL (or press Enter to skip Slack integration): " slack_webhook

# Prompt for PagerDuty routing key
read -p "Enter PagerDuty routing key (or press Enter to skip PagerDuty integration): " pagerduty_key

# Create Alertmanager config
cat > /tmp/alertmanager.yaml << EOF
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
EOF

if [ -n "$slack_webhook" ]; then
    cat >> /tmp/alertmanager.yaml << EOF
- name: 'slack-notifications'
  slack_configs:
  - api_url: '$slack_webhook'
    channel: '#alerts'
    send_resolved: true
EOF
fi

if [ -n "$pagerduty_key" ]; then
    cat >> /tmp/alertmanager.yaml << EOF
- name: 'pagerduty-notifications'
  pagerduty_configs:
  - routing_key: '$pagerduty_key'
    send_resolved: true
EOF
fi

# Create secret with Alertmanager config
kubectl -n monitoring create secret generic alertmanager-main \
    --from-file=alertmanager.yaml=/tmp/alertmanager.yaml \
    --dry-run=client -o yaml | kubectl apply -f -

# Clean up temporary file
rm /tmp/alertmanager.yaml

echo -e "\033[0;32mAlertmanager configured successfully\033[0m"

# 6. Verify deployment
echo -e "\033[1;33m6. Verifying deployment...\033[0m"

# Wait for Prometheus pods to be ready
echo -e "\033[1;33mWaiting for Prometheus pods to be ready...\033[0m"
kubectl -n monitoring wait --for=condition=ready pod -l app.kubernetes.io/name=prometheus --timeout=300s

# Wait for Alertmanager pods to be ready
echo -e "\033[1;33mWaiting for Alertmanager pods to be ready...\033[0m"
kubectl -n monitoring wait --for=condition=ready pod -l app=alertmanager --timeout=300s

echo -e "\033[0;32mMonitoring stack deployed successfully!\033[0m"
echo -e "\033[0;36mNext steps:\033[0m"
echo -e "\033[0;36m1. Access Prometheus UI: kubectl -n monitoring port-forward svc/prometheus-kube-prometheus-prometheus 9090\033[0m"
echo -e "\033[0;36m2. Access Grafana UI: kubectl -n monitoring port-forward svc/prometheus-grafana 3000\033[0m"
echo -e "\033[0;36m3. Access Alertmanager UI: kubectl -n monitoring port-forward svc/prometheus-kube-prometheus-alertmanager 9093\033[0m"
echo -e "\033[0;36m4. Validate alerts by checking the Prometheus Alerts tab\033[0m"