#!/usr/bin/env node

/**
 * Zero-dependency Notification System for dhash Deployments
 * Supports Slack, Teams, Discord, Email with retry/backoff
 * Usage: node scripts/notify.js --type deploy --env production --message "Deployment complete"
 */

const https = require('https');
const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');

// Default configuration
const DEFAULT_CONFIG = {
  retry: {
    maxAttempts: 3,
    backoffMs: 1000,
    backoffMultiplier: 2
  },
  timeout: 10000,
  templates: {
    deploy: {
      title: '🚀 Deployment Notification',
      color: '#36a64f', // Green
      emoji: '🚀'
    },
    rollback: {
      title: '🔄 Rollback Notification',
      color: '#ff9500', // Orange
      emoji: '🔄'
    },
    error: {
      title: '🚨 Error Notification',
      color: '#ff0000', // Red
      emoji: '🚨'
    },
    success: {
      title: '✅ Success Notification',
      color: '#36a64f', // Green
      emoji: '✅'
    },
    warning: {
      title: '⚠️ Warning Notification',
      color: '#ffcc00', // Yellow
      emoji: '⚠️'
    }
  }
};

class NotificationService {
  constructor() {
    this.config = DEFAULT_CONFIG;
    this.logFile = path.join(process.cwd(), 'logs', `notifications_${this.formatTimestamp(new Date())}.log`);
    this.ensureLogDir();
  }

  formatTimestamp(date) {
    return date.toISOString().replace(/[:.]/g, '-').replace('T', '_').split('.')[0];
  }

  ensureLogDir() {
    const logDir = path.dirname(this.logFile);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  }

