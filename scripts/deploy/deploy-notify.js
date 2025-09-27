#!/usr/bin/env node

/**
 * Deployment-specific Notification Script
 * Integrates with deployment pipeline for start/success/failure notifications
 * Usage: node scripts/deploy/deploy-notify.js --phase start|success|failure --env production
 */

const path = require('path');
const NotificationService = require('../notify.js');

class DeployNotificationService extends NotificationService {
  constructor() {
    super();
    this.deployPhases = {
      start: {
        type: 'deploy',
        title: '🚀 Deployment Started',
        color: '#0066cc'
      },
      success: {
        type: 'success', 
        title: '✅ Deployment Successful',
        color: '#36a64f'
      },
      failure: {
        type: 'error',
        title: '🚨 Deployment Failed',
        color: '#ff0000'
      },
      rollback: {
        type: 'rollback',
        title: '🔄 Rollback Initiated',
        color: '#ff9500'
      }
    };
  }

  generateDeploymentMessage(phase, environment, details = {}) {
    const timestamp = new Date().toISOString();
    const phaseConfig = this.deployPhases[phase];
    
    let message = `${phaseConfig.title} - ${environment.toUpperCase()}`;
    
    switch (phase) {
      case 'start':
        message = [
          `🚀 **Deployment Started**`,
          `**Environment:** ${environment.toUpperCase()}`,
          `**Started At:** ${timestamp}`,
          details.version ? `**Version:** ${details.version}` : '',
          details.initiator ? `**Initiated By:** ${details.initiator}` : '',
          details.commit ? `**Commit:** ${details.commit}` : '',
          `**Monitoring:** 60-minute quality gate monitoring will begin post-deployment`
        ].filter(Boolean).join('\n');
        break;
        
      case 'success':
        message = [
          `✅ **Deployment Completed Successfully**`,
          `**Environment:** ${environment.toUpperCase()}`,
          `**Completed At:** ${timestamp}`,
          details.duration ? `**Duration:** ${details.duration}` : '',
          details.version ? `**Version:** ${details.version}` : '',
          `**Status:** All pre-deployment checks passed`,
          `**Next Steps:** 60-minute monitoring window is now active`,
          details.monitoringUrl ? `**Monitor:** ${details.monitoringUrl}` : ''
        ].filter(Boolean).join('\n');
        break;
        
      case 'failure':
        message = [
          `🚨 **Deployment Failed**`,
          `**Environment:** ${environment.toUpperCase()}`,
          `**Failed At:** ${timestamp}`,
          details.error ? `**Error:** ${details.error}` : '',
          details.stage ? `**Failed Stage:** ${details.stage}` : '',
          details.logUrl ? `**Logs:** ${details.logUrl}` : '',
          `**Action Required:** Investigation and potential rollback needed`,
          details.rollbackCommand ? `**Rollback Command:** \`${details.rollbackCommand}\`` : ''
        ].filter(Boolean).join('\n');
        break;
        
      case 'rollback':
        message = [
          `🔄 **Rollback Initiated**`,
          `**Environment:** ${environment.toUpperCase()}`,
          `**Initiated At:** ${timestamp}`,
          details.reason ? `**Reason:** ${details.reason}` : '',
          details.backup ? `**Backup:** ${details.backup}` : '',
          details.trigger ? `**Triggered By:** ${details.trigger}` : '',
          `**Status:** Restoration in progress`,
          `**ETA:** Service restoration expected within 10 minutes`
        ].filter(Boolean).join('\n');
        break;
    }
    
    return message;
  }

