#!/usr/bin/env node

/**
 * Notification script for dhash guarded rollout
 * Supports multi-channel notifications (Slack/Teams/Discord/Email) with retry/backoff and file fallback
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { URL } = require('url');

// Configuration
const SCRIPT_DIR = __dirname;
const PROJECT_ROOT = path.join(SCRIPT_DIR, '..');
const FALLBACK_DIR = path.join(PROJECT_ROOT, 'notifications', 'fallback');

// Default configuration
const DEFAULT_CONFIG = {
  retry: {
    maxAttempts: 3,
    baseDelay: 1000, // 1 second
    maxDelay: 10000, // 10 seconds
    backoffMultiplier: 2
  },
  timeout: 5000, // 5 seconds
  fallbackEnabled: true
};

// Notification templates
const TEMPLATES = {
  deploy: {
    title: '🚀 Deployment Notification',
    color: '#00ff00',
    emoji: ':rocket:'
  },
  rollback: {
    title: '⚠️  Rollback Notification', 
    color: '#ff6600',
    emoji: ':warning:'
  },
  'auto-rollback': {
    title: '🚨 Auto-Rollback Triggered',
    color: '#ff0000',
    emoji: ':rotating_light:'
  },
  migration: {
    title: '🔄 Migration Notification',
    color: '#0066ff',
    emoji: ':arrows_counterclockwise:'
  },
  'monitoring-complete': {
    title: '✅ Monitoring Complete',
    color: '#00ff00',
    emoji: ':white_check_mark:'
  },
  test: {
    title: '🧪 Test Notification',
    color: '#666666',
    emoji: ':test_tube:'
  }
};

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    type: 'deploy',
    environment: 'staging',
    message: '',
    priority: 'normal',
    dryRun: false,
    channels: ['slack'], // Default to slack
    timestamp: new Date().toISOString(),
    metadata: {}
  };

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
      case '--priority':
        options.priority = args[++i];
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--channels':
        options.channels = args[++i].split(',');
        break;
      case '--timestamp':
        options.timestamp = args[++i];
        break;
      // Additional metadata options
      case '--backup':
        options.metadata.backup = args[++i];
        break;
      case '--gate':
        options.metadata.gate = args[++i];
        break;
      case '--threshold':
        options.metadata.threshold = args[++i];
        break;
      case '--current':
        options.metadata.current = args[++i];
        break;
      case '--summary':
        options.metadata.summary = args[++i];
        break;
      case '-h':
      case '--help':
        console.log(`Usage: ${process.argv[1]} [OPTIONS]`);
        console.log('  --type TYPE             Notification type (deploy, rollback, auto-rollback, migration, test)');
        console.log('  --env ENVIRONMENT       Target environment');
        console.log('  --message MESSAGE       Notification message');
        console.log('  --priority PRIORITY     Priority level (low, normal, high, critical)');
        console.log('  --dry-run              Simulate notification without sending');
        console.log('  --channels CHANNELS     Comma-separated list of channels (slack,teams,discord,email)');
        console.log('  --timestamp TIMESTAMP   Custom timestamp');
        console.log('  --backup FILE          Backup file name (for rollback notifications)');
        console.log('  --gate GATE            Quality gate name (for auto-rollback)');
        console.log('  --threshold VALUE      Threshold value (for auto-rollback)');
        console.log('  --current VALUE        Current value (for auto-rollback)');
        console.log('  --summary JSON         Summary data (for monitoring-complete)');
        console.log('  -h, --help             Show this help message');
        process.exit(0);
      default:
        // Skip unknown options to avoid breaking
        if (args[i].startsWith('--')) {
          i++; // Skip the next argument too if it doesn't start with --
        }
        break;
    }
  }

  return options;
}

// Logging functions
function log(level, message, data = null) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${level.padEnd(5)}: ${message}${data ? ` ${JSON.stringify(data)}` : ''}`);
}

function logInfo(message, data) { log('INFO', message, data); }
function logWarn(message, data) { log('WARN', message, data); }
function logError(message, data) { log('ERROR', message, data); }

// Notification builders
class NotificationBuilder {
  constructor(options) {
    this.options = options;
    this.template = TEMPLATES[options.type] || TEMPLATES.deploy;
  }

  buildSlackPayload() {
    const attachment = {
      color: this.template.color,
      title: `${this.template.title} - ${this.options.environment}`,
      text: this.options.message,
      fields: [
        {
          title: 'Environment',
          value: this.options.environment,
          short: true
        },
        {
          title: 'Priority',
          value: this.options.priority,
          short: true
        },
        {
          title: 'Timestamp',
          value: this.options.timestamp,
          short: true
        }
      ],
      footer: 'MOBIUS dhash Deployment System',
      ts: Math.floor(new Date(this.options.timestamp).getTime() / 1000)
    };

    // Add metadata fields
    if (this.options.metadata.backup) {
      attachment.fields.push({
        title: 'Backup File',
        value: this.options.metadata.backup,
        short: true
      });
    }

    if (this.options.metadata.gate) {
      attachment.fields.push({
        title: 'Quality Gate',
        value: this.options.metadata.gate,
        short: true
      });
      attachment.fields.push({
        title: 'Threshold',
        value: this.options.metadata.threshold,
        short: true
      });
      attachment.fields.push({
        title: 'Current Value',
        value: this.options.metadata.current,
        short: true
      });
    }

    if (this.options.metadata.summary) {
      try {
        const summary = JSON.parse(this.options.metadata.summary);
        attachment.fields.push({
          title: 'Summary',
          value: `${summary.total_checks} checks, ${summary.total_violations} violations, ${summary.total_duration_minutes}m`,
          short: false
        });
      } catch (e) {
        // Ignore JSON parse errors
      }
    }

    return {
      text: `${this.template.emoji} ${this.template.title}`,
      attachments: [attachment]
    };
  }

  buildTeamsPayload() {
    const card = {
      '@type': 'MessageCard',
      '@context': 'https://schema.org/extensions',
      themeColor: this.template.color.replace('#', ''),
      summary: `${this.template.title} - ${this.options.environment}`,
      sections: [
        {
          activityTitle: `${this.template.title} - ${this.options.environment}`,
          activitySubtitle: this.options.message,
          activityImage: null,
          facts: [
            {
              name: 'Environment',
              value: this.options.environment
            },
            {
              name: 'Priority',
              value: this.options.priority
            },
            {
              name: 'Timestamp',
              value: this.options.timestamp
            }
          ]
        }
      ]
    };

    // Add metadata facts
    if (this.options.metadata.backup) {
      card.sections[0].facts.push({
        name: 'Backup File',
        value: this.options.metadata.backup
      });
    }

    if (this.options.metadata.gate) {
      card.sections[0].facts.push(
        { name: 'Quality Gate', value: this.options.metadata.gate },
        { name: 'Threshold', value: this.options.metadata.threshold },
        { name: 'Current Value', value: this.options.metadata.current }
      );
    }

    return card;
  }

  buildDiscordPayload() {
    const embed = {
      title: `${this.template.title} - ${this.options.environment}`,
      description: this.options.message,
      color: parseInt(this.template.color.replace('#', ''), 16),
      fields: [
        { name: 'Environment', value: this.options.environment, inline: true },
        { name: 'Priority', value: this.options.priority, inline: true },
        { name: 'Timestamp', value: this.options.timestamp, inline: true }
      ],
      footer: {
        text: 'MOBIUS dhash Deployment System'
      },
      timestamp: this.options.timestamp
    };

    // Add metadata fields
    if (this.options.metadata.backup) {
      embed.fields.push({ name: 'Backup File', value: this.options.metadata.backup, inline: true });
    }

    if (this.options.metadata.gate) {
      embed.fields.push(
        { name: 'Quality Gate', value: this.options.metadata.gate, inline: true },
        { name: 'Threshold', value: this.options.metadata.threshold, inline: true },
        { name: 'Current Value', value: this.options.metadata.current, inline: true }
      );
    }

    return {
      embeds: [embed]
    };
  }

  buildEmailPayload() {
    let htmlContent = `
    <html>
    <body>
      <h2>${this.template.title} - ${this.options.environment}</h2>
      <p><strong>Message:</strong> ${this.options.message}</p>
      <hr>
      <table>
        <tr><td><strong>Environment:</strong></td><td>${this.options.environment}</td></tr>
        <tr><td><strong>Priority:</strong></td><td>${this.options.priority}</td></tr>
        <tr><td><strong>Timestamp:</strong></td><td>${this.options.timestamp}</td></tr>`;

    if (this.options.metadata.backup) {
      htmlContent += `<tr><td><strong>Backup File:</strong></td><td>${this.options.metadata.backup}</td></tr>`;
    }

    if (this.options.metadata.gate) {
      htmlContent += `
        <tr><td><strong>Quality Gate:</strong></td><td>${this.options.metadata.gate}</td></tr>
        <tr><td><strong>Threshold:</strong></td><td>${this.options.metadata.threshold}</td></tr>
        <tr><td><strong>Current Value:</strong></td><td>${this.options.metadata.current}</td></tr>`;
    }

    htmlContent += `
      </table>
      <hr>
      <p><em>Generated by MOBIUS dhash Deployment System</em></p>
    </body>
    </html>`;

    return {
      subject: `${this.template.title} - ${this.options.environment}`,
      html: htmlContent,
      text: `${this.template.title} - ${this.options.environment}\n\n${this.options.message}\n\nEnvironment: ${this.options.environment}\nPriority: ${this.options.priority}\nTimestamp: ${this.options.timestamp}`
    };
  }
}

// HTTP client with retry logic
class HttpClient {
  constructor(config = DEFAULT_CONFIG) {
    this.config = config;
  }

  async sendRequest(url, payload, headers = {}) {
    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === 'https:';
    const client = isHttps ? https : require('http');

    const postData = JSON.stringify(payload);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'User-Agent': 'MOBIUS-dhash-notifier/1.0',
        ...headers
      },
      timeout: this.config.timeout
    };

    return new Promise((resolve, reject) => {
      const req = client.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ statusCode: res.statusCode, data });
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      req.write(postData);
      req.end();
    });
  }

  async sendWithRetry(url, payload, headers = {}) {
    let lastError;
    
    for (let attempt = 1; attempt <= this.config.retry.maxAttempts; attempt++) {
      try {
        const result = await this.sendRequest(url, payload, headers);
        logInfo(`Request succeeded on attempt ${attempt}`);
        return result;
      } catch (error) {
        lastError = error;
        logWarn(`Request failed on attempt ${attempt}`, { error: error.message });
        
        if (attempt < this.config.retry.maxAttempts) {
          const delay = Math.min(
            this.config.retry.baseDelay * Math.pow(this.config.retry.backoffMultiplier, attempt - 1),
            this.config.retry.maxDelay
          );
          logInfo(`Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw lastError;
  }
}

// Notification senders
class NotificationSender {
  constructor(options) {
    this.options = options;
    this.builder = new NotificationBuilder(options);
    this.httpClient = new HttpClient();
  }

  async sendSlack(webhookUrl) {
    const payload = this.builder.buildSlackPayload();
    logInfo('Sending Slack notification', { channel: 'slack' });
    
    if (this.options.dryRun) {
      logInfo('[DRY-RUN] Slack payload:', payload);
      return { success: true, channel: 'slack', dryRun: true };
    }

    try {
      await this.httpClient.sendWithRetry(webhookUrl, payload);
      return { success: true, channel: 'slack' };
    } catch (error) {
      return { success: false, channel: 'slack', error: error.message };
    }
  }

  async sendTeams(webhookUrl) {
    const payload = this.builder.buildTeamsPayload();
    logInfo('Sending Teams notification', { channel: 'teams' });
    
    if (this.options.dryRun) {
      logInfo('[DRY-RUN] Teams payload:', payload);
      return { success: true, channel: 'teams', dryRun: true };
    }

    try {
      await this.httpClient.sendWithRetry(webhookUrl, payload);
      return { success: true, channel: 'teams' };
    } catch (error) {
      return { success: false, channel: 'teams', error: error.message };
    }
  }

  async sendDiscord(webhookUrl) {
    const payload = this.builder.buildDiscordPayload();
    logInfo('Sending Discord notification', { channel: 'discord' });
    
    if (this.options.dryRun) {
      logInfo('[DRY-RUN] Discord payload:', payload);
      return { success: true, channel: 'discord', dryRun: true };
    }

    try {
      await this.httpClient.sendWithRetry(webhookUrl, payload);
      return { success: true, channel: 'discord' };
    } catch (error) {
      return { success: false, channel: 'discord', error: error.message };
    }
  }

  async sendEmail(emailConfig) {
    const payload = this.builder.buildEmailPayload();
    logInfo('Sending Email notification', { channel: 'email' });
    
    if (this.options.dryRun) {
      logInfo('[DRY-RUN] Email payload:', payload);
      return { success: true, channel: 'email', dryRun: true };
    }

    // Email implementation would require additional dependencies (nodemailer, etc.)
    // For now, we'll simulate the email sending
    logWarn('Email sending not implemented - using fallback file');
    return { success: false, channel: 'email', error: 'Email sending not implemented' };
  }

  async writeFallbackFile(result) {
    if (!DEFAULT_CONFIG.fallbackEnabled) {
      return;
    }

    try {
      // Create fallback directory
      await fs.promises.mkdir(FALLBACK_DIR, { recursive: true });

      const filename = `notification_${this.options.type}_${this.options.environment}_${Date.now()}.json`;
      const filepath = path.join(FALLBACK_DIR, filename);

      const fallbackData = {
        timestamp: this.options.timestamp,
        type: this.options.type,
        environment: this.options.environment,
        message: this.options.message,
        priority: this.options.priority,
        metadata: this.options.metadata,
        delivery_results: result,
        payloads: {
          slack: this.builder.buildSlackPayload(),
          teams: this.builder.buildTeamsPayload(),
          discord: this.builder.buildDiscordPayload(),
          email: this.builder.buildEmailPayload()
        }
      };

      await fs.promises.writeFile(filepath, JSON.stringify(fallbackData, null, 2));
      logInfo(`Notification saved to fallback file: ${filename}`);
    } catch (error) {
      logError('Failed to write fallback file', { error: error.message });
    }
  }
}

// Load webhook configuration from environment variables or CI secrets
function loadWebhookConfig() {
  return {
    slack: process.env.SLACK_WEBHOOK_URL,
    teams: process.env.TEAMS_WEBHOOK_URL,
    discord: process.env.DISCORD_WEBHOOK_URL,
    email: {
      smtp: process.env.SMTP_SERVER,
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
      to: process.env.EMAIL_TO
    }
  };
}

// Main notification function
async function sendNotifications(options) {
  logInfo('Starting notification process', {
    type: options.type,
    environment: options.environment,
    channels: options.channels,
    dryRun: options.dryRun
  });

  const webhookConfig = loadWebhookConfig();
  const sender = new NotificationSender(options);
  const results = [];

  // Send to each requested channel
  for (const channel of options.channels) {
    let result;
    
    switch (channel) {
      case 'slack':
        if (webhookConfig.slack) {
          result = await sender.sendSlack(webhookConfig.slack);
        } else {
          result = { success: false, channel: 'slack', error: 'Webhook URL not configured' };
        }
        break;
        
      case 'teams':
        if (webhookConfig.teams) {
          result = await sender.sendTeams(webhookConfig.teams);
        } else {
          result = { success: false, channel: 'teams', error: 'Webhook URL not configured' };
        }
        break;
        
      case 'discord':
        if (webhookConfig.discord) {
          result = await sender.sendDiscord(webhookConfig.discord);
        } else {
          result = { success: false, channel: 'discord', error: 'Webhook URL not configured' };
        }
        break;
        
      case 'email':
        if (webhookConfig.email.smtp) {
          result = await sender.sendEmail(webhookConfig.email);
        } else {
          result = { success: false, channel: 'email', error: 'Email configuration not found' };
        }
        break;
        
      default:
        result = { success: false, channel, error: 'Unknown channel type' };
    }
    
    results.push(result);
    
    if (result.success) {
      logInfo(`Notification sent successfully`, result);
    } else {
      logError(`Notification failed`, result);
    }
  }

  // Write fallback file for auditability
  await sender.writeFallbackFile(results);

  // Summary
  const successful = results.filter(r => r.success).length;
  const total = results.length;
  
  logInfo(`Notification process completed: ${successful}/${total} successful`, {
    results: results.map(r => ({ channel: r.channel, success: r.success, error: r.error }))
  });

  if (successful === 0) {
    logError('All notifications failed');
    process.exit(1);
  }
}

// Main execution
const options = parseArgs();

if (!options.message) {
  console.error('Error: --message is required');
  process.exit(1);
}

sendNotifications(options).catch(error => {
  logError('Notification process failed', { error: error.message, stack: error.stack });
  process.exit(1);
});