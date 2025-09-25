# 📧 Notification Script Usage Examples

## 🚀 send-notification.js - CLI Usage Guide

### Basic Usage

```bash
# Send T-30 deployment notification to Slack
node scripts/send-notification.js \
  --platform=slack \
  --template=deploy-t30 \
  --channel=#deployments \
  --release-tag=v2.1.4 \
  --deploy-time="2024-01-15 14:30:00 UTC" \
  --deploy-lead="John Smith" \
  --estimated-duration=15

# Send T-0 deployment notification to Teams
node scripts/send-notification.js \
  --platform=teams \
  --template=deploy-t0 \
  --webhook-url="https://outlook.office.com/webhook/..." \
  --release-tag=v2.1.4 \
  --start-time="2024-01-15 14:30:00 UTC" \
  --progress-percentage=0 \
  --current-phase="Database Migration"
```

### Complete T-30 Deployment Example

```bash
#!/bin/bash
# T-30 deployment notification with full parameters

node scripts/send-notification.js \
  --platform=slack \
  --template=deploy-t30 \
  --channel="#prod-deployments" \
  --release-tag="v2.1.4" \
  --deploy-time="2024-01-15 14:30:00 UTC" \
  --deploy-lead="Jane Developer" \
  --estimated-duration="15" \
  --expected-downtime="<5 minutes" \
  --lufs-value="-23.1" \
  --release-notes-url="https://github.com/w9bikze8u4cbupc/MOBIUS/releases/tag/v2.1.4" \
  --dashboard-url="https://dashboard.company.com/mobius" \
  --runbook-url="https://docs.company.com/runbook/mobius-deploy" \
  --maintenance-status="Enabled" \
  --system-status="Healthy" \
  --active-users="23" \
  --queue-size="7"
```

### Complete T+15 Success Example

```bash
#!/bin/bash
# Deployment complete notification with metrics

node scripts/send-notification.js \
  --platform=slack \
  --template=deploy-complete \
  --channel="#prod-deployments" \
  --release-tag="v2.1.4" \
  --total-duration="12 minutes" \
  --health-status="All systems operational" \
  --api-response-time="145" \
  --pipeline-health="Healthy" \
  --processing-time="23" \
  --db-connections="47" \
  --lufs-value="-23.1" \
  --release-highlights="• Improved video processing speed by 15%\n• Fixed audio sync issues\n• Added support for French translations" \
  --app-url="https://mobius.company.com" \
  --release-notes-url="https://github.com/w9bikze8u4cbupc/MOBIUS/releases/tag/v2.1.4" \
  --dashboard-url="https://dashboard.company.com/mobius"
```

### Complete T+60 Status Example

```bash
#!/bin/bash
# One-hour post-deployment status report

node scripts/send-notification.js \
  --platform=teams \
  --template=deploy-status \
  --webhook-url="$TEAMS_WEBHOOK_URL" \
  --release-tag="v2.1.4" \
  --videos-generated="47" \
  --api-requests="1,247" \
  --active-users="156" \
  --error-rate="0.2" \
  --response-time="132" \
  --uptime="99.98" \
  --cpu-usage="34" \
  --memory-usage="67" \
  --disk-usage="23" \
  --queue-size="3" \
  --avg-processing-time="18" \
  --queue-wait-time="45" \
  --oncall-engineer="Mike DevOps"
```

### Environment Variables Setup

```bash
# Create .env file for notification credentials
cat > .env << 'EOF'
# Slack Configuration
SLACK_BOT_TOKEN=xoxb-your-slack-bot-token
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...

# Microsoft Teams Configuration  
TEAMS_WEBHOOK_URL=https://outlook.office.com/webhook/...

# Discord Configuration (optional)
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...

# Email Configuration (optional)
SMTP_HOST=smtp.company.com
SMTP_PORT=587
SMTP_USER=notifications@company.com
SMTP_PASS=your-smtp-password

# Default Settings
DEFAULT_CHANNEL=#deployments
DEFAULT_DEPLOY_LEAD=DevOps Team
DEFAULT_ONCALL_ENGINEER=On-call Rotation
EOF
```

