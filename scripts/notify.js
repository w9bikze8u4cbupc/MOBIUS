#!/usr/bin/env node

/**
 * Zero-dependency dhash Notification CLI
 * Usage: node scripts/notify.js --type TYPE --env ENV --message MESSAGE [--severity SEVERITY]
 */

const https = require('https');
const http = require('http');
const querystring = require('querystring');

// Default configuration
const DEFAULT_CONFIG = {
  type: 'info',
  environment: 'staging',
  message: '',
  severity: 'info',
  test: false
};

// Colors for console output
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

// Logging functions
const log = (message) => {
  const timestamp = new Date().toISOString();
  console.log(`${colors.blue}[${timestamp}] NOTIFY:${colors.reset} ${message}`);
};

const error = (message) => {
  const timestamp = new Date().toISOString();
  console.error(`${colors.red}[${timestamp}] ERROR:${colors.reset} ${message}`);
};

const success = (message) => {
  const timestamp = new Date().toISOString();
  console.log(`${colors.green}[${timestamp}] SUCCESS:${colors.reset} ${message}`);
};

const warn = (message) => {
  const timestamp = new Date().toISOString();
  console.log(`${colors.yellow}[${timestamp}] WARNING:${colors.reset} ${message}`);
};

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const config = { ...DEFAULT_CONFIG };
  
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--type':
        config.type = args[++i];
        break;
      case '--env':
        config.environment = args[++i];
        break;
      case '--message':
        config.message = args[++i];
        break;
      case '--severity':
        config.severity = args[++i];
        break;
      case '--test':
        config.test = true;
        break;
      case '-h':
      case '--help':
        console.log('Usage: node scripts/notify.js [options]');
        console.log('');
        console.log('Options:');
        console.log('  --type TYPE         Notification type (deploy, rollback, monitoring, migration)');
        console.log('  --env ENV           Environment (production, staging, canary)');
        console.log('  --message MESSAGE   Notification message');
        console.log('  --severity SEVERITY Severity level (info, warning, error, critical)');
        console.log('  --test              Test mode - use mock notifications');
        console.log('  -h, --help          Show this help message');
        console.log('');
        console.log('Environment Variables:');
        console.log('  SLACK_WEBHOOK_URL   Slack webhook URL for notifications');
        console.log('  DISCORD_WEBHOOK_URL Discord webhook URL for notifications');
        console.log('  TEAMS_WEBHOOK_URL   Microsoft Teams webhook URL for notifications');
        console.log('  EMAIL_SMTP_HOST     SMTP host for email notifications');
        console.log('  EMAIL_FROM          From email address');
        console.log('  EMAIL_TO            To email address(es)');
        console.log('');
        console.log('Examples:');
        console.log('  node scripts/notify.js --type deploy --env production --message "Deployment completed"');
        console.log('  node scripts/notify.js --type rollback --env production --message "Rollback triggered" --severity critical');
        console.log('  node scripts/notify.js --test --message "Test notification"');
        process.exit(0);
      default:
        error(`Unknown option: ${args[i]}`);
        process.exit(1);
    }
  }
  
  return config;
}

// Format notification message
function formatMessage(config) {
  const emoji = getEmoji(config.type, config.severity);
  const timestamp = new Date().toISOString();
  
  const title = `${emoji} dhash ${config.type} - ${config.environment.toUpperCase()}`;
  
  let message = `${title}\n\n`;
  message += `**Message:** ${config.message}\n`;
  message += `**Environment:** ${config.environment}\n`;
  message += `**Severity:** ${config.severity}\n`;
  message += `**Timestamp:** ${timestamp}\n`;
  
  // Add context based on type
  switch (config.type) {
    case 'deploy':
      message += `**Action Required:** Monitor deployment progress\n`;
      break;
    case 'rollback':
      message += `**Action Required:** Investigate root cause and prepare fixes\n`;
      break;
    case 'monitoring':
      message += `**Action Required:** Review monitoring results\n`;
      break;
    case 'migration':
      message += `**Action Required:** Verify migration results\n`;
      break;
  }
  
  return {
    title,
    message,
    emoji
  };
}

// Get appropriate emoji for notification type and severity
function getEmoji(type, severity) {
  const emojiMap = {
    deploy: {
      info: '🚀',
      warning: '⚠️',
      error: '❌',
      critical: '🔥'
    },
    rollback: {
      info: '⏪',
      warning: '⚠️',
      error: '❌',
      critical: '🚨'
    },
    monitoring: {
      info: '👁️',
      warning: '⚠️',
      error: '❌',
      critical: '🚨'
    },
    migration: {
      info: '📦',
      warning: '⚠️',
      error: '❌',
      critical: '🔥'
    }
  };
  
  return emojiMap[type]?.[severity] || '📢';
}

