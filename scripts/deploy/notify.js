#!/usr/bin/env node
/**
 * MOBIUS Deployment - Notification CLI Tool
 * Webhook-safe notification tool for Slack and Teams
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// Configuration
const CONFIG_FILE = path.join(__dirname, '../../config/notifications.json');

// Default configuration
const DEFAULT_CONFIG = {
  slack: {
    webhooks: {
      general: process.env.SLACK_WEBHOOK_GENERAL || '',
      deployments: process.env.SLACK_WEBHOOK_DEPLOYMENTS || '',
      alerts: process.env.SLACK_WEBHOOK_ALERTS || ''
    },
    channels: {
      general: '#general',
      deployments: '#deployments',
      alerts: '#alerts'
    }
  },
  teams: {
    webhooks: {
      general: process.env.TEAMS_WEBHOOK_GENERAL || '',
      deployments: process.env.TEAMS_WEBHOOK_DEPLOYMENTS || '',
      alerts: process.env.TEAMS_WEBHOOK_ALERTS || ''
    }
  }
};

// Load configuration
function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
      return { ...DEFAULT_CONFIG, ...config };
    }
  } catch (error) {
    console.warn('Failed to load config file, using defaults:', error.message);
  }
  return DEFAULT_CONFIG;
}

// Save configuration
function saveConfig(config) {
  try {
    const configDir = path.dirname(CONFIG_FILE);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
    console.log('Configuration saved to:', CONFIG_FILE);
  } catch (error) {
    console.error('Failed to save configuration:', error.message);
    process.exit(1);
  }
}

// Make HTTP request
function makeRequest(url, data, method = 'POST') {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const postData = JSON.stringify(data);
    
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || 443,
      path: urlObj.pathname,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'User-Agent': 'MOBIUS-Notification-CLI/1.0'
      }
    };
    
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ statusCode: res.statusCode, data });
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });
    
    req.on('error', reject);
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    
    req.write(postData);
    req.end();
  });
}

// Format Slack message
function formatSlackMessage(message, options = {}) {
  const {
    env = 'unknown',
    status = 'info',
    title,
    fields = [],
    timestamp = new Date().toISOString()
  } = options;
  
  const colors = {
    success: 'good',
    warning: 'warning',
    error: 'danger',
    info: '#36a64f'
  };
  
  const emojis = {
    success: ':white_check_mark:',
    warning: ':warning:',
    error: ':x:',
    info: ':information_source:'
  };
  
  const payload = {
    username: 'MOBIUS Deploy Bot',
    icon_emoji: ':rocket:',
    attachments: [{
      color: colors[status] || colors.info,
      title: title || `MOBIUS Deployment - ${env}`,
      text: `${emojis[status] || emojis.info} ${message}`,
      footer: 'MOBIUS Deployment Framework',
      ts: Math.floor(new Date(timestamp).getTime() / 1000)
    }]
  };
  
  if (fields.length > 0) {
    payload.attachments[0].fields = fields.map(field => ({
      title: field.name,
      value: field.value,
      short: field.short !== false
    }));
  }
  
  return payload;
}

// Format Teams message
function formatTeamsMessage(message, options = {}) {
  const {
    env = 'unknown',
    status = 'info',
    title,
    fields = [],
    timestamp = new Date().toISOString()
  } = options;
  
  const colors = {
    success: '00ff00',
    warning: 'ffaa00',
    error: 'ff0000',
    info: '0078d4'
  };
  
  const payload = {
    '@type': 'MessageCard',
    '@context': 'http://schema.org/extensions',
    themeColor: colors[status] || colors.info,
    summary: title || `MOBIUS Deployment - ${env}`,
    sections: [{
      activityTitle: title || `MOBIUS Deployment - ${env}`,
      activitySubtitle: `Environment: ${env}`,
      activityImage: 'https://via.placeholder.com/32x32/0078d4/ffffff?text=M',
      text: message,
      markdown: true
    }]
  };
  
  if (fields.length > 0) {
    payload.sections[0].facts = fields.map(field => ({
      name: field.name,
      value: field.value
    }));
  }
  
  return payload;
}

// Send Slack notification
async function sendSlack(webhookUrl, message, options = {}) {
  const payload = formatSlackMessage(message, options);
  
  try {
    await makeRequest(webhookUrl, payload);
    console.log('✓ Slack notification sent successfully');
  } catch (error) {
    console.error('✗ Failed to send Slack notification:', error.message);
    throw error;
  }
}

// Send Teams notification
async function sendTeams(webhookUrl, message, options = {}) {
  const payload = formatTeamsMessage(message, options);
  
  try {
    await makeRequest(webhookUrl, payload);
    console.log('✓ Teams notification sent successfully');
  } catch (error) {
    console.error('✗ Failed to send Teams notification:', error.message);
    throw error;
  }
}

// Send notification to all configured channels
async function sendNotification(message, options = {}) {
  const config = loadConfig();
  const {
    env = 'unknown',
    channel = 'general',
    platforms = ['slack', 'teams'],
    skipMissing = true
  } = options;
  
  console.log(`Sending notification to ${platforms.join(', ')} [${channel}]`);
  console.log(`Environment: ${env}`);
  console.log(`Message: ${message}`);
  
  const results = { success: [], failed: [] };
  
  for (const platform of platforms) {
    const webhookUrl = config[platform]?.webhooks?.[channel];
    
    if (!webhookUrl) {
      const msg = `No ${platform} webhook configured for channel '${channel}'`;
      if (skipMissing) {
        console.warn(`⚠ ${msg}, skipping`);
        continue;
      } else {
        console.error(`✗ ${msg}`);
        results.failed.push(`${platform}:${channel}`);
        continue;
      }
    }
    
    try {
      if (platform === 'slack') {
        await sendSlack(webhookUrl, message, options);
      } else if (platform === 'teams') {
        await sendTeams(webhookUrl, message, options);
      }
      results.success.push(`${platform}:${channel}`);
    } catch (error) {
      console.error(`✗ Failed to send ${platform} notification:`, error.message);
      results.failed.push(`${platform}:${channel}`);
    }
  }
  
  return results;
}

// Predefined notification templates
const TEMPLATES = {
  'deploy-start': (env, version) => ({
    message: `Deployment started for version ${version}`,
    options: {
      env,
      status: 'info',
      title: 'Deployment Started',
      channel: 'deployments',
      fields: [
        { name: 'Version', value: version },
        { name: 'Environment', value: env },
        { name: 'Status', value: 'In Progress' }
      ]
    }
  }),
  
  'deploy-success': (env, version, duration) => ({
    message: `Deployment completed successfully in ${duration}`,
    options: {
      env,
      status: 'success',
      title: 'Deployment Successful',
      channel: 'deployments',
      fields: [
        { name: 'Version', value: version },
        { name: 'Environment', value: env },
        { name: 'Duration', value: duration },
        { name: 'Status', value: 'Success' }
      ]
    }
  }),
  
  'deploy-failed': (env, version, error) => ({
    message: `Deployment failed: ${error}`,
    options: {
      env,
      status: 'error',
      title: 'Deployment Failed',
      channel: 'alerts',
      fields: [
        { name: 'Version', value: version },
        { name: 'Environment', value: env },
        { name: 'Error', value: error },
        { name: 'Status', value: 'Failed' }
      ]
    }
  }),
  
  'rollback-triggered': (env, reason) => ({
    message: `Automatic rollback triggered: ${reason}`,
    options: {
      env,
      status: 'warning',
      title: 'Rollback Triggered',
      channel: 'alerts',
      fields: [
        { name: 'Environment', value: env },
        { name: 'Reason', value: reason },
        { name: 'Status', value: 'Rolling Back' }
      ]
    }
  }),
  
  'monitoring-alert': (env, metric, threshold, current) => ({
    message: `Monitoring alert: ${metric} exceeded threshold`,
    options: {
      env,
      status: 'warning',
      title: 'Monitoring Alert',
      channel: 'alerts',
      fields: [
        { name: 'Environment', value: env },
        { name: 'Metric', value: metric },
        { name: 'Threshold', value: threshold },
        { name: 'Current Value', value: current }
      ]
    }
  })
};

// CLI usage
function showUsage() {
  console.log(`
MOBIUS Notification CLI Tool

Usage:
  notify [options] <message>
  notify template <template-name> [args...]
  notify config [set|get] [key] [value]
  notify test [platform] [channel]

Options:
  --env ENV           Environment name (default: unknown)
  --channel CHANNEL   Channel name (default: general)
  --platforms LIST    Comma-separated platforms (default: slack,teams)
  --status STATUS     Message status: info|success|warning|error (default: info)
  --title TITLE       Message title
  --field NAME:VALUE  Add field (can be used multiple times)
  --skip-missing      Skip missing webhook configurations (default: true)
  --help              Show this help

Templates:
  deploy-start <env> <version>
  deploy-success <env> <version> <duration>
  deploy-failed <env> <version> <error>
  rollback-triggered <env> <reason>
  monitoring-alert <env> <metric> <threshold> <current>

Examples:
  notify "Deployment started" --env production --channel deployments --status info
  notify template deploy-success production v1.2.3 "5m 30s"
  notify config set slack.webhooks.deployments "https://hooks.slack.com/..."
  notify test slack deployments
`);
}

// Main CLI handler
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    showUsage();
    process.exit(0);
  }
  
  try {
    const command = args[0];
    
    if (command === 'config') {
      const config = loadConfig();
      const action = args[1];
      
      if (action === 'get') {
        const key = args[2];
        if (key) {
          const value = key.split('.').reduce((obj, k) => obj?.[k], config);
          console.log(JSON.stringify(value, null, 2));
        } else {
          console.log(JSON.stringify(config, null, 2));
        }
      } else if (action === 'set') {
        const key = args[2];
        const value = args[3];
        if (!key || !value) {
          console.error('Usage: notify config set <key> <value>');
          process.exit(1);
        }
        
        const keys = key.split('.');
        let obj = config;
        for (let i = 0; i < keys.length - 1; i++) {
          obj[keys[i]] = obj[keys[i]] || {};
          obj = obj[keys[i]];
        }
        obj[keys[keys.length - 1]] = value;
        
        saveConfig(config);
      } else {
        console.error('Usage: notify config [get|set] [key] [value]');
        process.exit(1);
      }
      return;
    }
    
    if (command === 'test') {
      const platform = args[1] || 'slack';
      const channel = args[2] || 'general';
      
      const message = 'Test notification from MOBIUS CLI';
      const options = {
        env: 'test',
        status: 'info',
        title: 'Test Notification',
        channel: channel,
        platforms: [platform],
        skipMissing: false
      };
      
      const results = await sendNotification(message, options);
      
      if (results.failed.length > 0) {
        console.error('Some notifications failed:', results.failed);
        process.exit(1);
      } else {
        console.log('✓ Test notification sent successfully');
      }
      return;
    }
    
    if (command === 'template') {
      const templateName = args[1];
      const templateArgs = args.slice(2);
      
      if (!TEMPLATES[templateName]) {
        console.error(`Unknown template: ${templateName}`);
        console.error('Available templates:', Object.keys(TEMPLATES).join(', '));
        process.exit(1);
      }
      
      const { message, options } = TEMPLATES[templateName](...templateArgs);
      const results = await sendNotification(message, options);
      
      if (results.failed.length > 0) {
        console.error('Some notifications failed:', results.failed);
        process.exit(1);
      }
      return;
    }
    
    // Regular message notification
    let message = '';
    const options = {
      env: 'unknown',
      channel: 'general',
      platforms: ['slack', 'teams'],
      status: 'info',
      fields: [],
      skipMissing: true
    };
    
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      
      if (arg === '--env') {
        options.env = args[++i];
      } else if (arg === '--channel') {
        options.channel = args[++i];
      } else if (arg === '--platforms') {
        options.platforms = args[++i].split(',').map(p => p.trim());
      } else if (arg === '--status') {
        options.status = args[++i];
      } else if (arg === '--title') {
        options.title = args[++i];
      } else if (arg === '--field') {
        const fieldValue = args[++i];
        const [name, ...valueParts] = fieldValue.split(':');
        options.fields.push({ name, value: valueParts.join(':') });
      } else if (arg === '--skip-missing') {
        options.skipMissing = true;
      } else if (!arg.startsWith('--')) {
        message = arg;
      }
    }
    
    if (!message) {
      console.error('Message is required');
      process.exit(1);
    }
    
    const results = await sendNotification(message, options);
    
    if (results.failed.length > 0) {
      console.error('Some notifications failed:', results.failed);
      process.exit(1);
    }
    
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

// Run CLI
if (require.main === module) {
  main().catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}

module.exports = {
  sendNotification,
  sendSlack,
  sendTeams,
  TEMPLATES
};