# MOBIUS Notification Script Examples & Usage Guide

This document provides practical examples and code snippets for using `send-notification.js` and related notification utilities in the MOBIUS deployment pipeline.

## 📁 File Structure

```
.github/
├── scripts/
│   ├── send-notification.js          # Main notification script
│   ├── notification-helpers.js       # Utility functions
│   └── templates/                     # Notification templates
│       ├── slack-templates.json
│       ├── teams-templates.json
│       └── email-templates.json
└── notification-script-examples.md   # This file
```

---

## 🚀 Quick Start

### Basic Usage

```bash
# Send a simple deployment started notification to Slack
node .github/scripts/send-notification.js \
  --service slack \
  --template deployment-started \
  --release v1.2.3 \
  --deploy-lead "John Doe"

# Send to multiple services
node .github/scripts/send-notification.js \
  --service slack,teams \
  --template deployment-complete \
  --release v1.2.3 \
  --status success \
  --duration "14m 32s"

# Send custom message
node .github/scripts/send-notification.js \
  --service teams \
  --template custom \
  --message "Emergency maintenance starting in 10 minutes" \
  --priority urgent
```

---

## 📜 Main Script: `send-notification.js`

```javascript
#!/usr/bin/env node

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { program } = require('commander');
const { loadTemplate, replaceTokens, validateConfig } = require('./notification-helpers');

// Configuration from environment variables
const config = {
  slack: {
    webhookUrl: process.env.SLACK_WEBHOOK_URL,
    channel: process.env.SLACK_CHANNEL || '#mobius-deployments',
    username: process.env.SLACK_USERNAME || 'MOBIUS Deploy Bot',
    iconEmoji: process.env.SLACK_ICON || ':rocket:'
  },
  teams: {
    webhookUrl: process.env.TEAMS_WEBHOOK_URL,
    channelName: process.env.TEAMS_CHANNEL_NAME || 'MOBIUS Operations'
  },
  email: {
    smtpHost: process.env.SMTP_HOST,
    smtpPort: process.env.SMTP_PORT || 587,
    smtpUser: process.env.SMTP_USER,
    smtpPass: process.env.SMTP_PASS,
    fromAddress: process.env.EMAIL_FROM || 'deployments@mobius-games.com',
    toAddresses: process.env.EMAIL_TO ? process.env.EMAIL_TO.split(',') : []
  }
};

// Command line interface
program
  .version('1.0.0')
  .description('Send deployment notifications to various services')
  .option('-s, --service <services>', 'Comma-separated list of services (slack,teams,email)', 'slack')
  .option('-t, --template <template>', 'Notification template to use', 'deployment-started')
  .option('-r, --release <tag>', 'Release tag/version')
  .option('-l, --deploy-lead <name>', 'Name of deployment lead')
  .option('-d, --duration <time>', 'Deployment duration')
  .option('--status <status>', 'Deployment status (success,failure,warning)', 'info')
  .option('-m, --message <text>', 'Custom message text')
  .option('--priority <level>', 'Priority level (low,normal,high,urgent)', 'normal')
  .option('--channel <channel>', 'Override default channel/recipients')
  .option('--dry-run', 'Show what would be sent without actually sending')
  .option('--config <path>', 'Path to custom config file')
  .option('-v, --verbose', 'Verbose output');

program.parse();

async function main() {
  const options = program.opts();
  
  try {
    validateConfig(config, options.service.split(','));
    
    const services = options.service.split(',').map(s => s.trim());
    const results = [];
    
    for (const service of services) {
      console.log(`📤 Sending ${options.template} notification to ${service}...`);
      
      const result = await sendNotification(service, options);
      results.push({ service, success: result.success, error: result.error });
      
      if (result.success) {
        console.log(`✅ ${service}: Notification sent successfully`);
      } else {
        console.error(`❌ ${service}: Failed to send notification - ${result.error}`);
      }
    }
    
    // Summary
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    
    console.log(`\n📊 Summary: ${successful} successful, ${failed} failed`);
    
    if (failed > 0) {
      process.exit(1);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (options.verbose) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

async function sendNotification(service, options) {
  try {
    const template = await loadTemplate(service, options.template);
    const payload = await buildPayload(service, template, options);
    
    if (options.dryRun) {
      console.log(`🔍 [DRY RUN] ${service} payload:`, JSON.stringify(payload, null, 2));
      return { success: true };
    }
    
    const response = await sendToService(service, payload);
    return { success: true, response };
    
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function buildPayload(service, template, options) {
  const tokens = {
    RELEASE_TAG: options.release || 'latest',
    DEPLOY_LEAD: options.deployLead || 'Deploy Team',
    CURRENT_TIME: new Date().toISOString(),
    DEPLOYMENT_TIME: new Date().toLocaleString(),
    DURATION: options.duration || 'N/A',
    STATUS: options.status,
    CUSTOM_MESSAGE: options.message || '',
    PRIORITY: options.priority,
    DASHBOARD_URL: process.env.DASHBOARD_URL || 'https://dashboard.mobius-games.com',
    MONITORING_URL: process.env.MONITORING_URL || 'https://monitoring.mobius-games.com',
    LOGS_URL: process.env.LOGS_URL || 'https://logs.mobius-games.com'
  };
  
  let payload = replaceTokens(template, tokens);
  
  // Service-specific customizations
  switch (service) {
    case 'slack':
      payload.channel = options.channel || config.slack.channel;
      payload.username = config.slack.username;
      payload.icon_emoji = config.slack.iconEmoji;
      break;
      
    case 'teams':
      // Teams-specific formatting
      if (options.priority === 'urgent') {
        payload.themeColor = 'FF0000';
      }
      break;
      
    case 'email':
      payload.to = options.channel ? [options.channel] : config.email.toAddresses;
      payload.from = config.email.fromAddress;
      break;
  }
  
  return payload;
}

async function sendToService(service, payload) {
  switch (service) {
    case 'slack':
      return await axios.post(config.slack.webhookUrl, payload);
      
    case 'teams':
      return await axios.post(config.teams.webhookUrl, payload);
      
    case 'email':
      return await sendEmail(payload);
      
    default:
      throw new Error(`Unsupported service: ${service}`);
  }
}

async function sendEmail(payload) {
  const nodemailer = require('nodemailer');
  
  const transporter = nodemailer.createTransporter({
    host: config.email.smtpHost,
    port: config.email.smtpPort,
    secure: false,
    auth: {
      user: config.email.smtpUser,
      pass: config.email.smtpPass
    }
  });
  
  return await transporter.sendMail({
    from: payload.from,
    to: payload.to,
    subject: payload.subject,
    html: payload.html,
    text: payload.text
  });
}

if (require.main === module) {
  main();
}

module.exports = { sendNotification, buildPayload };
```

