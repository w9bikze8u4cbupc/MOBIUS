const https = require('https');
const fs = require('fs');
const path = require('path');

// Deploy Notification Script
// Usage: node deploy-notify.js start|success|failed|rollback_triggered --env production [--dry-run] [--duration "5m 30s"] [--message "custom message"]

class DeployNotifier {
  constructor(options = {}) {
    this.env = options.env || 'unknown';
    this.dryRun = options.dryRun || false;
    this.slackWebhook = process.env.SLACK_WEBHOOK;
    this.teamsWebhook = process.env.TEAMS_WEBHOOK;
    this.emailConfig = {
      host: process.env.EMAIL_HOST,
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    };
    
    if (this.dryRun) {
      console.log('🧪 DRY RUN MODE - No actual notifications will be sent');
    }
  }

  async sendNotification(type, options = {}) {
    const message = this.formatMessage(type, options);
    
    console.log(`📢 Sending notification: ${type}`);
    console.log(`🎯 Environment: ${this.env}`);
    
    if (this.dryRun) {
      console.log('[DRY RUN] Would send the following message:');
      console.log(message.text);
      this.writeFallbackNotification(type, message);
      return;
    }

    const results = await Promise.allSettled([
      this.sendSlackNotification(message),
      this.sendTeamsNotification(message),
      this.sendEmailNotification(message)
    ]);

    // Check results and handle failures
    const failures = results.filter(r => r.status === 'rejected');
    if (failures.length > 0) {
      console.log(`⚠️  ${failures.length} notification(s) failed`);
      this.writeFallbackNotification(type, message);
    }

    console.log('📝 Notification processing completed');
  }

  formatMessage(type, options = {}) {
    const timestamp = new Date().toISOString();
    const { duration, message: customMessage } = options;
    
    const templates = {
      start: {
        title: `🚀 dhash Deployment Started`,
        text: `dhash deployment has started for environment: ${this.env}`,
        color: '#2196F3'
      },
      success: {
        title: `✅ dhash Deployment Successful`,
        text: `dhash deployment completed successfully for environment: ${this.env}${duration ? ` (Duration: ${duration})` : ''}`,
        color: '#4CAF50'
      },
      failed: {
        title: `❌ dhash Deployment Failed`,
        text: `dhash deployment failed for environment: ${this.env}`,
        color: '#F44336'
      },
      rollback_triggered: {
        title: `🚨 dhash Auto-Rollback Triggered`,
        text: `Automatic rollback triggered for environment: ${this.env}. Quality gates violated.`,
        color: '#FF9800'
      },
      rollback_success: {
        title: `✅ dhash Rollback Successful`,
        text: `dhash rollback completed successfully for environment: ${this.env}`,
        color: '#4CAF50'
      },
      rollback_failed: {
        title: `❌ dhash Rollback Failed`,
        text: `dhash rollback failed for environment: ${this.env}. Manual intervention required.`,
        color: '#F44336'
      },
      alert: {
        title: `⚠️ dhash Alert`,
        text: `dhash monitoring alert for environment: ${this.env}`,
        color: '#FF9800'
      }
    };

    const template = templates[type] || templates.alert;
    
    return {
      title: template.title,
      text: customMessage || template.text,
      color: template.color,
      timestamp,
      environment: this.env,
      fields: [
        { name: 'Environment', value: this.env, inline: true },
        { name: 'Timestamp', value: timestamp, inline: true },
        ...(duration ? [{ name: 'Duration', value: duration, inline: true }] : [])
      ]
    };
  }

  async sendSlackNotification(message) {
    if (!this.slackWebhook) {
      throw new Error('SLACK_WEBHOOK not configured');
    }

    const payload = {
      attachments: [{
        title: message.title,
        text: message.text,
        color: message.color,
        fields: message.fields,
        ts: Math.floor(new Date().getTime() / 1000)
      }]
    };

    return this.sendWebhook(this.slackWebhook, payload, 'Slack');
  }

  async sendTeamsNotification(message) {
    if (!this.teamsWebhook) {
      throw new Error('TEAMS_WEBHOOK not configured');
    }

    const payload = {
      "@type": "MessageCard",
      "@context": "http://schema.org/extensions",
      "themeColor": message.color,
      "summary": message.title,
      "sections": [{
        "activityTitle": message.title,
        "activityText": message.text,
        "facts": message.fields.map(f => ({ name: f.name, value: f.value }))
      }]
    };

    return this.sendWebhook(this.teamsWebhook, payload, 'Teams');
  }

  async sendEmailNotification(message) {
    if (!this.emailConfig.host) {
      throw new Error('Email configuration not complete');
    }

    // Simple email implementation placeholder
    console.log('📧 Email notification would be sent here');
    return Promise.resolve('Email sent');
  }

  async sendWebhook(url, payload, service) {
    return new Promise((resolve, reject) => {
      const data = JSON.stringify(payload);
      
      const options = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': data.length
        }
      };

      const req = https.request(url, options, (res) => {
        let responseData = '';
        
        res.on('data', chunk => {
          responseData += chunk;
        });
        
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            console.log(`✅ ${service} notification sent successfully`);
            resolve(responseData);
          } else {
            reject(new Error(`${service} webhook failed: ${res.statusCode} ${res.statusMessage}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(new Error(`${service} webhook error: ${error.message}`));
      });

      req.write(data);
      req.end();
    });
  }

  writeFallbackNotification(type, message) {
    const notificationDir = path.join(process.cwd(), 'notifications_out');
    if (!fs.existsSync(notificationDir)) {
      fs.mkdirSync(notificationDir, { recursive: true });
    }

    const notification = {
      type,
      ...message,
      fallback_reason: 'Network/webhook failure or dry-run mode'
    };

    const filename = `notification_${type}_${Date.now()}.json`;
    const filepath = path.join(notificationDir, filename);
    
    fs.writeFileSync(filepath, JSON.stringify(notification, null, 2));
    console.log(`📁 Fallback notification written: ${filepath}`);
  }
}

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.error('Usage: node deploy-notify.js <type> --env <environment> [--dry-run] [--duration <duration>] [--message <message>]');
    console.error('Types: start, success, failed, rollback_triggered, rollback_success, rollback_failed, alert');
    process.exit(1);
  }

  const options = {
    type: args[0],
    env: '',
    dryRun: false,
    duration: '',
    message: ''
  };

  for (let i = 1; i < args.length; i++) {
    switch (args[i]) {
      case '--env':
        options.env = args[++i];
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--duration':
        options.duration = args[++i];
        break;
      case '--message':
        options.message = args[++i];
        break;
      default:
        console.error(`Unknown option: ${args[i]}`);
        process.exit(1);
    }
  }

  if (!options.env) {
    console.error('Error: --env is required');
    process.exit(1);
  }

  return options;
}

// Main execution
if (require.main === module) {
  const options = parseArgs();
  const notifier = new DeployNotifier(options);
  
  notifier.sendNotification(options.type, options).catch(error => {
    console.error('❌ Notification failed:', error.message);
    process.exit(1);
  });
}

module.exports = DeployNotifier;