### Batch Notification Script

```bash
#!/bin/bash
# send-all-notifications.sh - Send to multiple platforms

RELEASE_TAG="$1"
NOTIFICATION_TYPE="$2"

if [ -z "$RELEASE_TAG" ] || [ -z "$NOTIFICATION_TYPE" ]; then
    echo "Usage: $0 <release-tag> <notification-type>"
    echo "Types: t30, t5, t0, complete, status"
    exit 1
fi

# Common parameters
COMMON_PARAMS=(
    --release-tag="$RELEASE_TAG"
    --deploy-lead="$DEPLOY_LEAD"
    --deploy-time="$(date -u '+%Y-%m-%d %H:%M:%S UTC')"
)

case "$NOTIFICATION_TYPE" in
    "t30")
        TEMPLATE="deploy-t30"
        EXTRA_PARAMS=(
            --estimated-duration="15"
            --expected-downtime="<5 minutes"
            --lufs-value="-23.1"
        )
        ;;
    "t5")
        TEMPLATE="deploy-t5"
        EXTRA_PARAMS=(
            --maintenance-status="Enabled"
            --system-status="Preparing"
            --active-users="$(get_active_users)"
            --queue-size="$(get_queue_size)"
        )
        ;;
    "t0")
        TEMPLATE="deploy-t0"
        EXTRA_PARAMS=(
            --start-time="$(date -u '+%Y-%m-%d %H:%M:%S UTC')"
            --progress-percentage="0"
            --current-phase="Starting deployment"
        )
        ;;
    "complete")
        TEMPLATE="deploy-complete"
        EXTRA_PARAMS=(
            --total-duration="$(calculate_duration)"
            --health-status="All systems operational"
            --api-response-time="$(get_api_metrics)"
        )
        ;;
    "status")
        TEMPLATE="deploy-status"
        EXTRA_PARAMS=(
            --videos-generated="$(get_videos_count)"
            --api-requests="$(get_api_count)"
            --active-users="$(get_active_users)"
        )
        ;;
    *)
        echo "Unknown notification type: $NOTIFICATION_TYPE"
        exit 1
        ;;
esac

# Send to Slack
echo "Sending Slack notification..."
node scripts/send-notification.js \
    --platform=slack \
    --template="$TEMPLATE" \
    --channel="$SLACK_CHANNEL" \
    "${COMMON_PARAMS[@]}" \
    "${EXTRA_PARAMS[@]}"

# Send to Teams
echo "Sending Teams notification..."
node scripts/send-notification.js \
    --platform=teams \
    --template="$TEMPLATE" \
    --webhook-url="$TEAMS_WEBHOOK_URL" \
    "${COMMON_PARAMS[@]}" \
    "${EXTRA_PARAMS[@]}"

echo "Notifications sent successfully!"
```

### CI/CD Integration Examples

#### GitHub Actions

```yaml
# .github/workflows/deploy-notify.yml
name: Deploy Notifications

on:
  workflow_call:
    inputs:
      stage:
        required: true
        type: string
      release_tag:
        required: true
        type: string

jobs:
  notify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          
      - name: Install dependencies
        run: npm ci
        
      - name: Send notification
        env:
          SLACK_BOT_TOKEN: ${{ secrets.SLACK_BOT_TOKEN }}
          TEAMS_WEBHOOK_URL: ${{ secrets.TEAMS_WEBHOOK_URL }}
        run: |
          node scripts/send-notification.js \
            --platform=slack \
            --template=deploy-${{ inputs.stage }} \
            --channel="#deployments" \
            --release-tag="${{ inputs.release_tag }}" \
            --deploy-lead="${{ github.actor }}" \
            --commit-sha="${{ github.sha }}" \
            --workflow-url="${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}"
```

#### Jenkins Pipeline