---

## 🛠️ Helper Functions: `notification-helpers.js`

```javascript
const fs = require('fs').promises;
const path = require('path');

/**
 * Load notification template from file
 */
async function loadTemplate(service, templateName) {
  const templatePath = path.join(__dirname, 'templates', `${service}-templates.json`);
  
  try {
    const templates = JSON.parse(await fs.readFile(templatePath, 'utf8'));
    
    if (!templates[templateName]) {
      throw new Error(`Template '${templateName}' not found for service '${service}'`);
    }
    
    return templates[templateName];
    
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(`Template file not found for service '${service}'`);
    }
    throw error;
  }
}

/**
 * Replace tokens in template with actual values
 */
function replaceTokens(template, tokens) {
  let result = typeof template === 'string' ? template : JSON.stringify(template, null, 2);
  
  for (const [key, value] of Object.entries(tokens)) {
    const regex = new RegExp(`{{${key}}}`, 'g');
    result = result.replace(regex, value || '');
  }
  
  try {
    return JSON.parse(result);
  } catch {
    return result; // Return as string if not valid JSON
  }
}

/**
 * Validate configuration for specified services
 */
function validateConfig(config, services) {
  const errors = [];
  
  for (const service of services) {
    switch (service) {
      case 'slack':
        if (!config.slack.webhookUrl) {
          errors.push('SLACK_WEBHOOK_URL environment variable is required');
        }
        break;
        
      case 'teams':
        if (!config.teams.webhookUrl) {
          errors.push('TEAMS_WEBHOOK_URL environment variable is required');
        }
        break;
        
      case 'email':
        if (!config.email.smtpHost || !config.email.smtpUser || !config.email.smtpPass) {
          errors.push('SMTP configuration (SMTP_HOST, SMTP_USER, SMTP_PASS) is required for email');
        }
        if (config.email.toAddresses.length === 0) {
          errors.push('EMAIL_TO environment variable is required for email notifications');
        }
        break;
        
      default:
        errors.push(`Unsupported service: ${service}`);
    }
  }
  
  if (errors.length > 0) {
    throw new Error('Configuration errors:\n' + errors.map(e => `- ${e}`).join('\n'));
  }
}

/**
 * Get deployment status emoji and color
 */
function getStatusInfo(status) {
  const statusMap = {
    success: { emoji: '✅', color: '00FF00', teams: 'good' },
    warning: { emoji: '⚠️', color: 'FFA500', teams: 'warning' },
    error: { emoji: '❌', color: 'FF0000', teams: 'attention' },
    failure: { emoji: '🔴', color: 'FF0000', teams: 'attention' },
    info: { emoji: 'ℹ️', color: '0078D4', teams: 'default' },
    started: { emoji: '🟡', color: 'FFA500', teams: 'warning' }
  };
  
  return statusMap[status] || statusMap.info;
}

/**
 * Format duration in human readable format
 */
function formatDuration(seconds) {
  if (!seconds || seconds < 0) return 'N/A';
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  } else {
    return `${secs}s`;
  }
}

module.exports = {
  loadTemplate,
  replaceTokens,
  validateConfig,
  getStatusInfo,
  formatDuration
};
```

