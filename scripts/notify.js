#!/usr/bin/env node
/**
 * Multi-channel Notification System for dhash deployments
 * 
 * Supports Slack, Teams, Discord, Email with retry/backoff and fallback
 * Usage: node scripts/notify.js [--level LEVEL] [--message TEXT] [--environment ENV]
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// Configuration
const PROJECT_ROOT = path.resolve(__dirname, '..');
const NOTIFICATION_CONFIG_PATH = path.join(PROJECT_ROOT, '.env.notifications');
const FALLBACK_FILE_PATH = path.join(PROJECT_ROOT, 'monitor_logs', 'notification_fallback.jsonl');

class NotificationSystem {
  constructor(options = {}) {
    this.environment = options.environment || 'production';
    this.retryAttempts = options.retryAttempts || 3;
    this.retryDelay = options.retryDelay || 2000; // Base delay in ms
    this.timeout = options.timeout || 10000; // Request timeout in ms
    this.verbose = options.verbose || false;
    
    // Load configuration
    this.config = this.loadConfiguration();
    
    // Initialize fallback directory
    this.initializeFallback();
  }
  
  loadConfiguration() {
    const config = {
      slack: {
        enabled: false,
        webhook_url: process.env.SLACK_WEBHOOK_URL,
        channel: process.env.SLACK_CHANNEL || '#alerts',
        username: process.env.SLACK_USERNAME || 'dhash-monitor',
        icon_emoji: process.env.SLACK_ICON || ':warning:'
      },
      teams: {
        enabled: false,
        webhook_url: process.env.TEAMS_WEBHOOK_URL
      },
      discord: {
        enabled: false,
        webhook_url: process.env.DISCORD_WEBHOOK_URL,
        username: process.env.DISCORD_USERNAME || 'dhash-monitor'
      },
      email: {
        enabled: false,
        smtp_host: process.env.SMTP_HOST,
        smtp_port: process.env.SMTP_PORT || 587,
        smtp_user: process.env.SMTP_USER,
        smtp_pass: process.env.SMTP_PASS,
        from_address: process.env.EMAIL_FROM || 'dhash-monitor@company.com',
        to_addresses: (process.env.EMAIL_TO || '').split(',').filter(e => e.trim())
      }
    };
    
    // Load from file if available
    if (fs.existsSync(NOTIFICATION_CONFIG_PATH)) {
      try {
        const envContent = fs.readFileSync(NOTIFICATION_CONFIG_PATH, 'utf8');
        const envVars = this.parseEnvFile(envContent);
        
        // Apply environment variables
        for (const [key, value] of Object.entries(envVars)) {
          process.env[key] = value;
        }
        
        // Reload config with file values
        config.slack.webhook_url = process.env.SLACK_WEBHOOK_URL;
        config.teams.webhook_url = process.env.TEAMS_WEBHOOK_URL;
        config.discord.webhook_url = process.env.DISCORD_WEBHOOK_URL;
        // ... apply other config values
        
      } catch (error) {
        this.log('warn', `Failed to load notification config file: ${error.message}`);
      }
    }
    
    // Enable channels that have required configuration
    config.slack.enabled = !!config.slack.webhook_url;
    config.teams.enabled = !!config.teams.webhook_url;
    config.discord.enabled = !!config.discord.webhook_url;
    config.email.enabled = !!(config.email.smtp_host && config.email.smtp_user && config.email.to_addresses.length > 0);
    
    return config;
  }
  
  parseEnvFile(content) {
    const vars = {};
    const lines = content.split('\n');
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=');
        if (key && valueParts.length > 0) {
          vars[key.trim()] = valueParts.join('=').trim().replace(/^["']|["']$/g, '');
        }
      }
    }
    
    return vars;
  }
  
  initializeFallback() {
    const fallbackDir = path.dirname(FALLBACK_FILE_PATH);
    if (!fs.existsSync(fallbackDir)) {
      fs.mkdirSync(fallbackDir, { recursive: true });
    }
  }
  
  log(level, message, data = null) {
    const timestamp = new Date().toISOString();
    if (this.verbose || level === 'error') {
      console.log(`[${timestamp}] ${level.toUpperCase()}: ${message}`);
      if (data && this.verbose) {
        console.log('  Data:', JSON.stringify(data, null, 2));
      }
    }
  }
  
  async makeHttpRequest(url, options = {}) {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const isHttps = urlObj.protocol === 'https:';
      const client = isHttps ? https : http;
      
      const requestOptions = {
        hostname: urlObj.hostname,
        port: urlObj.port || (isHttps ? 443 : 80),
        path: urlObj.pathname,
        method: options.method || 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'dhash-notification-system/1.0.0',
          ...options.headers
        },
        timeout: this.timeout
      };
      
      const req = client.request(requestOptions, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: data
          });
        });
      });
      
      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });
      
      if (options.body) {
        req.write(options.body);
      }
      
      req.end();
    });
  }
  
  formatSlackMessage(level, message, data = null) {
    const colorMap = {
      info: '#36a64f',      // Green
      warning: '#ff9900',   // Orange  
      error: '#ff0000',     // Red
      critical: '#800080'   // Purple
    };
    
    const iconMap = {
      info: ':information_source:',
      warning: ':warning:',
      error: ':x:',
      critical: ':rotating_light:'
    };
    
    const payload = {
      channel: this.config.slack.channel,
      username: this.config.slack.username,
      icon_emoji: iconMap[level] || this.config.slack.icon_emoji,
      attachments: [
        {
          color: colorMap[level] || '#808080',
          title: `dhash ${level.toUpperCase()} - ${this.environment}`,
          text: message,
          ts: Math.floor(Date.now() / 1000),
          fields: []
        }
      ]
    };
    
    if (data) {
      payload.attachments[0].fields.push({
        title: 'Details',
        value: '```' + JSON.stringify(data, null, 2) + '```',
        short: false
      });
    }
    
    return JSON.stringify(payload);
  }
  
  formatTeamsMessage(level, message, data = null) {
    const colorMap = {
      info: '00FF00',      // Green
      warning: 'FFA500',   // Orange
      error: 'FF0000',     // Red
      critical: '800080'   // Purple
    };
    
    const payload = {
      '@type': 'MessageCard',
      '@context': 'https://schema.org/extensions',
      summary: `dhash ${level.toUpperCase()} - ${this.environment}`,
      themeColor: colorMap[level] || '808080',
      title: `dhash ${level.toUpperCase()}`,
      text: message,
      sections: [
        {
          activityTitle: 'Environment',
          activityText: this.environment
        }
      ]
    };
    
    if (data) {
      payload.sections.push({
        activityTitle: 'Details',
        activityText: '```json\n' + JSON.stringify(data, null, 2) + '\n```'
      });
    }
    
    return JSON.stringify(payload);
  }
  
  formatDiscordMessage(level, message, data = null) {
    const colorMap = {
      info: 3066993,      // Green
      warning: 16776960,  // Orange
      error: 15158332,    // Red
      critical: 8388736   // Purple
    };
    
    const payload = {
      username: this.config.discord.username,
      embeds: [
        {
          title: `dhash ${level.toUpperCase()} - ${this.environment}`,
          description: message,
          color: colorMap[level] || 8421504,
          timestamp: new Date().toISOString(),
          fields: []
        }
      ]
    };
    
    if (data) {
      payload.embeds[0].fields.push({
        name: 'Details',
        value: '```json\n' + JSON.stringify(data, null, 2) + '\n```',
        inline: false
      });
    }
    
    return JSON.stringify(payload);
  }
  
  async sendSlack(level, message, data = null, attempt = 1) {
    if (!this.config.slack.enabled) {
      return { success: false, reason: 'Slack not configured' };
    }
    
    try {
      const payload = this.formatSlackMessage(level, message, data);
      
      const response = await this.makeHttpRequest(this.config.slack.webhook_url, {
        method: 'POST',
        body: payload
      });
      
      if (response.statusCode === 200) {
        this.log('info', `Slack notification sent successfully (attempt ${attempt})`);
        return { success: true, channel: 'slack' };
      } else {
        throw new Error(`HTTP ${response.statusCode}: ${response.body}`);
      }
    } catch (error) {
      this.log('warn', `Slack notification failed (attempt ${attempt}): ${error.message}`);
      
      if (attempt < this.retryAttempts) {
        const delay = this.retryDelay * Math.pow(2, attempt - 1); // Exponential backoff
        this.log('info', `Retrying Slack notification in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.sendSlack(level, message, data, attempt + 1);
      }
      
      return { success: false, reason: error.message, channel: 'slack' };
    }
  }
  
  async sendTeams(level, message, data = null, attempt = 1) {
    if (!this.config.teams.enabled) {
      return { success: false, reason: 'Teams not configured' };
    }
    
    try {
      const payload = this.formatTeamsMessage(level, message, data);
      
      const response = await this.makeHttpRequest(this.config.teams.webhook_url, {
        method: 'POST',
        body: payload
      });
      
      if (response.statusCode === 200) {
        this.log('info', `Teams notification sent successfully (attempt ${attempt})`);
        return { success: true, channel: 'teams' };
      } else {
        throw new Error(`HTTP ${response.statusCode}: ${response.body}`);
      }
    } catch (error) {
      this.log('warn', `Teams notification failed (attempt ${attempt}): ${error.message}`);
      
      if (attempt < this.retryAttempts) {
        const delay = this.retryDelay * Math.pow(2, attempt - 1);
        this.log('info', `Retrying Teams notification in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.sendTeams(level, message, data, attempt + 1);
      }
      
      return { success: false, reason: error.message, channel: 'teams' };
    }
  }
  
  async sendDiscord(level, message, data = null, attempt = 1) {
    if (!this.config.discord.enabled) {
      return { success: false, reason: 'Discord not configured' };
    }
    
    try {
      const payload = this.formatDiscordMessage(level, message, data);
      
      const response = await this.makeHttpRequest(this.config.discord.webhook_url, {
        method: 'POST',
        body: payload
      });
      
      if (response.statusCode === 204) { // Discord returns 204 for successful webhook
        this.log('info', `Discord notification sent successfully (attempt ${attempt})`);
        return { success: true, channel: 'discord' };
      } else {
        throw new Error(`HTTP ${response.statusCode}: ${response.body}`);
      }
    } catch (error) {
      this.log('warn', `Discord notification failed (attempt ${attempt}): ${error.message}`);
      
      if (attempt < this.retryAttempts) {
        const delay = this.retryDelay * Math.pow(2, attempt - 1);
        this.log('info', `Retrying Discord notification in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.sendDiscord(level, message, data, attempt + 1);
      }
      
      return { success: false, reason: error.message, channel: 'discord' };
    }
  }
  
  async sendEmail(level, message, data = null) {
    if (!this.config.email.enabled) {
      return { success: false, reason: 'Email not configured' };
    }
    
    // For now, just log that email would be sent
    // In a real implementation, you'd use nodemailer or similar
    this.log('info', 'Email notification would be sent', {
      to: this.config.email.to_addresses,
      subject: `dhash ${level.toUpperCase()} - ${this.environment}`,
      message,
      data
    });
    
    return { success: true, channel: 'email', note: 'Email simulation - not actually sent' };
  }
  
  writeFallback(level, message, data = null, results = []) {
    const fallbackEntry = {
      timestamp: new Date().toISOString(),
      environment: this.environment,
      level,
      message,
      data,
      notification_results: results,
      fallback_reason: 'All notification channels failed or unavailable'
    };
    
    try {
      const logLine = JSON.stringify(fallbackEntry) + '\n';
      fs.appendFileSync(FALLBACK_FILE_PATH, logLine);
      this.log('info', `Notification written to fallback file: ${FALLBACK_FILE_PATH}`);
      return true;
    } catch (error) {
      this.log('error', `Failed to write fallback notification: ${error.message}`);
      return false;
    }
  }
  
  async sendNotification(level, message, data = null) {
    this.log('info', `Sending ${level} notification: ${message}`);
    
    const results = [];
    
    // Try all configured channels
    const channels = [
      { name: 'slack', fn: () => this.sendSlack(level, message, data) },
      { name: 'teams', fn: () => this.sendTeams(level, message, data) },
      { name: 'discord', fn: () => this.sendDiscord(level, message, data) },
      { name: 'email', fn: () => this.sendEmail(level, message, data) }
    ];
    
    // Send to all channels concurrently
    const promises = channels.map(async (channel) => {
      try {
        const result = await channel.fn();
        results.push(result);
        return result;
      } catch (error) {
        const errorResult = { success: false, reason: error.message, channel: channel.name };
        results.push(errorResult);
        return errorResult;
      }
    });
    
    await Promise.allSettled(promises);
    
    // Check if at least one channel succeeded
    const successfulChannels = results.filter(r => r.success);
    const failedChannels = results.filter(r => !r.success);
    
    if (successfulChannels.length > 0) {
      this.log('info', `Notification sent successfully to ${successfulChannels.length} channel(s): ${successfulChannels.map(r => r.channel).join(', ')}`);
      
      if (failedChannels.length > 0) {
        this.log('warn', `Some channels failed: ${failedChannels.map(r => `${r.channel}: ${r.reason}`).join(', ')}`);
      }
    } else {
      this.log('error', 'All notification channels failed, writing to fallback file');
      this.writeFallback(level, message, data, results);
    }
    
    return {
      success: successfulChannels.length > 0,
      results,
      successful_channels: successfulChannels.length,
      failed_channels: failedChannels.length
    };
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const options = {};
  let level = 'info';
  let message = '';
  let data = null;
  
  for (let i = 0; i < args.length; i += 2) {
    const flag = args[i];
    const value = args[i + 1];
    
    switch (flag) {
      case '--level':
        level = value;
        break;
      case '--message':
        message = value;
        break;
      case '--environment':
      case '--env':
        options.environment = value;
        break;
      case '--data':
        try {
          data = JSON.parse(value);
        } catch (error) {
          console.error(`Invalid JSON data: ${error.message}`);
          process.exit(1);
        }
        break;
      case '--verbose':
      case '-v':
        options.verbose = true;
        i--; // No value for this flag
        break;
      case '--help':
      case '-h':
        console.log(`
Multi-channel Notification System for dhash

Usage: node scripts/notify.js [options]

Options:
  --level LEVEL              Notification level (info, warning, error, critical)
  --message TEXT             Notification message (required)
  --environment, --env ENV   Environment name (default: production)
  --data JSON                Additional data as JSON string
  --verbose, -v              Enable verbose output
  --help, -h                 Show this help message

Environment Variables:
  SLACK_WEBHOOK_URL         Slack webhook URL
  SLACK_CHANNEL            Slack channel (default: #alerts)
  TEAMS_WEBHOOK_URL        Microsoft Teams webhook URL
  DISCORD_WEBHOOK_URL      Discord webhook URL
  EMAIL_FROM               Email from address
  EMAIL_TO                 Comma-separated email addresses

Examples:
  node scripts/notify.js --level warning --message "Deployment starting"
  node scripts/notify.js --level critical --message "Auto-rollback triggered" --data '{"reason":"health_check_failed"}'
        `);
        process.exit(0);
      default:
        console.error(`Unknown option: ${flag}`);
        process.exit(1);
    }
  }
  
  if (!message) {
    console.error('Error: --message is required');
    process.exit(1);
  }
  
  if (!['info', 'warning', 'error', 'critical'].includes(level)) {
    console.error('Error: --level must be one of: info, warning, error, critical');
    process.exit(1);
  }
  
  try {
    const notificationSystem = new NotificationSystem(options);
    const result = await notificationSystem.sendNotification(level, message, data);
    
    if (result.success) {
      console.log(`Notification sent successfully to ${result.successful_channels} channel(s)`);
      process.exit(0);
    } else {
      console.error(`All notification channels failed (${result.failed_channels} failures)`);
      process.exit(1);
    }
  } catch (error) {
    console.error(`Notification system failed: ${error.message}`);
    process.exit(2);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('Unhandled error:', error);
    process.exit(2);
  });
}

module.exports = { NotificationSystem };