// HTTP request helper
function makeRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const requestModule = options.protocol === 'https:' ? https : http;
    
    const req = requestModule.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    });
    
    req.on('error', (err) => {
      reject(err);
    });
    
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    
    if (postData) {
      req.write(postData);
    }
    
    req.end();
  });
}

// Send Slack notification
async function sendSlackNotification(webhook, formatted) {
  const payload = {
    username: 'dhash-bot',
    icon_emoji: formatted.emoji,
    text: formatted.title,
    attachments: [
      {
        color: getSeverityColor(formatted.severity),
        fields: [
          {
            title: 'Message',
            value: formatted.message,
            short: false
          }
        ],
        footer: 'dhash guarded rollout system',
        ts: Math.floor(Date.now() / 1000)
      }
    ]
  };
  
  const url = new URL(webhook);
  const options = {
    hostname: url.hostname,
    port: url.port || (url.protocol === 'https:' ? 443 : 80),
    path: url.pathname + url.search,
    method: 'POST',
    protocol: url.protocol,
    headers: {
      'Content-Type': 'application/json'
    }
  };
  
  try {
    const response = await makeRequest(options, JSON.stringify(payload));
    
    if (response.statusCode === 200) {
      success('Slack notification sent successfully');
      return true;
    } else {
      error(`Slack notification failed: HTTP ${response.statusCode}`);
      return false;
    }
  } catch (err) {
    error(`Slack notification error: ${err.message}`);
    return false;
  }
}

// Send Discord notification
async function sendDiscordNotification(webhook, formatted) {
  const payload = {
    username: 'dhash-bot',
    avatar_url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f916.png',
    embeds: [
      {
        title: formatted.title,
        description: formatted.message,
        color: getSeverityColorInt(formatted.severity),
        timestamp: new Date().toISOString(),
        footer: {
          text: 'dhash guarded rollout system'
        }
      }
    ]
  };
  
  const url = new URL(webhook);
  const options = {
    hostname: url.hostname,
    port: url.port || (url.protocol === 'https:' ? 443 : 80),
    path: url.pathname + url.search,
    method: 'POST',
    protocol: url.protocol,
    headers: {
      'Content-Type': 'application/json'
    }
  };
  
  try {
    const response = await makeRequest(options, JSON.stringify(payload));
    
    if (response.statusCode === 204) {
      success('Discord notification sent successfully');
      return true;
    } else {
      error(`Discord notification failed: HTTP ${response.statusCode}`);
      return false;
    }
  } catch (err) {
    error(`Discord notification error: ${err.message}`);
    return false;
  }
}

// Send Microsoft Teams notification
async function sendTeamsNotification(webhook, formatted) {
  const payload = {
    '@type': 'MessageCard',
    '@context': 'http://schema.org/extensions',
    themeColor: getSeverityColor(formatted.severity).replace('#', ''),
    summary: formatted.title,
    sections: [
      {
        activityTitle: formatted.title,
        activitySubtitle: 'dhash guarded rollout system',
        activityImage: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f916.png',
        facts: [
          {
            name: 'Environment',
            value: formatted.environment
          },
          {
            name: 'Type',
            value: formatted.type
          },
          {
            name: 'Severity',
            value: formatted.severity
          },
          {
            name: 'Timestamp',
            value: new Date().toISOString()
          }
        ],
        text: formatted.message
      }
    ]
  };
  
  const url = new URL(webhook);
  const options = {
    hostname: url.hostname,
    port: url.port || (url.protocol === 'https:' ? 443 : 80),
    path: url.pathname + url.search,
    method: 'POST',
    protocol: url.protocol,
    headers: {
      'Content-Type': 'application/json'
    }
  };
  
  try {
    const response = await makeRequest(options, JSON.stringify(payload));
    
    if (response.statusCode === 200) {
      success('Teams notification sent successfully');
      return true;
    } else {
      error(`Teams notification failed: HTTP ${response.statusCode}`);
      return false;
    }
  } catch (err) {
    error(`Teams notification error: ${err.message}`);
    return false;
  }
}

// Send email notification (basic SMTP)
async function sendEmailNotification(config, formatted) {
  const smtpHost = process.env.EMAIL_SMTP_HOST;
  const fromEmail = process.env.EMAIL_FROM;
  const toEmail = process.env.EMAIL_TO;
  
  if (!smtpHost || !fromEmail || !toEmail) {
    warn('Email configuration incomplete - skipping email notification');
    return false;
  }
  
  // This is a simplified implementation
  // In production, you'd want to use a proper SMTP library
  warn('Email notifications require SMTP implementation - placeholder only');
  log(`Would send email to: ${toEmail}`);
  log(`Subject: ${formatted.title}`);
  log(`Body: ${formatted.message}`);
  
  return false; // Not implemented in this zero-dependency version
}

