#!/usr/bin/env node
// notify.js - Zero-dependency Node.js CLI for Slack, Teams, Discord, Email with exponential backoff and jitter
// Usage: node notify.js --type <type> --env <environment> --message <message> [--dry-run] [--channel <channel>]

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

class NotificationService {
  constructor(options = {}) {
    this.dryRun = options.dryRun || false;
    this.maxRetries = options.maxRetries || 3;
    this.baseDelayMs = options.baseDelayMs || 1000;
    this.maxDelayMs = options.maxDelayMs || 30000;
    this.fallbackDir = options.fallbackDir || 'notification_fallback';
    
    // Ensure fallback directory exists
    if (!fs.existsSync(this.fallbackDir)) {
      fs.mkdirSync(this.fallbackDir, { recursive: true });
    }
  }

  // Calculate delay with exponential backoff and jitter
  calculateDelay(attempt) {
    const exponentialDelay = Math.min(this.baseDelayMs * Math.pow(2, attempt), this.maxDelayMs);
    const jitter = Math.random() * 0.1 * exponentialDelay; // 10% jitter
    return Math.floor(exponentialDelay + jitter);
  }

  // Sleep function
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Write to fallback file
  writeFallbackFile(notification, error = null) {
    const timestamp = new Date().toISOString();
    const filename = `notification_${timestamp.split('T')[0]}_${notification.environment || 'unknown'}.log`;
    const filepath = path.join(this.fallbackDir, filename);
    
    const logEntry = {
      timestamp,
      notification,
      delivery_status: 'fallback',
      error: error ? error.message : null
    };
    
    fs.appendFileSync(filepath, JSON.stringify(logEntry) + '\n');
    console.log(`📝 Notification saved to fallback file: ${filepath}`);
    return filepath;
  }

  // Load notification template
  loadTemplate(type, environment) {
    const templatePath = path.join('templates', 'notifications', `${type}.json`);
    
    if (fs.existsSync(templatePath)) {
      try {
        const template = JSON.parse(fs.readFileSync(templatePath, 'utf8'));
        
        // Environment-specific override
        if (template.environments && template.environments[environment]) {
          return { ...template, ...template.environments[environment] };
        }
        
        return template;
      } catch (error) {
        console.warn(`Warning: Failed to load template ${templatePath}: ${error.message}`);
      }
    }
    
    // Return default template
    return this.getDefaultTemplate(type);
  }

  // Get default template
  getDefaultTemplate(type) {
    const templates = {
      deploy: {
        title: '🚀 Deployment Notification',
        color: 'good',
        emoji: '🚀'
      },
      rollback: {
        title: '⚡ Rollback Notification',
        color: 'warning',
        emoji: '⚡'
      },
      monitoring: {
        title: '📊 Monitoring Alert',
        color: 'danger',
        emoji: '🚨'
      },
      success: {
        title: '✅ Success Notification',
        color: 'good',
        emoji: '✅'
      },
      error: {
        title: '❌ Error Notification',
        color: 'danger',
        emoji: '❌'
      }
    };
    
    return templates[type] || templates.deploy;
  }

  // Format message for Slack
  formatSlackMessage(notification, template) {
    const payload = {
      text: template.title,
      attachments: [{
        color: template.color || 'good',
        fields: [
          {
            title: 'Environment',
            value: notification.environment,
            short: true
          },
          {
            title: 'Type',
            value: notification.type,
            short: true
          },
          {
            title: 'Message',
            value: notification.message,
            short: false
          },
          {
            title: 'Timestamp',
            value: notification.timestamp,
            short: true
          }
        ]
      }]
    };
    
    if (notification.status) {
      payload.attachments[0].fields.push({
        title: 'Status',
        value: notification.status,
        short: true
      });
    }
    
    return payload;
  }

  // Format message for Teams
  formatTeamsMessage(notification, template) {
    return {
      '@type': 'MessageCard',
      '@context': 'http://schema.org/extensions',
      themeColor: template.color === 'danger' ? 'FF0000' : template.color === 'warning' ? 'FFA500' : '00FF00',
      summary: `${template.title} - ${notification.environment}`,
      sections: [{
        activityTitle: template.title,
        activitySubtitle: notification.environment,
        facts: [
          { name: 'Environment', value: notification.environment },
          { name: 'Type', value: notification.type },
          { name: 'Status', value: notification.status || 'N/A' },
          { name: 'Timestamp', value: notification.timestamp }
        ],
        text: notification.message
      }]
    };
  }

  // Format message for Discord
  formatDiscordMessage(notification, template) {
    const colorMap = {
      'good': 0x00ff00,
      'warning': 0xffa500,
      'danger': 0xff0000
    };
    
    return {
      embeds: [{
        title: template.title,
        description: notification.message,
        color: colorMap[template.color] || colorMap.good,
        fields: [
          { name: 'Environment', value: notification.environment, inline: true },
          { name: 'Type', value: notification.type, inline: true },
          { name: 'Status', value: notification.status || 'N/A', inline: true },
          { name: 'Timestamp', value: notification.timestamp, inline: false }
        ]
      }]
    };
  }

  // Send HTTP request with retry logic
  async sendHttpRequest(url, payload, retries = 0) {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const isHttps = urlObj.protocol === 'https:';
      const client = isHttps ? https : http;
      
      const data = JSON.stringify(payload);
      
      const options = {
        hostname: urlObj.hostname,
        port: urlObj.port || (isHttps ? 443 : 80),
        path: urlObj.pathname + urlObj.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
          'User-Agent': 'DHash-Notification-Service/1.0'
        },
        timeout: 10000
      };
      