---

## 📋 Template Files

### Slack Templates (`templates/slack-templates.json`)

```json
{
  "deployment-started": {
    "channel": "{{CHANNEL}}",
    "username": "{{BOT_NAME}}",
    "icon_emoji": ":rocket:",
    "attachments": [
      {
        "color": "warning",
        "title": "🟡 MOBIUS Deployment Started",
        "fields": [
          {
            "title": "Release",
            "value": "`{{RELEASE_TAG}}`",
            "short": true
          },
          {
            "title": "Lead",
            "value": "{{DEPLOY_LEAD}}",
            "short": true
          },
          {
            "title": "Started",
            "value": "{{CURRENT_TIME}}",
            "short": true
          }
        ],
        "actions": [
          {
            "type": "button",
            "text": "📊 Dashboard",
            "url": "{{DASHBOARD_URL}}"
          }
        ]
      }
    ]
  },
  
  "deployment-complete": {
    "channel": "{{CHANNEL}}",
    "username": "{{BOT_NAME}}", 
    "icon_emoji": ":white_check_mark:",
    "attachments": [
      {
        "color": "good",
        "title": "✅ MOBIUS Deployment Complete",
        "fields": [
          {
            "title": "Release",
            "value": "`{{RELEASE_TAG}}`",
            "short": true
          },
          {
            "title": "Duration",
            "value": "{{DURATION}}",
            "short": true
          },
          {
            "title": "Status",
            "value": "{{STATUS}}",
            "short": true
          }
        ]
      }
    ]
  },
  
  "deployment-failed": {
    "channel": "{{CHANNEL}}",
    "username": "{{BOT_NAME}}",
    "icon_emoji": ":x:",
    "attachments": [
      {
        "color": "danger",
        "title": "🔴 MOBIUS Deployment Failed",
        "text": "{{CUSTOM_MESSAGE}}",
        "fields": [
          {
            "title": "Release",
            "value": "`{{RELEASE_TAG}}`",
            "short": true
          },
          {
            "title": "Lead",
            "value": "{{DEPLOY_LEAD}}",
            "short": true
          }
        ],
        "actions": [
          {
            "type": "button",
            "text": "🚨 View Logs",
            "url": "{{LOGS_URL}}"
          }
        ]
      }
    ]
  },

  "custom": {
    "channel": "{{CHANNEL}}",
    "username": "{{BOT_NAME}}",
    "icon_emoji": ":information_source:",
    "text": "{{CUSTOM_MESSAGE}}"
  }
}
```

### Teams Templates (`templates/teams-templates.json`)