// Get severity color for notifications
function getSeverityColor(severity) {
  const colors = {
    info: '#36a64f',      // Green
    warning: '#ff9500',   // Orange
    error: '#ff0000',     // Red
    critical: '#800000'   // Dark Red
  };
  
  return colors[severity] || colors.info;
}

// Get severity color as integer for Discord
function getSeverityColorInt(severity) {
  const colors = {
    info: 3581519,       // Green
    warning: 16750848,   // Orange
    error: 16711680,     // Red
    critical: 8388608    // Dark Red
  };
  
  return colors[severity] || colors.info;
}

// Test notification function
function sendTestNotification(config) {
  log('=== Test Notification ===');
  log(`Type: ${config.type}`);
  log(`Environment: ${config.environment}`);
  log(`Message: ${config.message}`);
  log(`Severity: ${config.severity}`);
  
  const formatted = formatMessage(config);
  
  log('Formatted notification:');
  log(`Title: ${formatted.title}`);
  log(`Message: ${formatted.message}`);
  log(`Emoji: ${formatted.emoji}`);
  
  success('Test notification completed');
  return true;
}

// Main notification function
async function sendNotifications(config) {
  const formatted = formatMessage(config);
  const results = [];
  
  log(`Sending ${config.type} notification for ${config.environment}`);
  log(`Message: ${config.message}`);
  
  // Slack notification
  const slackWebhook = process.env.SLACK_WEBHOOK_URL;
  if (slackWebhook) {
    log('Sending Slack notification...');
    const slackResult = await sendSlackNotification(slackWebhook, formatted);
    results.push({ service: 'Slack', success: slackResult });
  } else {
    log('No Slack webhook configured - skipping Slack notification');
  }
  
  // Discord notification
  const discordWebhook = process.env.DISCORD_WEBHOOK_URL;
  if (discordWebhook) {
    log('Sending Discord notification...');
    const discordResult = await sendDiscordNotification(discordWebhook, formatted);
    results.push({ service: 'Discord', success: discordResult });
  } else {
    log('No Discord webhook configured - skipping Discord notification');
  }
  
  // Teams notification
  const teamsWebhook = process.env.TEAMS_WEBHOOK_URL;
  if (teamsWebhook) {
    log('Sending Teams notification...');
    const teamsResult = await sendTeamsNotification(teamsWebhook, formatted);
    results.push({ service: 'Teams', success: teamsResult });
  } else {
    log('No Teams webhook configured - skipping Teams notification');
  }
  
  // Email notification
  const emailResult = await sendEmailNotification(config, formatted);
  if (emailResult) {
    results.push({ service: 'Email', success: emailResult });
  }
  
  // Console notification (always enabled)
  log('Console notification:');
  console.log('═'.repeat(80));
  console.log(formatted.title);
  console.log('─'.repeat(80));
  console.log(formatted.message);
  console.log('═'.repeat(80));
  results.push({ service: 'Console', success: true });
  
  return results;
}

// Main function
async function main() {
  const config = parseArgs();
  
  if (!config.message && !config.test) {
    error('Message is required (use --message or --test)');
    process.exit(1);
  }
  
  log('=== dhash Notification System ===');
  log(`Type: ${config.type}`);
  log(`Environment: ${config.environment}`);
  log(`Severity: ${config.severity}`);
  log(`Test mode: ${config.test}`);
  
  try {
    let results;
    
    if (config.test) {
      results = [{ service: 'Test', success: sendTestNotification(config) }];
    } else {
      results = await sendNotifications(config);
    }
    
    // Summary
    const successful = results.filter(r => r.success).length;
    const total = results.length;
    
    log('=== Notification Results ===');
    results.forEach(result => {
      const status = result.success ? '✅' : '❌';
      log(`${status} ${result.service}: ${result.success ? 'Success' : 'Failed'}`);
    });
    
    if (successful === total) {
      success(`All ${total} notification(s) sent successfully`);
      process.exit(0);
    } else if (successful > 0) {
      warn(`${successful}/${total} notification(s) sent successfully`);
      process.exit(0);
    } else {
      error('All notifications failed');
      process.exit(1);
    }
    
  } catch (err) {
    error(`Notification system error: ${err.message}`);
    console.error(err.stack);
    process.exit(1);
  }
}

// Handle signals for graceful shutdown
process.on('SIGINT', () => {
  log('Received SIGINT - shutting down gracefully');
  process.exit(0);
});

process.on('SIGTERM', () => {
  log('Received SIGTERM - shutting down gracefully');
  process.exit(0);
});

// Execute main function if script is run directly
if (require.main === module) {
  main().catch(err => {
    error(`Unhandled error: ${err.message}`);
    console.error(err.stack);
    process.exit(1);
  });
}

module.exports = {
  sendNotifications,
  formatMessage,
  sendSlackNotification,
  sendDiscordNotification,
  sendTeamsNotification
};