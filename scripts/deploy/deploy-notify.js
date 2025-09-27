#!/usr/bin/env node
/**
 * deploy-notify.js - Deployment-specific notification wrapper
 * 
 * Provides convenient deployment lifecycle notifications with proper
 * context and formatting for dhash deployment operations.
 * 
 * Usage: node scripts/deploy/deploy-notify.js --env production --status success --message "Deployment completed"
 */

const path = require('path');
const fs = require('fs');

// Import the main notification system
const notifyScript = path.join(__dirname, '..', 'notify.js');
const { sendNotification } = require(notifyScript);

// Default configuration
const DEFAULT_CONFIG = {
  channels: {
    production: ['slack', 'email', 'file'],
    staging: ['slack', 'file'],
    development: ['file']
  },
  severityMap: {
    started: 'info',
    success: 'success',
    failed: 'critical',
    warning: 'medium',
    rollback: 'high'
  }
};

// Logging utility
function log(level, message, data = null) {
  const timestamp = new Date().toISOString();
  const logLine = `[${timestamp}] [${level.toUpperCase()}] ${message}${data ? ' | ' + JSON.stringify(data) : ''}`;
  console.log(logLine);
}

function logInfo(message, data = null) {
  log('info', message, data);
}

function logError(message, data = null) {
  log('error', message, data);
}

function logSuccess(message, data = null) {
  log('success', message, data);
}

// Enhanced message formatting for deployment contexts
function formatDeploymentMessage(status, message, environment, metadata = {}) {
  const statusEmojis = {
    started: '🚀',
    success: '✅',
    failed: '❌',
    warning: '⚠️',
    rollback: '⚡'
  };
  
  const emoji = statusEmojis[status] || '📢';
  const timestamp = new Date().toLocaleString();
  
  let formattedMessage = `${emoji} **DHhash Deployment ${status.toUpperCase()}**\n\n`;
  formattedMessage += `**Environment:** ${environment}\n`;
  formattedMessage += `**Time:** ${timestamp}\n`;
  formattedMessage += `**Message:** ${message}\n`;
  
  // Add deployment-specific metadata
  if (metadata.backup_file) {
    formattedMessage += `**Backup:** ${path.basename(metadata.backup_file)}\n`;
  }
  
  if (metadata.duration) {
    formattedMessage += `**Duration:** ${metadata.duration}\n`;
  }
  
  if (metadata.version) {
    formattedMessage += `**Version:** ${metadata.version}\n`;
  }
  
  if (metadata.commit) {
    formattedMessage += `**Commit:** ${metadata.commit.substring(0, 8)}\n`;
  }
  
  if (metadata.deployer) {
    formattedMessage += `**Deployed by:** ${metadata.deployer}\n`;
  }
  
  // Add context-specific information
  switch (status) {
    case 'started':
      formattedMessage += `\n📋 **Next Steps:**\n`;
      formattedMessage += `• Monitor deployment progress\n`;
      formattedMessage += `• Watch for quality gate violations\n`;
      formattedMessage += `• Prepare for post-deployment validation\n`;
      break;
      
    case 'success':
      formattedMessage += `\n🎉 **Deployment Complete!**\n`;
      formattedMessage += `• All quality gates passed\n`;
      formattedMessage += `• System is healthy and operational\n`;
      formattedMessage += `• 60-minute monitoring period active\n`;
      break;
      
    case 'failed':
      formattedMessage += `\n🚨 **Action Required:**\n`;
      formattedMessage += `• Review deployment logs immediately\n`;
      formattedMessage += `• Consider rollback if necessary\n`;
      formattedMessage += `• Check system health and metrics\n`;
      if (metadata.backup_file) {
        formattedMessage += `• Rollback command: \`./scripts/rollback_dhash.sh --backup "${metadata.backup_file}" --env ${environment}\`\n`;
      }
      break;
      
    case 'rollback':
      formattedMessage += `\n🔄 **Rollback Information:**\n`;
      formattedMessage += `• System has been restored from backup\n`;
      formattedMessage += `• Validate system functionality\n`;
      formattedMessage += `• Investigate root cause of original failure\n`;
      break;
      
    case 'warning':
      formattedMessage += `\n⚠️ **Warning Details:**\n`;
      formattedMessage += `• Monitor system closely\n`;
      formattedMessage += `• Be prepared for manual intervention\n`;
      formattedMessage += `• Review quality gates and thresholds\n`;
      break;
  }
  
  return formattedMessage;
}