```json
{
  "deployment-started": {
    "@type": "MessageCard",
    "@context": "https://schema.org/extensions",
    "summary": "MOBIUS Deployment Started",
    "themeColor": "FFA500",
    "title": "🟡 MOBIUS Deployment Started",
    "sections": [
      {
        "facts": [
          {
            "name": "Release:",
            "value": "{{RELEASE_TAG}}"
          },
          {
            "name": "Lead:",
            "value": "{{DEPLOY_LEAD}}"
          },
          {
            "name": "Started:",
            "value": "{{CURRENT_TIME}}"
          }
        ]
      }
    ],
    "potentialAction": [
      {
        "@type": "OpenUri",
        "name": "📊 View Dashboard",
        "targets": [
          {
            "os": "default",
            "uri": "{{DASHBOARD_URL}}"
          }
        ]
      }
    ]
  },

  "deployment-complete": {
    "@type": "MessageCard",
    "@context": "https://schema.org/extensions", 
    "summary": "MOBIUS Deployment Complete",
    "themeColor": "00FF00",
    "title": "✅ MOBIUS Deployment Complete",
    "sections": [
      {
        "facts": [
          {
            "name": "Release:",
            "value": "{{RELEASE_TAG}}"
          },
          {
            "name": "Duration:",
            "value": "{{DURATION}}"
          },
          {
            "name": "Status:",
            "value": "{{STATUS}}"
          }
        ]
      }
    ]
  },

  "deployment-failed": {
    "@type": "MessageCard",
    "@context": "https://schema.org/extensions",
    "summary": "MOBIUS Deployment Failed",
    "themeColor": "FF0000", 
    "title": "🔴 MOBIUS Deployment Failed",
    "text": "{{CUSTOM_MESSAGE}}",
    "sections": [
      {
        "facts": [
          {
            "name": "Release:",
            "value": "{{RELEASE_TAG}}"
          },
          {
            "name": "Lead:",
            "value": "{{DEPLOY_LEAD}}"
          }
        ]
      }
    ],
    "potentialAction": [
      {
        "@type": "OpenUri",
        "name": "🚨 View Logs",
        "targets": [
          {
            "os": "default",
            "uri": "{{LOGS_URL}}"
          }
        ]
      }
    ]
  },

  "custom": {
    "@type": "MessageCard",
    "@context": "https://schema.org/extensions",
    "summary": "MOBIUS Notification",
    "themeColor": "0078D4",
    "title": "MOBIUS Notification",
    "text": "{{CUSTOM_MESSAGE}}"
  }
}
```

---

## 🔧 CI/CD Integration Examples

### GitHub Actions Workflow

```yaml
# .github/workflows/notify-deployment.yml
name: Notify Deployment

on:
  workflow_run:
    workflows: ["Deploy to Production"]
    types: [requested, completed]

jobs:
  notify-start:
    if: github.event.action == 'requested'
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v4
    - name: Setup Node.js
      uses: actions/setup-node@v4
      with:
        node-version: '18'
    - name: Install dependencies
      run: npm ci
    - name: Send deployment start notification
      env:
        SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
        TEAMS_WEBHOOK_URL: ${{ secrets.TEAMS_WEBHOOK_URL }}
      run: |
        node .github/scripts/send-notification.js \
          --service slack,teams \
          --template deployment-started \
          --release ${{ github.ref_name }} \
          --deploy-lead "${{ github.actor }}"

  notify-complete:
    if: github.event.action == 'completed'
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v4
    - name: Setup Node.js
      uses: actions/setup-node@v4
      with:
        node-version: '18'
    - name: Install dependencies
      run: npm ci
    - name: Send deployment result notification
      env:
        SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
        TEAMS_WEBHOOK_URL: ${{ secrets.TEAMS_WEBHOOK_URL }}
      run: |
        TEMPLATE="deployment-complete"
        STATUS="success"
        
        if [ "${{ github.event.workflow_run.conclusion }}" != "success" ]; then
          TEMPLATE="deployment-failed"
          STATUS="failure"
        fi
        
        node .github/scripts/send-notification.js \
          --service slack,teams \
          --template $TEMPLATE \
          --release ${{ github.ref_name }} \
          --status $STATUS \
          --deploy-lead "${{ github.actor }}" \
          --duration "${{ github.event.workflow_run.run_duration_ms }}ms"
```

