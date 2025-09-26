#!/usr/bin/env node

/**
 * Notification Script
 * Sends webhook notifications to Slack/Teams with dry-run support
 */

const https = require('https');
const fs = require('fs');

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {};
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      if (i + 1 < args.length && !args[i + 1].startsWith('--')) {
        opts[key] = args[i + 1];
        i++;
      } else {
        opts[key] = true;
      }
    }
  }
  
  return opts;
}

// Send webhook notification
function sendWebhook(url, payload, opts = {}) {
  return new Promise((resolve, reject) => {
    if (opts.dryRun) {
      console.log('[DRY-RUN] Would send webhook to:', url);
      console.log('[DRY-RUN] Payload:', JSON.stringify(payload, null, 2));
      resolve({ status: 'dry-run' });
      return;
    }
    
    const data = JSON.stringify(payload);
    const urlObj = new URL(url);
    
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || 443,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    };
    
    const req = https.request(options, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ status: 'success', statusCode: res.statusCode, data: responseData });
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${responseData}`));
        }
      });
    });
    
    req.on('error', (err) => {
      reject(err);
    });
    
    req.write(data);
    req.end();
  });
}

// Create Slack payload
function createSlackPayload(message, severity = 'info') {
  const colors = {
    info: '#36a64f',      // Green
    warning: '#ffaa00',   // Orange  
    error: '#ff0000',     // Red
    critical: '#8b0000'   // Dark red
  };
  
  const icons = {
    info: '✅',
    warning: '⚠️',
    error: '❌',
    critical: '🚨'
  };
  
  return {
    text: `MOBIUS Deployment ${severity.toUpperCase()}`,
    attachments: [{
      color: colors[severity] || colors.info,
      fields: [{
        title: `${icons[severity] || icons.info} ${severity.toUpperCase()}`,
        value: message,
        short: false
      }, {
        title: 'Environment',
        value: process.env.DEPLOY_ENV || 'unknown',
        short: true
      }, {
        title: 'Timestamp',
        value: new Date().toISOString(),
        short: true
      }]
    }]
  };
}

// Create Teams payload
function createTeamsPayload(message, severity = 'info') {
  const colors = {
    info: '00FF00',      // Green
    warning: 'FFAA00',   // Orange
    error: 'FF0000',     // Red
    critical: '8B0000'   // Dark red
  };
  
  return {
    '@type': 'MessageCard',
    '@context': 'https://schema.org/extensions',
    summary: `MOBIUS Deployment ${severity.toUpperCase()}`,
    themeColor: colors[severity] || colors.info,
    sections: [{
      activityTitle: `MOBIUS Deployment ${severity.toUpperCase()}`,
      activitySubtitle: message,
      facts: [{
        name: 'Environment',
        value: process.env.DEPLOY_ENV || 'unknown'
      }, {
        name: 'Timestamp', 
        value: new Date().toISOString()
      }]
    }]
  };
}

// Main function
async function main() {
  const opts = parseArgs();
  
  const message = opts.message || 'Deployment notification';
  const severity = opts.severity || 'info';
  const dryRun = opts['dry-run'] || false;
  
  console.log(`[NOTIFY] Sending ${severity} notification: ${message}`);
  
  const results = [];
  
  // Send Slack notification
  const slackWebhook = process.env.SLACK_WEBHOOK_URL;
  if (slackWebhook) {
    try {
      const slackPayload = createSlackPayload(message, severity);
      const result = await sendWebhook(slackWebhook, slackPayload, { dryRun });
      results.push({ platform: 'slack', status: 'success', result });
      console.log('[NOTIFY] ✅ Slack notification sent');
    } catch (error) {
      results.push({ platform: 'slack', status: 'error', error: error.message });
      console.log('[NOTIFY] ❌ Slack notification failed:', error.message);
    }
  }
  
  // Send Teams notification  
  const teamsWebhook = process.env.TEAMS_WEBHOOK_URL;
  if (teamsWebhook) {
    try {
      const teamsPayload = createTeamsPayload(message, severity);
      const result = await sendWebhook(teamsWebhook, teamsPayload, { dryRun });
      results.push({ platform: 'teams', status: 'success', result });
      console.log('[NOTIFY] ✅ Teams notification sent');
    } catch (error) {
      results.push({ platform: 'teams', status: 'error', error: error.message });
      console.log('[NOTIFY] ❌ Teams notification failed:', error.message);
    }
  }
  
  // Send email notification (placeholder)
  const emailWebhook = process.env.EMAIL_WEBHOOK_URL;
  if (emailWebhook) {
    console.log('[NOTIFY] 📧 Email notification webhook configured (placeholder)');
    // Implement email webhook logic here
  }
  
  if (results.length === 0) {
    console.log('[NOTIFY] ℹ️  No webhook URLs configured');
    console.log('[NOTIFY] Set SLACK_WEBHOOK_URL, TEAMS_WEBHOOK_URL, or EMAIL_WEBHOOK_URL environment variables');
  }
  
  // Output results for GitHub Actions
  if (process.env.GITHUB_OUTPUT) {
    const successCount = results.filter(r => r.status === 'success').length;
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `NOTIFICATION_SUCCESS_COUNT=${successCount}\n`);
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `NOTIFICATION_TOTAL_COUNT=${results.length}\n`);
  }
  
  // Exit with error if all notifications failed
  const hasErrors = results.some(r => r.status === 'error');
  if (results.length > 0 && results.every(r => r.status === 'error')) {
    console.log('[NOTIFY] ❌ All notifications failed');
    process.exit(1);
  }
  
  console.log('[NOTIFY] ✅ Notification process completed');
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { sendWebhook, createSlackPayload, createTeamsPayload };
