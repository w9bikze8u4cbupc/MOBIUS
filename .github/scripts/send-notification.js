#!/usr/bin/env node

/**
 * MOBIUS Notification Sender
 * 
 * Example script showing how to use the notification templates
 * Usage: node send-notification.js slack deployment-start v1.2.3
 */

const fs = require('fs');
const path = require('path');

// Load templates
const slackTemplates = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'templates', 'slack-blocks.json'), 'utf8')
);
const teamsTemplates = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'templates', 'teams-cards.json'), 'utf8')
);

/**
 * Replace placeholders in a template with actual values
 */
function fillTemplate(template, data) {
  let filled = JSON.stringify(template);
  
  // Replace all placeholders
  for (const [key, value] of Object.entries(data)) {
    const placeholder = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    filled = filled.replace(placeholder, value);
  }
  
  return JSON.parse(filled);
}

/**
 * Example deployment data
 */
function getExampleData(releaseTag) {
  return {
    RELEASE_TAG: releaseTag || 'v1.2.3',
    BRANCH_NAME: 'main',
    DEPLOY_LEAD: '@ops-team',
    PR_NUMBER: '123',
    PR_URL: 'https://github.com/w9bikze8u4cbupc/MOBIUS/pull/123',
    WORKFLOW_URL: 'https://github.com/w9bikze8u4cbupc/MOBIUS/actions/runs/12345',
    DEPLOY_DURATION: '8m 42s',
    ARTIFACT_COUNT: '12',
    VIDEO_COUNT: '3',
    LUFS_VALUE: '-23.1',
    PEAK_VALUE: '-1.2 dBTP',
    MEMORY_PEAK: '1.2 GB',
    RENDER_SPEED: '2.3x',
    TEST_COVERAGE: '85',
    ARTIFACTS_URL: 'https://github.com/w9bikze8u4cbupc/MOBIUS/actions/runs/12345',
    RELEASE_URL: 'https://github.com/w9bikze8u4cbupc/MOBIUS/releases/tag/v1.2.3',
    FAILURE_STATUS: 'Audio compliance failed',
    FAILED_STEP: 'Audio gates (Unix)',
    ERROR_MESSAGE: 'LUFS measurement -21.5 exceeds threshold of -23.0 ± 1.0'
  };
}

/**
 * Send to Slack (example implementation)
 */
async function sendToSlack(webhookUrl, message) {
  // In real implementation, you'd use fetch() or axios
  console.log('📱 Would send to Slack webhook:', webhookUrl);
  console.log('📝 Message:', JSON.stringify(message, null, 2));
  
  // Example with fetch:
  // const response = await fetch(webhookUrl, {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify(message)
  // });
  // return response.ok;
}

/**
 * Send to Teams (example implementation) 
 */
async function sendToTeams(webhookUrl, message) {
  console.log('💬 Would send to Teams webhook:', webhookUrl);
  console.log('📝 Message:', JSON.stringify(message, null, 2));
  
  // Example with fetch:
  // const response = await fetch(webhookUrl, {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify(message)
  // });
  // return response.ok;
}

/**
 * Main function
 */
async function main() {
  const [,, platform, event, releaseTag] = process.argv;
  
  if (!platform || !event) {
    console.log('Usage: node send-notification.js <platform> <event> [release-tag]');
    console.log('');
    console.log('Platforms: slack, teams');
    console.log('Events: deployment-start, deployment-success, deployment-issue');
    console.log('');
    console.log('Examples:');
    console.log('  node send-notification.js slack deployment-start v1.2.3');
    console.log('  node send-notification.js teams deployment-success');
    console.log('  node send-notification.js slack deployment-issue v1.2.2');
    return;
  }
  
  const data = getExampleData(releaseTag);
  
  // Map event names to template keys
  const eventMap = {
    'deployment-start': 'deploymentStart',
    'deployment-success': 'deploymentSuccess', 
    'deployment-issue': 'deploymentIssue'
  };
  
  const templateKey = eventMap[event];
  if (!templateKey) {
    console.error('❌ Unknown event:', event);
    return;
  }
  
  try {
    if (platform === 'slack') {
      const template = slackTemplates[templateKey];
      const message = fillTemplate(template, data);
      
      // Example webhook URL (use your real webhook)
      const webhookUrl = process.env.SLACK_WEBHOOK_URL || 'https://hooks.slack.com/services/YOUR/WEBHOOK/URL';
      await sendToSlack(webhookUrl, message);
      
    } else if (platform === 'teams') {
      const template = teamsTemplates[templateKey];
      const message = fillTemplate(template, data);
      
      // Example webhook URL (use your real webhook)
      const webhookUrl = process.env.TEAMS_WEBHOOK_URL || 'https://outlook.office.com/webhook/YOUR/WEBHOOK/URL';
      await sendToTeams(webhookUrl, message);
      
    } else {
      console.error('❌ Unknown platform:', platform);
      return;
    }
    
    console.log('✅ Notification sent successfully!');
    
  } catch (error) {
    console.error('❌ Error sending notification:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  fillTemplate,
  slackTemplates,
  teamsTemplates
};