  async sendDeploymentNotification(phase, environment, options = {}) {
    const { details = {}, channels = [], webhooks = {}, dryRun = false } = options;
    
    const message = this.generateDeploymentMessage(phase, environment, details);
    const phaseConfig = this.deployPhases[phase];
    
    // Determine channels based on phase and environment
    let defaultChannels = ['console', 'file'];
    
    if (environment === 'production') {
      if (phase === 'failure' || phase === 'rollback') {
        defaultChannels.push('slack', 'teams'); // High priority notifications
      } else {
        defaultChannels.push('slack'); // Standard notifications
      }
    }
    
    const notificationOptions = {
      type: phaseConfig.type,
      environment,
      message,
      channels: channels.length > 0 ? channels : defaultChannels,
      webhooks,
      dryRun
    };
    
    this.log(`Sending deployment notification: ${phase} for ${environment}`);
    
    const results = await this.sendNotification(notificationOptions);
    
    // Log deployment event to dedicated deployment log
    await this.logDeploymentEvent(phase, environment, details, results);
    
    return results;
  }

  async logDeploymentEvent(phase, environment, details, notificationResults) {
    const deploymentLogFile = path.join(process.cwd(), 'logs', 'deployment_events.json');
    
    let events = [];
    try {
      if (require('fs').existsSync(deploymentLogFile)) {
        const content = require('fs').readFileSync(deploymentLogFile, 'utf8');
        events = JSON.parse(content);
      }
    } catch (error) {
      this.log(`Failed to read deployment events log: ${error.message}`, 'WARN');
    }
    
    const event = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      phase,
      environment,
      details,
      notifications: notificationResults.map(r => ({
        channel: r.channel,
        success: r.success,
        error: r.error || null
      }))
    };
    
    events.push(event);
    
    // Keep only last 1000 events
    if (events.length > 1000) {
      events = events.slice(-1000);
    }
    
    try {
      require('fs').writeFileSync(deploymentLogFile, JSON.stringify(events, null, 2));
      this.log(`Deployment event logged: ${event.id}`);
    } catch (error) {
      this.log(`Failed to write deployment event: ${error.message}`, 'ERROR');
    }
  }

  // Integration with GitHub Actions / CI systems
  async sendCINotification(environment, options = {}) {
    const {
      status = 'unknown',
      workflowName = 'dhash-deployment',
      runId,
      commit,
      branch = 'main',
      actor,
      dryRun = false
    } = options;

    let phase;
    let details = {
      workflow: workflowName,
      runId,
      commit: commit ? commit.substring(0, 7) : undefined,
      branch,
      initiator: actor
    };

    switch (status) {
      case 'started':
      case 'in_progress':
        phase = 'start';
        break;
      case 'success':
      case 'completed':
        phase = 'success';
        details.duration = options.duration;
        break;
      case 'failure':
      case 'failed':
        phase = 'failure';
        details.error = options.error || 'CI workflow failed';
        details.logUrl = options.logUrl;
        break;
      default:
        this.log(`Unknown CI status: ${status}`, 'WARN');
        return [];
    }

    return await this.sendDeploymentNotification(phase, environment, {
      details,
      channels: options.channels,
      webhooks: options.webhooks,
      dryRun
    });
  }
}

