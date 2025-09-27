#!/usr/bin/env node
/**
 * Deployment-specific notification wrapper
 * 
 * Sends structured deployment notifications through the main notification system
 */

const { NotificationSystem } = require('./notify.js');
const path = require('path');

class DeploymentNotifier {
  constructor(options = {}) {
    this.environment = options.environment || 'production';
    this.notificationSystem = new NotificationSystem(options);
    this.deploymentId = options.deploymentId || this.generateDeploymentId();
  }
  
  generateDeploymentId() {
    return `dhash-${this.environment}-${Date.now()}`;
  }
  
  async sendDeploymentStart(metadata = {}) {
    return this.notificationSystem.sendNotification('info', 
      `🚀 dhash deployment started in ${this.environment}`, {
        deployment_id: this.deploymentId,
        environment: this.environment,
        timestamp: new Date().toISOString(),
        operator: process.env.USER || 'unknown',
        ...metadata
      });
  }
  
  async sendDeploymentSuccess(metadata = {}) {
    return this.notificationSystem.sendNotification('info',
      `✅ dhash deployment completed successfully in ${this.environment}`, {
        deployment_id: this.deploymentId,
        environment: this.environment,
        timestamp: new Date().toISOString(),
        duration: metadata.duration || 'unknown',
        ...metadata
      });
  }
  
  async sendDeploymentFailure(error, metadata = {}) {
    return this.notificationSystem.sendNotification('error',
      `❌ dhash deployment failed in ${this.environment}`, {
        deployment_id: this.deploymentId,
        environment: this.environment,
        timestamp: new Date().toISOString(),
        error: error.message || error,
        ...metadata
      });
  }
  
  async sendRollbackStart(reason, metadata = {}) {
    return this.notificationSystem.sendNotification('warning',
      `🔄 dhash rollback initiated in ${this.environment}`, {
        deployment_id: this.deploymentId,
        environment: this.environment,
        timestamp: new Date().toISOString(),
        reason,
        ...metadata
      });
  }
  
  async sendRollbackSuccess(metadata = {}) {
    return this.notificationSystem.sendNotification('info',
      `✅ dhash rollback completed successfully in ${this.environment}`, {
        deployment_id: this.deploymentId,
        environment: this.environment,
        timestamp: new Date().toISOString(),
        ...metadata
      });
  }
  
  async sendRollbackFailure(error, metadata = {}) {
    return this.notificationSystem.sendNotification('critical',
      `🚨 dhash rollback FAILED in ${this.environment} - Manual intervention required!`, {
        deployment_id: this.deploymentId,
        environment: this.environment,
        timestamp: new Date().toISOString(),
        error: error.message || error,
        ...metadata
      });
  }
  
  async sendMonitoringAlert(alertType, details, metadata = {}) {
    const alertEmojis = {
      health_check_failed: '💔',
      quality_gate_failed: '⚠️',
      auto_rollback_triggered: '🚨',
      monitoring_started: '👁️',
      monitoring_completed: '✅'
    };
    
    const emoji = alertEmojis[alertType] || '⚠️';
    
    return this.notificationSystem.sendNotification(
      metadata.level || 'warning',
      `${emoji} dhash ${alertType.replace(/_/g, ' ')} in ${this.environment}`, {
        deployment_id: this.deploymentId,
        environment: this.environment,
        alert_type: alertType,
        timestamp: new Date().toISOString(),
        details,
        ...metadata
      });
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const options = {};
  let notificationType = '';
  let message = '';
  let metadata = {};
  
  for (let i = 0; i < args.length; i += 2) {
    const flag = args[i];
    const value = args[i + 1];
    
    switch (flag) {
      case '--type':
        notificationType = value;
        break;
      case '--message':
        message = value;
        break;
      case '--environment':
      case '--env':
        options.environment = value;
        break;
      case '--deployment-id':
        options.deploymentId = value;
        break;
      case '--metadata':
        try {
          metadata = JSON.parse(value);
        } catch (error) {
          console.error(`Invalid JSON metadata: ${error.message}`);
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
Deployment Notification Wrapper for dhash

Usage: node scripts/deploy/deploy-notify.js [options]

Options:
  --type TYPE                Notification type (required)
  --message TEXT             Custom message (optional for some types)
  --environment, --env ENV   Environment name (default: production)
  --deployment-id ID         Deployment ID (auto-generated if not provided)
  --metadata JSON            Additional metadata as JSON string
  --verbose, -v              Enable verbose output
  --help, -h                 Show this help message

Notification Types:
  deployment_start           Deployment started
  deployment_success         Deployment completed successfully
  deployment_failure         Deployment failed
  rollback_start            Rollback started
  rollback_success          Rollback completed
  rollback_failure          Rollback failed
  monitoring_alert          Custom monitoring alert

Examples:
  node scripts/deploy/deploy-notify.js --type deployment_start
  node scripts/deploy/deploy-notify.js --type deployment_failure --metadata '{"error":"Build failed"}'
  node scripts/deploy/deploy-notify.js --type monitoring_alert --message "Custom alert" --metadata '{"level":"critical"}'
        `);
        process.exit(0);
      default:
        console.error(`Unknown option: ${flag}`);
        process.exit(1);
    }
  }
  
  if (!notificationType) {
    console.error('Error: --type is required');
    process.exit(1);
  }
  
  try {
    const notifier = new DeploymentNotifier(options);
    let result;
    
    switch (notificationType) {
      case 'deployment_start':
        result = await notifier.sendDeploymentStart(metadata);
        break;
      case 'deployment_success':
        result = await notifier.sendDeploymentSuccess(metadata);
        break;
      case 'deployment_failure':
        result = await notifier.sendDeploymentFailure(metadata.error || 'Deployment failed', metadata);
        break;
      case 'rollback_start':
        result = await notifier.sendRollbackStart(metadata.reason || 'Rollback initiated', metadata);
        break;
      case 'rollback_success':
        result = await notifier.sendRollbackSuccess(metadata);
        break;
      case 'rollback_failure':
        result = await notifier.sendRollbackFailure(metadata.error || 'Rollback failed', metadata);
        break;
      case 'monitoring_alert':
        result = await notifier.sendMonitoringAlert(
          metadata.alert_type || 'custom_alert',
          message || metadata.details || 'Monitoring alert',
          metadata
        );
        break;
      default:
        console.error(`Unknown notification type: ${notificationType}`);
        process.exit(1);
    }
    
    if (result.success) {
      console.log(`Deployment notification sent successfully to ${result.successful_channels} channel(s)`);
      process.exit(0);
    } else {
      console.error(`Deployment notification failed (${result.failed_channels} failures)`);
      process.exit(1);
    }
  } catch (error) {
    console.error(`Deployment notification failed: ${error.message}`);
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

module.exports = { DeploymentNotifier };