### Jenkins Pipeline Integration

```groovy
// Jenkinsfile
pipeline {
    agent any
    
    environment {
        SLACK_WEBHOOK_URL = credentials('slack-webhook-url')
        TEAMS_WEBHOOK_URL = credentials('teams-webhook-url')
        RELEASE_TAG = "${BUILD_NUMBER}"
    }
    
    stages {
        stage('Notify Start') {
            steps {
                script {
                    sh """
                        node .github/scripts/send-notification.js \\
                          --service slack,teams \\
                          --template deployment-started \\
                          --release ${RELEASE_TAG} \\
                          --deploy-lead "${BUILD_USER}"
                    """
                }
            }
        }
        
        stage('Deploy') {
            steps {
                // Your deployment steps here
                echo 'Deploying...'
            }
        }
        
        stage('Notify Complete') {
            post {
                success {
                    script {
                        sh """
                            node .github/scripts/send-notification.js \\
                              --service slack,teams \\
                              --template deployment-complete \\
                              --release ${RELEASE_TAG} \\
                              --status success \\
                              --duration "${currentBuild.durationString}" \\
                              --deploy-lead "${BUILD_USER}"
                        """
                    }
                }
                failure {
                    script {
                        sh """
                            node .github/scripts/send-notification.js \\
                              --service slack,teams \\
                              --template deployment-failed \\
                              --release ${RELEASE_TAG} \\
                              --status failure \\
                              --deploy-lead "${BUILD_USER}" \\
                              --message "Deployment failed at stage: ${env.STAGE_NAME}"
                        """
                    }
                }
            }
        }
    }
}
```

---

## 🧪 Testing and Debugging

### Test Script (`test-notifications.js`)

```javascript
#!/usr/bin/env node

const { sendNotification } = require('./send-notification');

async function testNotifications() {
  const testCases = [
    {
      name: 'Deployment Started',
      service: 'slack',
      options: {
        template: 'deployment-started',
        release: 'v1.0.0-test',
        deployLead: 'Test User',
        dryRun: true
      }
    },
    {
      name: 'Deployment Complete',
      service: 'teams',
      options: {
        template: 'deployment-complete',
        release: 'v1.0.0-test',
        status: 'success',
        duration: '5m 23s',
        dryRun: true
      }
    },
    {
      name: 'Custom Message',
      service: 'slack',
      options: {
        template: 'custom',
        message: 'This is a test notification',
        priority: 'normal',
        dryRun: true
      }
    }
  ];

  console.log('🧪 Testing notification templates...\n');

  for (const testCase of testCases) {
    console.log(`📝 Testing: ${testCase.name} (${testCase.service})`);
    
    try {
      const result = await sendNotification(testCase.service, testCase.options);
      if (result.success) {
        console.log('✅ Test passed\n');
      } else {
        console.log(`❌ Test failed: ${result.error}\n`);
      }
    } catch (error) {
      console.log(`❌ Test error: ${error.message}\n`);
    }
  }
}

if (require.main === module) {
  testNotifications();
}
```

### Run Tests

```bash
# Test all templates with dry run
node .github/scripts/test-notifications.js

# Test specific service
node .github/scripts/send-notification.js \
  --service slack \
  --template deployment-started \
  --release test-v1.0.0 \
  --dry-run \
  --verbose

# Validate configuration
node -e "
const { validateConfig } = require('./.github/scripts/notification-helpers');
const config = {
  slack: { webhookUrl: process.env.SLACK_WEBHOOK_URL },
  teams: { webhookUrl: process.env.TEAMS_WEBHOOK_URL }
};
try {
  validateConfig(config, ['slack', 'teams']);
  console.log('✅ Configuration valid');
} catch (error) {
  console.error('❌ Configuration error:', error.message);
}
"
```

---

## 📚 Advanced Usage

### Custom Template Creation