      const req = client.request(options, (res) => {
        let body = '';
        res.on('data', (chunk) => body += chunk);
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ statusCode: res.statusCode, body });
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${body}`));
          }
        });
      });
      
      req.on('error', (error) => {
        reject(error);
      });
      
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });
      
      req.write(data);
      req.end();
    });
  }

  // Send notification with retry logic
  async sendNotification(notification) {
    const template = this.loadTemplate(notification.type, notification.environment);
    const webhookUrl = process.env.WEBHOOK_URL || process.env.SLACK_WEBHOOK_URL || process.env.TEAMS_WEBHOOK_URL || process.env.DISCORD_WEBHOOK_URL;
    
    if (!webhookUrl) {
      console.log('⚠️  No webhook URL configured, using fallback file only');
      return this.writeFallbackFile(notification, new Error('No webhook URL configured'));
    }
    
    // Determine webhook type from URL
    let payload;
    let webhookType = 'unknown';
    
    if (webhookUrl.includes('hooks.slack.com')) {
      payload = this.formatSlackMessage(notification, template);
      webhookType = 'Slack';
    } else if (webhookUrl.includes('outlook.office.com') || webhookUrl.includes('teams.microsoft.com')) {
      payload = this.formatTeamsMessage(notification, template);
      webhookType = 'Teams';
    } else if (webhookUrl.includes('discord.com') || webhookUrl.includes('discordapp.com')) {
      payload = this.formatDiscordMessage(notification, template);
      webhookType = 'Discord';
    } else {
      // Generic webhook format (Slack-like)
      payload = this.formatSlackMessage(notification, template);
      webhookType = 'Generic';
    }
    
    if (this.dryRun) {
      console.log(`[DRY-RUN] Would send ${webhookType} notification:`);
      console.log(JSON.stringify(payload, null, 2));
      return this.writeFallbackFile(notification);
    }
    
    // Attempt to send with retry logic
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        console.log(`📨 Sending ${webhookType} notification (attempt ${attempt + 1}/${this.maxRetries + 1})...`);
        
        const result = await this.sendHttpRequest(webhookUrl, payload, attempt);
        
        console.log(`✅ ${webhookType} notification sent successfully (HTTP ${result.statusCode})`);
        
        // Also write to audit log
        const auditEntry = {
          timestamp: new Date().toISOString(),
          notification,
          delivery_status: 'success',
          webhook_type: webhookType,
          attempt: attempt + 1,
          status_code: result.statusCode
        };
        
        const auditFile = path.join(this.fallbackDir, 'delivery_audit.log');
        fs.appendFileSync(auditFile, JSON.stringify(auditEntry) + '\n');
        
        return result;
        
      } catch (error) {
        console.error(`❌ ${webhookType} notification failed (attempt ${attempt + 1}): ${error.message}`);
        
        if (attempt < this.maxRetries) {
          const delay = this.calculateDelay(attempt);
          console.log(`⏳ Retrying in ${delay}ms...`);
          await this.sleep(delay);
        } else {
          console.error(`❌ All ${this.maxRetries + 1} attempts failed, using fallback file`);
          return this.writeFallbackFile(notification, error);
        }
      }
    }
  }
}

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {};
  
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--type':
        options.type = args[++i];
        break;
      case '--env':
        options.environment = args[++i];
        break;
      case '--message':
        options.message = args[++i];
        break;
      case '--status':
        options.status = args[++i];
        break;
      case '--channel':
        options.channel = args[++i];
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '-h':
      case '--help':
        console.log('Usage: node notify.js --type <type> --env <environment> --message <message> [options]');
        console.log('');
        console.log('Required:');
        console.log('  --type          Notification type (deploy, rollback, monitoring, success, error)');
        console.log('  --env           Environment name');
        console.log('  --message       Message content');
        console.log('');
        console.log('Optional:');
        console.log('  --status        Status (success, error, warning, info)');
        console.log('  --channel       Channel/recipient override');
        console.log('  --dry-run       Show what would be sent without actually sending');
        console.log('');
        console.log('Environment Variables:');
        console.log('  WEBHOOK_URL     Generic webhook URL');
        console.log('  SLACK_WEBHOOK_URL    Slack webhook URL');
        console.log('  TEAMS_WEBHOOK_URL    Teams webhook URL');
        console.log('  DISCORD_WEBHOOK_URL  Discord webhook URL');
        process.exit(0);
      default:
        console.error(`Unknown option: ${args[i]}`);
        process.exit(1);
    }
  }
  
  return options;
}

// Main execution
async function main() {
  const options = parseArgs();
  
  // Validate required arguments
  if (!options.type || !options.environment || !options.message) {
    console.error('Error: --type, --env, and --message are required');
    process.exit(1);
  }
  
  // Create notification object
  const notification = {
    type: options.type,
    environment: options.environment,
    message: options.message,
    status: options.status,
    channel: options.channel,
    timestamp: new Date().toISOString()
  };
  
  // Create notification service
  const notificationService = new NotificationService({
    dryRun: options.dryRun
  });
  
  try {
    await notificationService.sendNotification(notification);
  } catch (error) {
    console.error(`❌ Notification failed: ${error.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { NotificationService };