```groovy
// Jenkinsfile deployment notification
pipeline {
    agent any
    
    stages {
        stage('Deploy') {
            steps {
                script {
                    // Send T-0 notification
                    sh """
                        node scripts/send-notification.js \
                            --platform=slack \
                            --template=deploy-t0 \
                            --channel="#deployments" \
                            --release-tag="${params.RELEASE_TAG}" \
                            --deploy-lead="${env.BUILD_USER}" \
                            --build-url="${env.BUILD_URL}"
                    """
                }
                
                // Deployment steps here
                
                script {
                    // Send completion notification
                    sh """
                        node scripts/send-notification.js \
                            --platform=slack \
                            --template=deploy-complete \
                            --channel="#deployments" \
                            --release-tag="${params.RELEASE_TAG}" \
                            --total-duration="\$(calculate_duration)" \
                            --health-status="Deployed successfully"
                    """
                }
            }
        }
    }
    
    post {
        failure {
            script {
                sh """
                    node scripts/send-notification.js \
                        --platform=slack \
                        --template=deploy-failed \
                        --channel="#deployments" \
                        --release-tag="${params.RELEASE_TAG}" \
                        --error-message="${env.BUILD_FAILURE_REASON}"
                """
            }
        }
    }
}
```

### API Integration Examples

#### Webhook Receiver

```javascript
// webhook-handler.js - Receive deployment events and send notifications
const express = require('express');
const { execSync } = require('child_process');
const app = express();

app.use(express.json());

app.post('/deploy-webhook', (req, res) => {
    const { stage, release_tag, status, metrics } = req.body;
    
    const notificationCmd = [
        'node scripts/send-notification.js',
        '--platform=slack',
        `--template=deploy-${stage}`,
        '--channel=#deployments',
        `--release-tag=${release_tag}`,
        `--deploy-lead=${req.body.deploy_lead || 'Automation'}`
    ];
    
    // Add stage-specific parameters
    if (stage === 'complete' && metrics) {
        notificationCmd.push(
            `--total-duration=${metrics.duration}`,
            `--api-response-time=${metrics.api_response_time}`,
            `--health-status=${status}`
        );
    }
    
    try {
        execSync(notificationCmd.join(' '), { stdio: 'inherit' });
        res.json({ success: true, message: 'Notification sent' });
    } catch (error) {
        console.error('Notification failed:', error);
        res.status(500).json({ error: 'Notification failed' });
    }
});

app.listen(3001, () => {
    console.log('Webhook handler listening on port 3001');
});
```

### Monitoring Integration

```bash
#!/bin/bash
# monitoring-notifications.sh - Send alerts based on monitoring data

# Check system health and send notifications if issues detected
check_and_notify() {
    local service="$1"
    local threshold="$2"
    local current_value="$3"
    
    if (( $(echo "$current_value > $threshold" | bc -l) )); then
        node scripts/send-notification.js \
            --platform=slack \
            --template=alert \
            --channel="#alerts" \
            --alert-type="$service" \
            --current-value="$current_value" \
            --threshold="$threshold" \
            --severity="high" \
            --oncall-engineer="$(get_oncall_engineer)"
    fi
}

# Example usage
API_RESPONSE_TIME=$(get_api_response_time)
ERROR_RATE=$(get_error_rate)
QUEUE_SIZE=$(get_queue_size)

check_and_notify "api_response_time" "500" "$API_RESPONSE_TIME"
check_and_notify "error_rate" "1.0" "$ERROR_RATE"
check_and_notify "queue_size" "50" "$QUEUE_SIZE"
```

### Testing Notifications

```bash
#!/bin/bash
# test-notifications.sh - Test all notification templates

echo "Testing MOBIUS notification templates..."

# Test Slack notifications
echo "Testing Slack T-30..."
node scripts/send-notification.js \
    --platform=slack \
    --template=deploy-t30 \
    --channel="#test-deployments" \
    --release-tag="v0.0.0-test" \
    --deploy-lead="Test User" \
    --test-mode=true

# Test Teams notifications  
echo "Testing Teams completion..."
node scripts/send-notification.js \
    --platform=teams \
    --template=deploy-complete \
    --webhook-url="$TEST_TEAMS_WEBHOOK" \
    --release-tag="v0.0.0-test" \
    --total-duration="5 minutes" \
    --test-mode=true

echo "All notification tests completed!"
```