```bash
# Create a custom template for Slack
cat > .github/scripts/templates/slack-custom-template.json << 'EOF'
{
  "maintenance-window": {
    "channel": "{{CHANNEL}}",
    "username": "MOBIUS Maintenance Bot",
    "icon_emoji": ":construction:",
    "attachments": [
      {
        "color": "warning",
        "title": "🚧 Scheduled Maintenance",
        "text": "{{CUSTOM_MESSAGE}}",
        "fields": [
          {
            "title": "Start Time",
            "value": "{{START_TIME}}",
            "short": true
          },
          {
            "title": "Duration",
            "value": "{{DURATION}}",
            "short": true
          },
          {
            "title": "Services Affected",
            "value": "{{AFFECTED_SERVICES}}",
            "short": false
          }
        ]
      }
    ]
  }
}
EOF

# Use the custom template
node .github/scripts/send-notification.js \
  --service slack \
  --template maintenance-window \
  --message "Scheduled maintenance for database upgrades" \
  --duration "2 hours" \
  --custom-field START_TIME "2024-01-15 02:00 UTC" \
  --custom-field AFFECTED_SERVICES "API, Game Processing"
```

### Environment-Specific Notifications

```bash
# Production notifications
export SLACK_CHANNEL="#mobius-production"
export TEAMS_CHANNEL_NAME="MOBIUS Production Alerts"

# Staging notifications  
export SLACK_CHANNEL="#mobius-staging"
export TEAMS_CHANNEL_NAME="MOBIUS Staging"

# Development notifications
export SLACK_CHANNEL="#mobius-development"
export TEAMS_CHANNEL_NAME="MOBIUS Development"
```

### Batch Notifications

```javascript
// batch-notify.js - Send to multiple channels/services
const { sendNotification } = require('./send-notification');

const deploymentData = {
  release: process.env.RELEASE_TAG,
  deployLead: process.env.DEPLOY_LEAD,
  status: 'success',
  duration: process.env.DEPLOY_DURATION
};

const notifications = [
  { service: 'slack', channel: '#mobius-deployments' },
  { service: 'slack', channel: '#general' },
  { service: 'teams', channel: 'MOBIUS Operations' },
  { service: 'email', channel: 'ops-team@company.com' }
];

async function sendBatchNotifications(template, data) {
  const results = await Promise.allSettled(
    notifications.map(config => 
      sendNotification(config.service, {
        template,
        channel: config.channel,
        ...data
      })
    )
  );
  
  results.forEach((result, index) => {
    const config = notifications[index];
    if (result.status === 'fulfilled' && result.value.success) {
      console.log(`✅ ${config.service} (${config.channel}): Success`);
    } else {
      console.log(`❌ ${config.service} (${config.channel}): Failed`);
    }
  });
}

// Usage
sendBatchNotifications('deployment-complete', deploymentData);
```

---

## 📋 Package.json Scripts

Add these to your `package.json` for convenience:

```json
{
  "scripts": {
    "notify:start": "node .github/scripts/send-notification.js --service slack,teams --template deployment-started",
    "notify:success": "node .github/scripts/send-notification.js --service slack,teams --template deployment-complete --status success",
    "notify:failure": "node .github/scripts/send-notification.js --service slack,teams --template deployment-failed --status failure",
    "notify:custom": "node .github/scripts/send-notification.js --service slack --template custom",
    "notify:test": "node .github/scripts/test-notifications.js",
    "notify:validate": "node -e \"require('./.github/scripts/notification-helpers').validateConfig()\""
  }
}
```

---

## 🔐 Security Best Practices

### Environment Variables

```bash
# Required environment variables
export SLACK_WEBHOOK_URL="https://hooks.slack.com/services/..."
export TEAMS_WEBHOOK_URL="https://outlook.office.com/webhook/..."

# Optional environment variables
export SLACK_CHANNEL="#mobius-deployments"
export TEAMS_CHANNEL_NAME="MOBIUS Operations"
export NOTIFICATION_TIMEOUT=5000  # 5 seconds
export NOTIFICATION_RETRIES=3
```

### Webhook URL Security

- Store webhook URLs in secure environment variables or secrets
- Use different webhooks for different environments
- Rotate webhook URLs regularly
- Monitor webhook usage for anomalies
- Use IP restrictions where possible

---

*Script Version: 1.0*  
*Last Updated: {{CURRENT_DATE}}*  
*Repository: w9bikze8u4cbupc/MOBIUS*