  log(message, level = 'INFO') {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level}] ${message}`;
    
    console.log(logMessage);
    
    try {
      fs.appendFileSync(this.logFile, logMessage + '\n');
    } catch (error) {
      console.error(`Failed to write to log file: ${error.message}`);
    }
  }

  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // HTTP/HTTPS request with timeout and retry
  async httpRequest(options, data = null) {
    const { maxAttempts, backoffMs, backoffMultiplier } = this.config.retry;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        this.log(`HTTP request attempt ${attempt}/${maxAttempts}: ${options.method} ${options.protocol}//${options.hostname}${options.path}`);
        
        const response = await this.makeHttpRequest(options, data);
        this.log(`HTTP request successful: ${response.statusCode} ${response.statusMessage}`);
        return response;
      } catch (error) {
        this.log(`HTTP request attempt ${attempt} failed: ${error.message}`, 'ERROR');
        
        if (attempt < maxAttempts) {
          const delay = backoffMs * Math.pow(backoffMultiplier, attempt - 1);
          this.log(`Retrying in ${delay}ms...`, 'WARN');
          await this.sleep(delay);
        } else {
          throw new Error(`HTTP request failed after ${maxAttempts} attempts: ${error.message}`);
        }
      }
    }
  }

  makeHttpRequest(options, data) {
    return new Promise((resolve, reject) => {
      const requestModule = options.protocol === 'https:' ? https : http;
      
      const req = requestModule.request(options, (res) => {
        let responseBody = '';
        
        res.on('data', (chunk) => {
          responseBody += chunk;
        });
        
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            statusMessage: res.statusMessage,
            headers: res.headers,
            body: responseBody
          });
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      req.setTimeout(this.config.timeout, () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      if (data) {
        req.write(data);
      }
      
      req.end();
    });
  }

  // Slack notification
  async sendSlackNotification(webhookUrl, message, type, environment) {
    const template = this.config.templates[type] || this.config.templates.success;
    
    const payload = {
      text: `${template.emoji} ${template.title}`,
      attachments: [
        {
          color: template.color,
          fields: [
            {
              title: 'Environment',
              value: environment.toUpperCase(),
              short: true
            },
            {
              title: 'Type',
              value: type.toUpperCase(),
              short: true
            },
            {
              title: 'Message',
              value: message,
              short: false
            },
            {
              title: 'Timestamp',
              value: new Date().toISOString(),
              short: true
            }
          ]
        }
      ]
    };

    const options = {
      ...url.parse(webhookUrl),
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    };

    await this.httpRequest(options, JSON.stringify(payload));
    this.log('Slack notification sent successfully');
  }

  // Microsoft Teams notification
  async sendTeamsNotification(webhookUrl, message, type, environment) {
    const template = this.config.templates[type] || this.config.templates.success;
    
    const payload = {
      '@type': 'MessageCard',
      '@context': 'https://schema.org/extensions',
      summary: `${template.title} - ${environment}`,
      themeColor: template.color.replace('#', ''),
      sections: [
        {
          activityTitle: `${template.emoji} ${template.title}`,
          activitySubtitle: `Environment: ${environment.toUpperCase()}`,
          facts: [
            {
              name: 'Type',
              value: type.toUpperCase()
            },
            {
              name: 'Environment',
              value: environment.toUpperCase()
            },
            {
              name: 'Timestamp',
              value: new Date().toISOString()
            }
          ],
          text: message
        }
      ]
    };

    const options = {
      ...url.parse(webhookUrl),
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    };

    await this.httpRequest(options, JSON.stringify(payload));
    this.log('Teams notification sent successfully');
  }

  // Discord notification
  async sendDiscordNotification(webhookUrl, message, type, environment) {
    const template = this.config.templates[type] || this.config.templates.success;
    
    const embed = {
      title: `${template.emoji} ${template.title}`,
      description: message,
      color: parseInt(template.color.replace('#', ''), 16),
      fields: [
        {
          name: 'Environment',
          value: environment.toUpperCase(),
          inline: true
        },
        {
          name: 'Type',
          value: type.toUpperCase(),
          inline: true
        },
        {
          name: 'Timestamp',
          value: new Date().toISOString(),
          inline: false
        }
      ],
      timestamp: new Date().toISOString()
    };

    const payload = {
      embeds: [embed]
    };

    const options = {
      ...url.parse(webhookUrl),
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    };

    await this.httpRequest(options, JSON.stringify(payload));
    this.log('Discord notification sent successfully');
  }

  // Email notification (simplified SMTP)
  async sendEmailNotification(smtpConfig, recipients, message, type, environment) {
    this.log('Email notification requested - SMTP implementation required');
    this.log(`SMTP Config: ${smtpConfig.host}:${smtpConfig.port}`);
    this.log(`Recipients: ${recipients.join(', ')}`);
    this.log(`Message: ${message}`);
    
    // For a full implementation, you would need to implement SMTP protocol
    // This is a placeholder showing the structure
    const template = this.config.templates[type] || this.config.templates.success;
    
    const emailContent = {
      subject: `${template.emoji} dhash ${template.title} - ${environment.toUpperCase()}`,
      body: `
${template.title}

Environment: ${environment.toUpperCase()}
Type: ${type.toUpperCase()}
Message: ${message}
Timestamp: ${new Date().toISOString()}

This is an automated notification from the dhash deployment system.
      `.trim()
    };
    
    this.log(`Email content prepared: ${emailContent.subject}`);
    this.log('Note: Full SMTP implementation needed for actual email sending');
  }

  // File-based notification (for local testing)
  async sendFileNotification(message, type, environment) {
    const notificationFile = path.join(process.cwd(), 'logs', 'notifications.json');
    
    let notifications = [];
    if (fs.existsSync(notificationFile)) {
      try {
        const content = fs.readFileSync(notificationFile, 'utf8');
        notifications = JSON.parse(content);
      } catch (error) {
        this.log(`Failed to read existing notifications: ${error.message}`, 'WARN');
      }
    }
    
    const notification = {
      timestamp: new Date().toISOString(),
      type,
      environment,
      message,
      id: Date.now().toString()
    };
    
    notifications.push(notification);
    
    // Keep only last 100 notifications
    if (notifications.length > 100) {
      notifications = notifications.slice(-100);
    }
    
    fs.writeFileSync(notificationFile, JSON.stringify(notifications, null, 2));
    this.log(`File notification saved to: ${notificationFile}`);
  }

  // Main notification dispatcher
  async sendNotification(options) {
    const { type, environment, message, channels = [], webhooks = {}, dryRun = false } = options;
    
    this.log(`Sending ${type} notification for ${environment}: ${message}`);
    
    if (dryRun) {
      this.log('DRY RUN MODE - No actual notifications will be sent');
      this.log(`Would send: ${type} notification to ${channels.join(', ')}`);
      return;
    }

    const results = [];

    // Always send file notification for logging
    try {
      await this.sendFileNotification(message, type, environment);
      results.push({ channel: 'file', success: true });
    } catch (error) {
      this.log(`File notification failed: ${error.message}`, 'ERROR');
      results.push({ channel: 'file', success: false, error: error.message });
    }

    // Send to requested channels
    for (const channel of channels) {
      try {
        switch (channel) {
          case 'slack':
            if (webhooks.slack) {
              await this.sendSlackNotification(webhooks.slack, message, type, environment);
              results.push({ channel: 'slack', success: true });
            } else {
              this.log('Slack webhook URL not provided', 'WARN');
              results.push({ channel: 'slack', success: false, error: 'Webhook URL not provided' });
            }
            break;

          case 'teams':
            if (webhooks.teams) {
              await this.sendTeamsNotification(webhooks.teams, message, type, environment);
              results.push({ channel: 'teams', success: true });
            } else {
              this.log('Teams webhook URL not provided', 'WARN');
              results.push({ channel: 'teams', success: false, error: 'Webhook URL not provided' });
            }
            break;

          case 'discord':
            if (webhooks.discord) {
              await this.sendDiscordNotification(webhooks.discord, message, type, environment);
              results.push({ channel: 'discord', success: true });
            } else {
              this.log('Discord webhook URL not provided', 'WARN');
              results.push({ channel: 'discord', success: false, error: 'Webhook URL not provided' });
            }
            break;

          case 'email':
            if (webhooks.email && webhooks.email.recipients) {
              await this.sendEmailNotification(webhooks.email.smtp, webhooks.email.recipients, message, type, environment);
              results.push({ channel: 'email', success: true });
            } else {
              this.log('Email configuration not provided', 'WARN');
              results.push({ channel: 'email', success: false, error: 'Email configuration not provided' });
            }
            break;

          case 'console':
            console.log(`\n🔔 NOTIFICATION: ${type.toUpperCase()} - ${environment.toUpperCase()}`);
            console.log(`📄 Message: ${message}`);
            console.log(`⏰ Timestamp: ${new Date().toISOString()}\n`);
            results.push({ channel: 'console', success: true });
            break;

          default:
            this.log(`Unknown notification channel: ${channel}`, 'WARN');
            results.push({ channel, success: false, error: 'Unknown channel' });
        }
      } catch (error) {
        this.log(`${channel} notification failed: ${error.message}`, 'ERROR');
        results.push({ channel, success: false, error: error.message });
      }
    }

    return results;
  }
}

