#!/usr/bin/env node

/**
 * deploy-notify.js - Wrapper script for consistent deployment notifications
 * 
 * This wrapper script provides a consistent interface for deployment notifications
 * while automatically generating the deploy.json payload from environment variables
 * and command line arguments.
 * 
 * Usage:
 *   node scripts/deploy/deploy-notify.js start
 *   node scripts/deploy/deploy-notify.js success
 *   node scripts/deploy/deploy-notify.js failure
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function createDeployData() {
  const data = {
    release: process.env.GITHUB_REF_NAME || 'unknown',
    pr: parseInt(process.env.GITHUB_PR_NUMBER || '0'),
    env: process.env.DEPLOY_ENV || 'production',
    lead: process.env.GITHUB_ACTOR || 'unknown',
    timestamp: new Date().toISOString()
  };

  // Add duration for completed deployments
  if (process.env.GITHUB_RUN_ATTEMPT) {
    data.duration = process.env.GITHUB_RUN_ATTEMPT;
  }

  return data;
}

function writeDeployData(data) {
  const deployFile = path.resolve('deploy.json');
  fs.writeFileSync(deployFile, JSON.stringify(data, null, 2));
  return deployFile;
}

function getTemplateAndServices(action) {
  switch (action) {
    case 'start':
    case 'started':
      return {
        template: 'deploy_started',
        services: 'slack,teams'
      };
    case 'success':
    case 'completed':
    case 'complete':
      return {
        template: 'deploy_completed',
        services: 'slack,teams,email'
      };
    case 'failure':
    case 'failed':
    case 'fail':
      return {
        template: 'deploy_failed',
        services: 'slack,teams'
      };
    default:
      throw new Error(`Unknown action: ${action}. Use 'start', 'success', or 'failure'`);
  }
}

function sendNotification(template, services, dataFile) {
  const notifyScript = path.resolve(__dirname, 'notify.js');
  const result = spawnSync('node', [
    notifyScript,
    '--service', services,
    '--template', template,
    '--data-file', dataFile
  ], {
    stdio: 'inherit'
  });

  return result.status;
}

function main() {
  const action = process.argv[2];

  if (!action || action === '--help' || action === '-h') {
    console.log(`
deploy-notify.js - Deployment notification wrapper

Usage:
  node scripts/deploy/deploy-notify.js <action>

Actions:
  start     Send deployment started notification (Slack + Teams)
  success   Send deployment completed notification (Slack + Teams + Email)
  failure   Send deployment failed notification (Slack + Teams)

Environment Variables:
  GITHUB_REF_NAME      Git reference name (branch/tag)
  GITHUB_PR_NUMBER     Pull request number
  GITHUB_ACTOR         User who triggered the deployment
  GITHUB_RUN_ATTEMPT   Run attempt number
  DEPLOY_ENV           Deployment environment (default: production)
  SLACK_WEBHOOK        Slack webhook URL
  TEAMS_WEBHOOK        Microsoft Teams webhook URL

Examples:
  # In GitHub Actions workflow
  - name: Notify deployment started
    run: node scripts/deploy/deploy-notify.js start

  - name: Notify deployment completed
    if: success()
    run: node scripts/deploy/deploy-notify.js success

  - name: Notify deployment failed
    if: failure()
    run: node scripts/deploy/deploy-notify.js failure
`);
    process.exit(action ? 0 : 1);
  }

  try {
    // Create deployment data
    const data = createDeployData();
    const dataFile = writeDeployData(data);

    // Get template and services for action
    const { template, services } = getTemplateAndServices(action);

    // Send notification
    const exitCode = sendNotification(template, services, dataFile);

    // Clean up
    fs.unlinkSync(dataFile);

    process.exit(exitCode);

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { createDeployData, getTemplateAndServices };