// Get deployment context from environment and git
function getDeploymentContext() {
  const context = {
    deployer: process.env.USER || process.env.USERNAME || 'unknown',
    hostname: require('os').hostname(),
    timestamp: new Date().toISOString(),
    node_version: process.version
  };
  
  // Try to get git information
  try {
    const { execSync } = require('child_process');
    const rootDir = path.join(__dirname, '..', '..');
    
    context.commit = execSync('git rev-parse HEAD', { 
      cwd: rootDir, 
      encoding: 'utf8' 
    }).trim();
    
    context.branch = execSync('git rev-parse --abbrev-ref HEAD', { 
      cwd: rootDir, 
      encoding: 'utf8' 
    }).trim();
    
    // Check if there are uncommitted changes
    const status = execSync('git status --porcelain', { 
      cwd: rootDir, 
      encoding: 'utf8' 
    }).trim();
    
    context.clean_repo = status.length === 0;
    
  } catch (err) {
    logInfo('Could not retrieve git information', { error: err.message });
  }
  
  return context;
}

// Get deployment channels based on environment
function getChannelsForEnvironment(environment, status) {
  const envChannels = DEFAULT_CONFIG.channels[environment] || DEFAULT_CONFIG.channels.development;
  
  // For critical status, always include all available channels
  if (status === 'failed') {
    return Array.from(new Set([...envChannels, 'slack', 'email', 'file']));
  }
  
  return envChannels;
}

// Get additional deployment data from various sources
function getDeploymentMetadata(options) {
  const metadata = {
    ...getDeploymentContext(),
    ...options.data
  };
  
  // Add backup file information if available
  if (options.backup_file) {
    metadata.backup_file = options.backup_file;
    
    // Try to get backup file info
    try {
      const backupPath = path.resolve(options.backup_file);
      if (fs.existsSync(backupPath)) {
        const stats = fs.statSync(backupPath);
        metadata.backup_size = stats.size;
        metadata.backup_created = stats.mtime.toISOString();
        
        // Check for checksum file
        const checksumPath = backupPath + '.sha256';
        if (fs.existsSync(checksumPath)) {
          metadata.backup_verified = true;
        }
      }
    } catch (err) {
      logInfo('Could not retrieve backup file information', { error: err.message });
    }
  }
  
  // Add version information from package.json
  try {
    const packagePath = path.join(__dirname, '..', '..', 'package.json');
    if (fs.existsSync(packagePath)) {
      const packageData = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
      metadata.version = packageData.version;
      metadata.app_name = packageData.name;
    }
  } catch (err) {
    logInfo('Could not retrieve package information', { error: err.message });
  }
  
  return metadata;
}

// Main deployment notification function
async function sendDeploymentNotification(options) {
  const {
    environment = 'unknown',
    status = 'info',
    message = 'Deployment notification',
    backup_file = null,
    data = {}
  } = options;
  
  logInfo('Sending deployment notification', { environment, status, message });
  
  // Get deployment context and metadata
  const metadata = getDeploymentMetadata(options);
  
  // Format the message with deployment context
  const formattedMessage = formatDeploymentMessage(status, message, environment, metadata);
  
  // Determine appropriate channels
  const channels = getChannelsForEnvironment(environment, status);
  
  // Determine severity
  const severity = DEFAULT_CONFIG.severityMap[status] || 'info';
  
  // Determine notification type
  let notificationType = 'deployment';
  if (status === 'rollback') {
    notificationType = 'rollback';
  } else if (status === 'failed') {
    notificationType = 'deployment';
  }
  
  // Send notification
  const notificationOptions = {
    type: notificationType,
    message: formattedMessage,
    severity,
    environment,
    channels,
    data: {
      status,
      deployment_status: status,
      action: getActionForStatus(status, environment),
      ...metadata
    }
  };
  
  try {
    const result = await sendNotification(notificationOptions);
    
    logSuccess('Deployment notification sent successfully', {
      notification_id: result.notification_id,
      channels_succeeded: result.channels_succeeded.length,
      channels_failed: result.channels_failed.length
    });
    
    return result;
    
  } catch (err) {
    logError('Deployment notification failed', { error: err.message });
    throw err;
  }
}