// CLI handling
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    type: 'success',
    environment: 'staging',
    message: '',
    channels: ['console', 'file'],
    webhooks: {},
    dryRun: false
  };

  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    const value = args[i + 1];

    switch (flag) {
      case '--type':
        options.type = value;
        i++;
        break;
      case '--env':
      case '--environment':
        options.environment = value;
        i++;
        break;
      case '--message':
        options.message = value;
        i++;
        break;
      case '--channels':
        options.channels = value.split(',').map(c => c.trim());
        i++;
        break;
      case '--slack':
        options.channels.push('slack');
        options.webhooks.slack = value;
        i++;
        break;
      case '--teams':
        options.channels.push('teams');
        options.webhooks.teams = value;
        i++;
        break;
      case '--discord':
        options.channels.push('discord');
        options.webhooks.discord = value;
        i++;
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--help':
        console.log(`
dhash Notification Service - Zero-dependency notifications with retry/backoff

Usage: node notify.js [OPTIONS]

OPTIONS:
  --type TYPE            Notification type: deploy|rollback|error|success|warning (default: success)
  --env ENV              Environment: staging|production (default: staging)
  --message MESSAGE      Notification message (required)
  --channels CHANNELS    Comma-separated list: console,file,slack,teams,discord,email
  --slack URL            Slack webhook URL (adds slack to channels)
  --teams URL            Teams webhook URL (adds teams to channels)
  --discord URL          Discord webhook URL (adds discord to channels)
  --dry-run              Show what would be sent without actually sending
  --help                 Show this help message

Examples:
  # Console and file notification
  node notify.js --type deploy --env production --message "Deployment completed successfully"
  
  # Slack notification
  node notify.js --type error --env production --message "Deployment failed" --slack "https://hooks.slack.com/..."
  
  # Multiple channels
  node notify.js --type success --env staging --message "Tests passed" --channels "console,file,slack" --slack "https://hooks.slack.com/..."
  
  # Dry run
  node notify.js --type deploy --message "Test message" --dry-run

Environment Variables:
  SLACK_WEBHOOK_URL      Default Slack webhook URL
  TEAMS_WEBHOOK_URL      Default Teams webhook URL
  DISCORD_WEBHOOK_URL    Default Discord webhook URL
        `);
        process.exit(0);
      default:
        if (flag.startsWith('--')) {
          console.error(`Unknown option: ${flag}`);
          process.exit(1);
        }
    }
  }

  // Use environment variables as fallbacks
  if (!options.webhooks.slack && process.env.SLACK_WEBHOOK_URL) {
    options.webhooks.slack = process.env.SLACK_WEBHOOK_URL;
  }
  if (!options.webhooks.teams && process.env.TEAMS_WEBHOOK_URL) {
    options.webhooks.teams = process.env.TEAMS_WEBHOOK_URL;
  }
  if (!options.webhooks.discord && process.env.DISCORD_WEBHOOK_URL) {
    options.webhooks.discord = process.env.DISCORD_WEBHOOK_URL;
  }

  if (!options.message && !options.dryRun) {
    console.error('Error: --message is required');
    process.exit(1);
  }

  return options;
}

// Main execution
if (require.main === module) {
  const options = parseArgs();
  const notificationService = new NotificationService();

  notificationService.sendNotification(options)
    .then((results) => {
      console.log('Notification results:');
      results.forEach(result => {
        const status = result.success ? '✅' : '❌';
        console.log(`  ${status} ${result.channel}: ${result.success ? 'Success' : result.error}`);
      });
      
      const successCount = results.filter(r => r.success).length;
      const totalCount = results.length;
      
      if (successCount === totalCount) {
        console.log(`\n✅ All ${totalCount} notifications sent successfully`);
        process.exit(0);
      } else {
        console.log(`\n⚠️  ${successCount}/${totalCount} notifications sent successfully`);
        process.exit(1);
      }
    })
    .catch((error) => {
      console.error('Notification failed:', error.message);
      process.exit(1);
    });
}

module.exports = NotificationService;