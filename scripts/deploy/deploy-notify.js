#!/usr/bin/env node
// deploy-notify.js - Deployment-specific notification wrapper
// Usage: node deploy-notify.js --event <event> --env <environment> [options]

const path = require('path');
const { NotificationService } = require('../notify.js');

// Deployment event templates
const DEPLOYMENT_EVENTS = {
  'pre-deploy': {
    type: 'deploy',
    title: '🚀 Pre-Deployment Started',
    message_template: 'Pre-deployment checks and backup initiated for {environment}'
  },
  'deploy-start': {
    type: 'deploy',
    title: '🚀 Deployment Started',
    message_template: 'DHash deployment started for {environment}'
  },
  'deploy-success': {
    type: 'success',
    title: '✅ Deployment Successful',
    message_template: 'DHash deployment completed successfully for {environment}'
  },
  'deploy-failed': {
    type: 'error',
    title: '❌ Deployment Failed',
    message_template: 'DHash deployment failed for {environment}: {error}'
  },
  'rollback-start': {
    type: 'rollback',
    title: '⚡ Rollback Started',
    message_template: 'Automatic rollback initiated for {environment}: {reason}'
  },
  'rollback-success': {
    type: 'success',
    title: '✅ Rollback Successful',
    message_template: 'Rollback completed successfully for {environment}'
  },
  'rollback-failed': {
    type: 'error',
    title: '❌ Rollback Failed',
    message_template: 'Rollback failed for {environment}: {error}'
  },
  'monitoring-start': {
    type: 'monitoring',
    title: '👁️ Monitoring Started',
    message_template: 'Post-deployment monitoring started for {environment} (60-minute window)'
  },
  'monitoring-alert': {
    type: 'monitoring',
    title: '🚨 Quality Gate Alert',
    message_template: 'Quality gate violation detected in {environment}: {alert}'
  },
  'monitoring-complete': {
    type: 'success',
    title: '✅ Monitoring Complete',
    message_template: 'Post-deployment monitoring completed successfully for {environment}'
  }
};

class DeploymentNotificationService extends NotificationService {
  constructor(options = {}) {
    super(options);
  }

  // Create deployment notification
  createDeploymentNotification(event, environment, options = {}) {
    const eventConfig = DEPLOYMENT_EVENTS[event];
    if (!eventConfig) {
      throw new Error(`Unknown deployment event: ${event}`);
    }

    // Template substitution
    let message = eventConfig.message_template;
    const substitutions = {
      environment,
      error: options.error || 'Unknown error',
      reason: options.reason || 'Unknown reason',
      alert: options.alert || 'Unknown alert',
      ...options.substitutions
    };

    Object.keys(substitutions).forEach(key => {
      message = message.replace(new RegExp(`{${key}}`, 'g'), substitutions[key]);
    });

    const notification = {
      type: eventConfig.type,
      environment,
      message,
      status: options.status || this.getStatusFromEvent(event),
      timestamp: new Date().toISOString(),
      event,
      deployment_id: options.deploymentId || process.env.DEPLOYMENT_ID,
      commit_sha: options.commitSha || process.env.COMMIT_SHA || process.env.GITHUB_SHA,
      pr_number: options.prNumber || process.env.PR_NUMBER,
      ...options.metadata
    };

    return notification;
  }

  // Get status from event type
  getStatusFromEvent(event) {
    if (event.includes('success') || event.includes('complete')) return 'success';
    if (event.includes('failed') || event.includes('alert')) return 'error';
    if (event.includes('start')) return 'info';
    return 'info';
  }

  // Send deployment notification
  async sendDeploymentNotification(event, environment, options = {}) {
    const notification = this.createDeploymentNotification(event, environment, options);
    
    if (this.dryRun) {
      console.log(`[DRY-RUN] Would send deployment notification:`);
      console.log(`Event: ${event}`);
      console.log(`Environment: ${environment}`);
      console.log(`Message: ${notification.message}`);
      console.log(`Status: ${notification.status}`);
      return;
    }

    return await this.sendNotification(notification);
  }
}

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {};
  
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--event':
        options.event = args[++i];
        break;
      case '--env':
        options.environment = args[++i];
        break;
      case '--error':
        options.error = args[++i];
        break;
      case '--reason':
        options.reason = args[++i];
        break;
      case '--alert':
        options.alert = args[++i];
        break;
      case '--deployment-id':
        options.deploymentId = args[++i];
        break;
      case '--commit-sha':
        options.commitSha = args[++i];
        break;
      case '--pr-number':
        options.prNumber = args[++i];
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '-h':
      case '--help':
        console.log('Usage: node deploy-notify.js --event <event> --env <environment> [options]');
        console.log('');
        console.log('Required:');
        console.log('  --event         Deployment event type');
        console.log('  --env           Environment name');
        console.log('');
        console.log('Optional:');
        console.log('  --error         Error message (for failure events)');
        console.log('  --reason        Reason (for rollback events)');
        console.log('  --alert         Alert details (for monitoring events)');
        console.log('  --deployment-id Deployment identifier');
        console.log('  --commit-sha    Commit SHA');
        console.log('  --pr-number     Pull request number');
        console.log('  --dry-run       Show what would be sent without actually sending');
        console.log('');
        console.log('Available events:');
        Object.keys(DEPLOYMENT_EVENTS).forEach(event => {
          console.log(`  ${event.padEnd(20)} ${DEPLOYMENT_EVENTS[event].title}`);
        });
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
  if (!options.event || !options.environment) {
    console.error('Error: --event and --env are required');
    process.exit(1);
  }
  
  if (!DEPLOYMENT_EVENTS[options.event]) {
    console.error(`Error: Unknown event type: ${options.event}`);
    console.error('Available events:', Object.keys(DEPLOYMENT_EVENTS).join(', '));
    process.exit(1);
  }
  
  // Create notification service
  const notificationService = new DeploymentNotificationService({
    dryRun: options.dryRun
  });
  
  try {
    await notificationService.sendDeploymentNotification(options.event, options.environment, options);
    console.log(`✅ Deployment notification sent: ${options.event} for ${options.environment}`);
  } catch (error) {
    console.error(`❌ Deployment notification failed: ${error.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { DeploymentNotificationService, DEPLOYMENT_EVENTS };