function getActionForStatus(status, environment) {
  const actions = {
    started: `Monitor deployment progress in ${environment} environment`,
    success: `Deployment to ${environment} completed successfully - continue monitoring`,
    failed: `Deployment to ${environment} failed - investigate and consider rollback`,
    warning: `Deployment to ${environment} has warnings - monitor closely`,
    rollback: `Rollback in ${environment} completed - validate system and investigate root cause`
  };
  
  return actions[status] || 'Review deployment status and take appropriate action';
}

// Command line argument parsing
function parseArguments() {
  const args = process.argv.slice(2);
  const options = {};
  
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i];
    const value = args[i + 1];
    
    switch (key) {
      case '--env':
      case '--environment':
        options.environment = value;
        break;
      case '--status':
        options.status = value;
        break;
      case '--message':
        options.message = value;
        break;
      case '--backup-file':
        options.backup_file = value;
        break;
      case '--data':
        try {
          options.data = JSON.parse(value);
        } catch (err) {
          console.error(`Invalid JSON data: ${err.message}`);
          process.exit(1);
        }
        break;
      case '--channels':
        options.channels = value.split(',').map(c => c.trim());
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
Usage: node deploy-notify.js [OPTIONS]

Send deployment-specific notifications with enhanced context and formatting.

Options:
  --env ENVIRONMENT        Environment name (production, staging, development)
  --status STATUS          Deployment status (started, success, failed, warning, rollback)
  --message MESSAGE        Notification message
  --backup-file FILE       Path to backup file (for context)
  --data JSON              Additional data as JSON string
  --channels CHANNELS      Override default channels (comma-separated)
  --help                   Show this help message

Deployment Statuses:
  started     - Deployment has begun (info severity)
  success     - Deployment completed successfully (success severity)
  failed      - Deployment failed (critical severity)
  warning     - Deployment has warnings (medium severity)
  rollback    - Rollback completed (high severity)

Default Channels by Environment:
  production  - slack, email, file
  staging     - slack, file
  development - file

Examples:
  node deploy-notify.js --env production --status started --message "Deployment initiated"
  node deploy-notify.js --env staging --status success --message "Deployment completed" --backup-file backups/backup.zip
  node deploy-notify.js --env production --status failed --message "Health checks failed" --data '{"error":"timeout"}'

Features:
  • Environment-specific channel selection
  • Status-based severity mapping
  • Automatic deployment context inclusion
  • Git information and version detection
  • Backup file metadata extraction
  • Action recommendations based on status

`);
}

// Main execution
async function main() {
  try {
    const options = parseArguments();
    
    if (!options.environment) {
      console.error('Environment is required. Use --env ENVIRONMENT');
      showUsage();
      process.exit(1);
    }
    
    if (!options.status) {
      console.error('Status is required. Use --status STATUS');
      showUsage();
      process.exit(1);
    }
    
    if (!options.message) {
      console.error('Message is required. Use --message MESSAGE');
      showUsage();
      process.exit(1);
    }
    
    const result = await sendDeploymentNotification(options);
    
    // Output summary
    console.log('\n' + '═'.repeat(50));
    console.log('DEPLOYMENT NOTIFICATION SUMMARY');
    console.log('═'.repeat(50));
    console.log(`Environment: ${options.environment}`);
    console.log(`Status: ${options.status}`);
    console.log(`Notification ID: ${result.notification_id}`);
    console.log(`Success: ${result.success ? 'YES' : 'NO'}`);
    console.log(`Channels: ${result.channels_succeeded.join(', ') || 'none'}`);
    console.log('═'.repeat(50));
    
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
  sendDeploymentNotification,
  formatDeploymentMessage,
  getDeploymentContext,
  getChannelsForEnvironment
};