// CLI handling
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    phase: '',
    environment: 'staging',
    details: {},
    channels: [],
    webhooks: {},
    dryRun: false
  };

  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    const value = args[i + 1];

    switch (flag) {
      case '--phase':
        options.phase = value;
        i++;
        break;
      case '--env':
      case '--environment':
        options.environment = value;
        i++;
        break;
      case '--version':
        options.details.version = value;
        i++;
        break;
      case '--initiator':
        options.details.initiator = value;
        i++;
        break;
      case '--commit':
        options.details.commit = value;
        i++;
        break;
      case '--duration':
        options.details.duration = value;
        i++;
        break;
      case '--error':
        options.details.error = value;
        i++;
        break;
      case '--stage':
        options.details.stage = value;
        i++;
        break;
      case '--reason':
        options.details.reason = value;
        i++;
        break;
      case '--backup':
        options.details.backup = value;
        i++;
        break;
      case '--trigger':
        options.details.trigger = value;
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
      case '--ci-status':
        // Special CI mode
        options.ciMode = true;
        options.ciStatus = value;
        i++;
        break;
      case '--workflow':
        options.details.workflow = value;
        i++;
        break;
      case '--run-id':
        options.details.runId = value;
        i++;
        break;
      case '--actor':
        options.details.actor = value;
        i++;
        break;
      case '--help':
        console.log(`
dhash Deployment Notification Service

Usage: node deploy-notify.js [OPTIONS]

OPTIONS:
  --phase PHASE          Deployment phase: start|success|failure|rollback (required)
  --env ENV              Environment: staging|production (default: staging)
  
  Deployment Details:
  --version VERSION      Deployment version/tag
  --initiator USER       Person/system initiating deployment
  --commit SHA           Git commit SHA
  --duration TIME        Deployment duration (for success notifications)
  --error ERROR          Error message (for failure notifications)
  --stage STAGE          Failed deployment stage (for failure notifications)
  --reason REASON        Rollback reason (for rollback notifications)
  --backup BACKUP        Backup used for rollback (for rollback notifications)
  --trigger TRIGGER      Rollback trigger (for rollback notifications)
  
  Notification Options:
  --channels CHANNELS    Comma-separated list: console,file,slack,teams,discord
  --slack URL            Slack webhook URL
  --teams URL            Teams webhook URL
  --discord URL          Discord webhook URL
  --dry-run              Show what would be sent without sending
  
  CI Integration:
  --ci-status STATUS     CI status: started|success|failure
  --workflow NAME        CI workflow name
  --run-id ID            CI run ID
  --actor USER           CI actor/initiator
  
  --help                 Show this help message

Examples:
  # Deployment start
  node deploy-notify.js --phase start --env production --version v1.2.3 --initiator alice
  
  # Deployment success
  node deploy-notify.js --phase success --env production --version v1.2.3 --duration "5m 23s"
  
  # Deployment failure
  node deploy-notify.js --phase failure --env production --error "Health check failed" --stage "post-deploy-verification"
  
  # Rollback notification
  node deploy-notify.js --phase rollback --env production --reason "quality-gate-violation" --backup "dhash_prod_20240101.zip"
  
  # CI integration
  node deploy-notify.js --ci-status success --env production --commit abc1234 --actor github-actions

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

  if (!options.phase && !options.ciMode) {
    console.error('Error: --phase is required (or use --ci-status for CI mode)');
    process.exit(1);
  }

  return options;
}

// Main execution
if (require.main === module) {
  const options = parseArgs();
  const deployNotificationService = new DeployNotificationService();

  let notificationPromise;

  if (options.ciMode) {
    // CI integration mode
    notificationPromise = deployNotificationService.sendCINotification(
      options.environment,
      {
        status: options.ciStatus,
        ...options.details,
        channels: options.channels,
        webhooks: options.webhooks,
        dryRun: options.dryRun
      }
    );
  } else {
    // Standard deployment notification
    notificationPromise = deployNotificationService.sendDeploymentNotification(
      options.phase,
      options.environment,
      {
        details: options.details,
        channels: options.channels,
        webhooks: options.webhooks,
        dryRun: options.dryRun
      }
    );
  }

  notificationPromise
    .then((results) => {
      console.log('\nDeployment notification results:');
      results.forEach(result => {
        const status = result.success ? '✅' : '❌';
        console.log(`  ${status} ${result.channel}: ${result.success ? 'Success' : result.error}`);
      });
      
      const successCount = results.filter(r => r.success).length;
      const totalCount = results.length;
      
      if (successCount === totalCount) {
        console.log(`\n✅ All ${totalCount} deployment notifications sent successfully`);
        process.exit(0);
      } else {
        console.log(`\n⚠️  ${successCount}/${totalCount} deployment notifications sent successfully`);
        process.exit(1);
      }
    })
    .catch((error) => {
      console.error('Deployment notification failed:', error.message);
      process.exit(1);
    });
}

module.exports = DeployNotificationService;