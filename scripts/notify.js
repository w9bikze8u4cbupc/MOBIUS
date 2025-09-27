#!/usr/bin/env node
/**
 * notify.js - Zero-dependency multi-channel notification system
 * 
 * Supports Slack, Teams, Discord, Email with exponential backoff, jitter, 
 * and file-based fallback for auditability.
 * 
 * Usage: node scripts/notify.js --type deployment --severity high --message "Test message" [options]
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

// Configuration and defaults
const DEFAULT_CONFIG = {
  maxRetries: 3,
  baseDelay: 1000, // 1 second
  maxDelay: 30000, // 30 seconds
  jitterFactor: 0.1,
  timeout: 10000, // 10 seconds
  fallbackDir: 'deploy_logs/notifications',
  templatesDir: 'templates/notifications'
};

// Notification state
let notificationId = null;
let config = { ...DEFAULT_CONFIG };
let deliveryLog = [];

// Utility functions
function generateId() {
  return `notify_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function log(level, message, data = null) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    level: level.toUpperCase(),
    message,
    data,
    notification_id: notificationId
  };
  
  const logLine = `[${timestamp}] [${level.toUpperCase()}] [${notificationId}] ${message}${data ? ' | ' + JSON.stringify(data) : ''}`;
  console.log(logLine);
  
  // Store in delivery log
  deliveryLog.push(logEntry);
}

function logInfo(message, data = null) {
  log('info', message, data);
}

function logWarn(message, data = null) {
  log('warn', message, data);
}

function logError(message, data = null) {
  log('error', message, data);
}

function logSuccess(message, data = null) {
  log('success', message, data);
}

// Exponential backoff with jitter
function calculateDelay(attempt) {
  const exponentialDelay = config.baseDelay * Math.pow(2, attempt);
  const jitter = exponentialDelay * config.jitterFactor * Math.random();
  const totalDelay = Math.min(exponentialDelay + jitter, config.maxDelay);
  
  return Math.floor(totalDelay);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// HTTP request utility with retry
async function httpRequest(options, data = null, attempt = 0) {
  return new Promise((resolve, reject) => {
    const isHttps = options.protocol === 'https:' || options.port === 443;
    const client = isHttps ? https : http;
    
    const req = client.request(options, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        const result = {
          statusCode: res.statusCode,
          headers: res.headers,
          body: responseData
        };
        
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(result);
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${responseData}`));
        }
      });
    });
    
    req.on('error', (err) => {
      reject(err);
    });
    
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    
    req.setTimeout(config.timeout);
    
    if (data) {
      req.write(data);
    }
    
    req.end();
  });
}

// Retry wrapper with exponential backoff
async function httpRequestWithRetry(options, data = null) {
  let lastError = null;
  
  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      logInfo(`HTTP request attempt ${attempt + 1}/${config.maxRetries + 1}`, { url: `${options.protocol}//${options.hostname}${options.path}` });
      
      const response = await httpRequest(options, data, attempt);
      
      logSuccess(`HTTP request successful on attempt ${attempt + 1}`, { 
        statusCode: response.statusCode,
        url: `${options.protocol}//${options.hostname}${options.path}`
      });
      
      return response;
      
    } catch (err) {
      lastError = err;
      logWarn(`HTTP request failed on attempt ${attempt + 1}: ${err.message}`);
      
      if (attempt < config.maxRetries) {
        const delay = calculateDelay(attempt);
        logInfo(`Retrying in ${delay}ms...`);
        await sleep(delay);
      }
    }
  }
  
  throw lastError;
}

// File fallback system
async function writeFallbackNotification(channel, message, metadata = {}) {
  try {
    // Ensure fallback directory exists
    if (!fs.existsSync(config.fallbackDir)) {
      fs.mkdirSync(config.fallbackDir, { recursive: true });
    }
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${channel}_${timestamp}_${notificationId}.json`;
    const filepath = path.join(config.fallbackDir, filename);
    
    const fallbackData = {
      notification_id: notificationId,
      timestamp: new Date().toISOString(),
      channel,
      message,
      metadata,
      delivery_attempts: deliveryLog.filter(log => log.level === 'WARN' || log.level === 'ERROR').length,
      reason: 'delivery_failed'
    };
    
    fs.writeFileSync(filepath, JSON.stringify(fallbackData, null, 2));
    logInfo(`Fallback notification written to: ${filename}`);
    
    return filepath;
    
  } catch (err) {
    logError(`Failed to write fallback notification: ${err.message}`);
    throw err;
  }
}

// Template loading and processing
function loadTemplate(templateName, type = 'default') {
  const templateFile = path.join(config.templatesDir, `${templateName}_${type}.json`);
  
  if (fs.existsSync(templateFile)) {
    try {
      const template = JSON.parse(fs.readFileSync(templateFile, 'utf8'));
      logInfo(`Loaded template: ${templateName}_${type}`);
      return template;
    } catch (err) {
      logWarn(`Failed to parse template ${templateFile}: ${err.message}`);
    }
  }
  
  // Return default template if specific template not found
  return getDefaultTemplate(templateName, type);
}

function getDefaultTemplate(templateName, type) {
  const templates = {
    deployment: {
      default: {
        title: 'DHhash Deployment {{status}}',
        color: '{{color}}',
        fields: [
          { name: 'Environment', value: '{{environment}}', inline: true },
          { name: 'Status', value: '{{status}}', inline: true },
          { name: 'Timestamp', value: '{{timestamp}}', inline: true },
          { name: 'Message', value: '{{message}}', inline: false }
        ]
      }
    },
    monitoring: {
      default: {
        title: 'DHhash Monitoring Alert',
        color: '#ff6b35',
        fields: [
          { name: 'Environment', value: '{{environment}}', inline: true },
          { name: 'Severity', value: '{{severity}}', inline: true },
          { name: 'Alert Time', value: '{{timestamp}}', inline: true },
          { name: 'Details', value: '{{message}}', inline: false }
        ]
      }
    },
    quality_gate_violation: {
      default: {
        title: '🚨 Quality Gate Violation',
        color: '#d63031',
        fields: [
          { name: 'Environment', value: '{{environment}}', inline: true },
          { name: 'Severity', value: '{{severity}}', inline: true },
          { name: 'Time', value: '{{timestamp}}', inline: true },
          { name: 'Violations', value: '{{message}}', inline: false },
          { name: 'Action Required', value: '{{action}}', inline: false }
        ]
      }
    },
    rollback: {
      default: {
        title: '⚡ Automatic Rollback Triggered',
        color: '#e17055',
        fields: [
          { name: 'Environment', value: '{{environment}}', inline: true },
          { name: 'Reason', value: '{{reason}}', inline: true },
          { name: 'Time', value: '{{timestamp}}', inline: true },
          { name: 'Backup Used', value: '{{backup_file}}', inline: false },
          { name: 'Status', value: '{{status}}', inline: false }
        ]
      }
    }
  };
  
  return templates[templateName]?.[type] || templates.deployment.default;
}

function processTemplate(template, variables) {
  const processValue = (value) => {
    if (typeof value === 'string') {
      return value.replace(/\{\{(\w+)\}\}/g, (match, key) => {
        return variables[key] || match;
      });
    } else if (Array.isArray(value)) {
      return value.map(processValue);
    } else if (typeof value === 'object' && value !== null) {
      const processed = {};
      Object.keys(value).forEach(key => {
        processed[key] = processValue(value[key]);
      });
      return processed;
    }
    return value;
  };
  
  return processValue(template);
}

// Channel-specific implementations
class SlackNotifier {
  constructor(webhookUrl) {
    this.webhookUrl = webhookUrl;
  }
  
  async send(message, template, variables) {
    try {
      const processedTemplate = processTemplate(template, variables);
      const url = new URL(this.webhookUrl);
      
      const slackPayload = {
        text: processedTemplate.title,
        attachments: [{
          color: processedTemplate.color || '#36a64f',
          fields: processedTemplate.fields || [{ title: 'Message', value: message, short: false }],
          footer: 'DHhash Deployment System',
          ts: Math.floor(Date.now() / 1000)
        }]
      };
      
      const options = {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'DHhash-Notifier/1.0'
        }
      };
      
      const response = await httpRequestWithRetry(options, JSON.stringify(slackPayload));
      logSuccess('Slack notification delivered successfully');
      return { success: true, response };
      
    } catch (err) {
      logError(`Slack notification failed: ${err.message}`);
      throw err;
    }
  }
}

class TeamsNotifier {
  constructor(webhookUrl) {
    this.webhookUrl = webhookUrl;
  }
  
  async send(message, template, variables) {
    try {
      const processedTemplate = processTemplate(template, variables);
      const url = new URL(this.webhookUrl);
      
      const teamsPayload = {
        '@type': 'MessageCard',
        '@context': 'https://schema.org/extensions',
        summary: processedTemplate.title,
        themeColor: processedTemplate.color || '00FF00',
        sections: [{
          activityTitle: processedTemplate.title,
          activitySubtitle: `Environment: ${variables.environment || 'unknown'}`,
          facts: processedTemplate.fields?.map(field => ({
            name: field.name,
            value: field.value
          })) || [{ name: 'Message', value: message }]
        }]
      };
      
      const options = {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'DHhash-Notifier/1.0'
        }
      };
      
      const response = await httpRequestWithRetry(options, JSON.stringify(teamsPayload));
      logSuccess('Teams notification delivered successfully');
      return { success: true, response };
      
    } catch (err) {
      logError(`Teams notification failed: ${err.message}`);
      throw err;
    }
  }
}

class DiscordNotifier {
  constructor(webhookUrl) {
    this.webhookUrl = webhookUrl;
  }
  
  async send(message, template, variables) {
    try {
      const processedTemplate = processTemplate(template, variables);
      const url = new URL(this.webhookUrl);
      
      const discordPayload = {
        content: processedTemplate.title,
        embeds: [{
          title: processedTemplate.title,
          description: message,
          color: parseInt(processedTemplate.color?.replace('#', '') || '36a64f', 16),
          fields: processedTemplate.fields || [],
          footer: {
            text: 'DHhash Deployment System'
          },
          timestamp: new Date().toISOString()
        }]
      };
      
      const options = {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'DHhash-Notifier/1.0'
        }
      };
      
      const response = await httpRequestWithRetry(options, JSON.stringify(discordPayload));
      logSuccess('Discord notification delivered successfully');
      return { success: true, response };
      
    } catch (err) {
      logError(`Discord notification failed: ${err.message}`);
      throw err;
    }
  }
}

class EmailNotifier {
  constructor(smtpConfig) {
    this.config = smtpConfig;
  }
  
  async send(message, template, variables) {
    try {
      const processedTemplate = processTemplate(template, variables);
      
      // Simple SMTP implementation for basic email sending
      // In production, you might want to use a proper SMTP library
      const emailContent = `Subject: ${processedTemplate.title}
From: ${this.config.from}
To: ${this.config.to}
Content-Type: text/html

<html>
<head><title>${processedTemplate.title}</title></head>
<body>
<h2>${processedTemplate.title}</h2>
<table border="1" style="border-collapse: collapse;">
${processedTemplate.fields?.map(field => 
  `<tr><td><strong>${field.name}</strong></td><td>${field.value}</td></tr>`
).join('') || `<tr><td>Message</td><td>${message}</td></tr>`}
</table>
<p><em>Sent by DHhash Deployment System at ${new Date().toISOString()}</em></p>
</body>
</html>
`;
      
      // For now, write email to file as fallback since SMTP implementation would require external dependencies
      const emailFile = await writeFallbackNotification('email', message, {
        template: processedTemplate,
        variables,
        email_content: emailContent,
        smtp_config: { ...this.config, password: '[REDACTED]' }
      });
      
      logWarn('Email sent to fallback file (SMTP not implemented)', { file: emailFile });
      return { success: true, fallback: true, file: emailFile };
      
    } catch (err) {
      logError(`Email notification failed: ${err.message}`);
      throw err;
    }
  }
}

// File notifier (always succeeds)
class FileNotifier {
  async send(message, template, variables) {
    try {
      const processedTemplate = processTemplate(template, variables);
      const file = await writeFallbackNotification('file', message, {
        template: processedTemplate,
        variables
      });
      
      logSuccess(`File notification written: ${path.basename(file)}`);
      return { success: true, file };
      
    } catch (err) {
      logError(`File notification failed: ${err.message}`);
      throw err;
    }
  }
}

// Main notification orchestrator
async function sendNotification(options) {
  const {
    type = 'deployment',
    message = 'No message provided',
    severity = 'info',
    environment = 'unknown',
    channels = ['file'],
    data = {}
  } = options;
  
  notificationId = generateId();
  logInfo('Starting notification delivery', { type, severity, environment, channels });
  
  // Load template
  const template = loadTemplate(type, severity);
  
  // Prepare template variables
  const variables = {
    message,
    severity,
    environment,
    timestamp: new Date().toISOString(),
    notification_id: notificationId,
    status: data.status || 'unknown',
    color: getColorForSeverity(severity),
    action: data.action || 'Review and take appropriate action',
    reason: data.reason || 'Unknown',
    backup_file: data.backup_file || 'N/A',
    ...data
  };
  
  const results = {
    notification_id: notificationId,
    success: true,
    channels_attempted: channels,
    channels_succeeded: [],
    channels_failed: [],
    fallback_files: []
  };
  
  // Send to each channel
  for (const channel of channels) {
    try {
      logInfo(`Attempting to send to channel: ${channel}`);
      
      const result = await sendToChannel(channel, message, template, variables);
      
      results.channels_succeeded.push(channel);
      
      if (result.fallback) {
        results.fallback_files.push(result.file);
      }
      
    } catch (err) {
      logError(`Failed to send to channel ${channel}: ${err.message}`);
      results.channels_failed.push({ channel, error: err.message });
      
      try {
        // Create fallback file for failed channel
        const fallbackFile = await writeFallbackNotification(channel, message, {
          template,
          variables,
          error: err.message
        });
        results.fallback_files.push(fallbackFile);
      } catch (fallbackErr) {
        logError(`Failed to create fallback for ${channel}: ${fallbackErr.message}`);
      }
    }
  }
  
  // Check if any channel succeeded
  if (results.channels_succeeded.length === 0) {
    results.success = false;
    logError('All notification channels failed');
  } else {
    logSuccess(`Notification delivered to ${results.channels_succeeded.length}/${channels.length} channels`);
  }
  
  // Save delivery log
  await saveDeliveryLog(results);
  
  return results;
}

async function sendToChannel(channel, message, template, variables) {
  const webhookUrls = {
    slack: process.env.SLACK_WEBHOOK_URL,
    teams: process.env.TEAMS_WEBHOOK_URL,
    discord: process.env.DISCORD_WEBHOOK_URL
  };
  
  const emailConfig = {
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT || 587,
    user: process.env.SMTP_USER,
    password: process.env.SMTP_PASSWORD,
    from: process.env.SMTP_FROM,
    to: process.env.SMTP_TO
  };
  
  switch (channel.toLowerCase()) {
    case 'slack':
      if (!webhookUrls.slack) {
        throw new Error('SLACK_WEBHOOK_URL environment variable not set');
      }
      const slack = new SlackNotifier(webhookUrls.slack);
      return await slack.send(message, template, variables);
      
    case 'teams':
      if (!webhookUrls.teams) {
        throw new Error('TEAMS_WEBHOOK_URL environment variable not set');
      }
      const teams = new TeamsNotifier(webhookUrls.teams);
      return await teams.send(message, template, variables);
      
    case 'discord':
      if (!webhookUrls.discord) {
        throw new Error('DISCORD_WEBHOOK_URL environment variable not set');
      }
      const discord = new DiscordNotifier(webhookUrls.discord);
      return await discord.send(message, template, variables);
      
    case 'email':
      if (!emailConfig.host || !emailConfig.from || !emailConfig.to) {
        logWarn('Email configuration incomplete, using file fallback');
      }
      const email = new EmailNotifier(emailConfig);
      return await email.send(message, template, variables);
      
    case 'file':
      const fileNotifier = new FileNotifier();
      return await fileNotifier.send(message, template, variables);
      
    default:
      throw new Error(`Unsupported notification channel: ${channel}`);
  }
}

function getColorForSeverity(severity) {
  const colors = {
    critical: '#d63031',
    high: '#e17055',
    medium: '#fdcb6e',
    low: '#00b894',
    info: '#0984e3',
    success: '#00b894'
  };
  
  return colors[severity.toLowerCase()] || colors.info;
}

async function saveDeliveryLog(results) {
  try {
    if (!fs.existsSync(config.fallbackDir)) {
      fs.mkdirSync(config.fallbackDir, { recursive: true });
    }
    
    const logFile = path.join(config.fallbackDir, 'delivery_log.jsonl');
    const logEntry = {
      ...results,
      delivery_log: deliveryLog,
      timestamp: new Date().toISOString()
    };
    
    fs.appendFileSync(logFile, JSON.stringify(logEntry) + '\n');
    logInfo(`Delivery log saved: ${path.basename(logFile)}`);
    
  } catch (err) {
    logError(`Failed to save delivery log: ${err.message}`);
  }
}

// Command line interface
function parseArguments() {
  const args = process.argv.slice(2);
  const options = {
    channels: ['file']
  };
  
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i];
    const value = args[i + 1];
    
    switch (key) {
      case '--type':
        options.type = value;
        break;
      case '--message':
        options.message = value;
        break;
      case '--severity':
        options.severity = value;
        break;
      case '--env':
      case '--environment':
        options.environment = value;
        break;
      case '--channels':
        options.channels = value.split(',').map(c => c.trim());
        break;
      case '--data':
        try {
          options.data = JSON.parse(value);
        } catch (err) {
          console.error(`Invalid JSON data: ${err.message}`);
          process.exit(1);
        }
        break;
      case '--config':
        try {
          const configData = JSON.parse(fs.readFileSync(value, 'utf8'));
          Object.assign(config, configData);
        } catch (err) {
          console.error(`Failed to load config: ${err.message}`);
          process.exit(1);
        }
        break;
      case '--help':
        showUsage();
        process.exit(0);
        break;
      default:
        if (key.startsWith('--')) {
          console.error(`Unknown option: ${key}`);
          showUsage();
          process.exit(1);
        }
    }
  }
  
  return options;
}

function showUsage() {
  console.log(`
Usage: node notify.js [OPTIONS]

Send multi-channel notifications with retry and fallback support.

Options:
  --type TYPE              Notification type (deployment, monitoring, quality_gate_violation, rollback)
  --message MESSAGE        Notification message
  --severity LEVEL         Severity level (critical, high, medium, low, info, success)
  --env ENVIRONMENT        Environment name
  --channels CHANNELS      Comma-separated list of channels (slack,teams,discord,email,file)
  --data JSON              Additional data as JSON string
  --config FILE            Configuration file path
  --help                   Show this help message

Environment Variables (for webhooks):
  SLACK_WEBHOOK_URL        Slack webhook URL
  TEAMS_WEBHOOK_URL        Microsoft Teams webhook URL
  DISCORD_WEBHOOK_URL      Discord webhook URL
  SMTP_HOST               SMTP server hostname
  SMTP_PORT               SMTP server port (default: 587)
  SMTP_USER               SMTP username
  SMTP_PASSWORD           SMTP password
  SMTP_FROM               From email address
  SMTP_TO                 To email address

Examples:
  node notify.js --type deployment --severity info --message "Deployment started" --env production --channels slack,file
  node notify.js --type quality_gate_violation --severity critical --message "Health check failed" --env staging --channels slack,teams,file
  node notify.js --type rollback --severity high --message "Auto-rollback completed" --env production --channels slack,email,file --data '{"backup_file":"backup.zip","status":"success"}'

Features:
  • Zero external dependencies
  • Exponential backoff with jitter
  • File fallback for all channels
  • Template system for message formatting
  • Delivery logging and audit trail
  • Multi-channel delivery with error handling

`);
}

// Main execution
async function main() {
  try {
    const options = parseArguments();
    
    if (!options.message) {
      console.error('Message is required. Use --message MESSAGE');
      showUsage();
      process.exit(1);
    }
    
    const result = await sendNotification(options);
    
    // Output results
    console.log('\n' + '═'.repeat(60));
    console.log('NOTIFICATION DELIVERY SUMMARY');
    console.log('═'.repeat(60));
    console.log(`Notification ID: ${result.notification_id}`);
    console.log(`Channels Attempted: ${result.channels_attempted.length}`);
    console.log(`Channels Succeeded: ${result.channels_succeeded.length}`);
    console.log(`Channels Failed: ${result.channels_failed.length}`);
    console.log(`Fallback Files: ${result.fallback_files.length}`);
    console.log(`Overall Success: ${result.success ? 'YES' : 'NO'}`);
    
    if (result.channels_succeeded.length > 0) {
      console.log(`\nSuccessful Channels: ${result.channels_succeeded.join(', ')}`);
    }
    
    if (result.channels_failed.length > 0) {
      console.log('\nFailed Channels:');
      result.channels_failed.forEach(failure => {
        console.log(`  ${failure.channel}: ${failure.error}`);
      });
    }
    
    if (result.fallback_files.length > 0) {
      console.log('\nFallback Files:');
      result.fallback_files.forEach(file => {
        console.log(`  ${path.basename(file)}`);
      });
    }
    
    console.log('═'.repeat(60));
    
    process.exit(result.success ? 0 : 1);
    
  } catch (err) {
    console.error('Fatal error:', err.message);
    process.exit(1);
  }
}

// Execute if run directly
if (require.main === module) {
  main().catch(err => {
    console.error('Unexpected error:', err);
    process.exit(1);
  });
}

module.exports = {
  sendNotification,
  SlackNotifier,
  TeamsNotifier,
  DiscordNotifier,
  EmailNotifier,
  FileNotifier,
  loadTemplate,
  processTemplate
};