#!/usr/bin/env node

/**
 * Send notification to Slack/Teams based on deployment events
 * Usage: node send-notification.js --service slack --template deployment-started --release v1.2.3 --pr 123
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace(/^--/, '');
    const value = args[i + 1];
    if (key === 'service' && value) {
      opts[key] = value.split(',').map(s => s.trim());
    } else {
      opts[key] = value;
    }
  }
  return opts;
}

// Template replacements
function replaceTemplates(text, params) {
  return text
    .replace(/\{\{RELEASE_TAG\}\}/g, params.release || 'v0.0.0')
    .replace(/\{\{PR_NUMBER\}\}/g, params.pr || '000')
    .replace(/\{\{PR_URL\}\}/g, params.prUrl || `https://github.com/w9bikze8u4cbupc/MOBIUS/pull/${params.pr || '000'}`)
    .replace(/\{\{DEPLOY_LEAD\}\}/g, params.lead || 'Deploy Operator')
    .replace(/\{\{ENV\}\}/g, params.env || 'production')
    .replace(/\{\{DASHBOARD_URL\}\}/g, params.dashboard || 'https://dashboard.example.com')
    .replace(/\{\{ARTIFACT_URL\}\}/g, params.artifacts || 'https://github.com/w9bikze8u4cbupc/MOBIUS/actions')
    .replace(/\{\{RUNBOOK_URL\}\}/g, params.runbook || 'https://github.com/w9bikze8u4cbupc/MOBIUS/blob/main/.github/deploy-cheatsheet.md');
}

// Slack Block Kit templates
const slackTemplates = {
  'deployment-started': {
    "blocks": [
      { "type": "header", "text": { "type": "plain_text", "text": "🚀 MOBIUS Deploy Started" } },
      {
        "type": "section", 
        "fields": [
          { "type": "mrkdwn", "text": "*Release:*\n{{RELEASE_TAG}}" },
          { "type": "mrkdwn", "text": "*Env:*\n{{ENV}}" }
        ]
      },
      {
        "type": "section",
        "text": { "type": "mrkdwn", "text": "*PR:* <{{PR_URL}}|#{{PR_NUMBER}}>  •  *Lead:* {{DEPLOY_LEAD}}\n*Logs:* <{{ARTIFACT_URL}}|deploy-dryrun.log>" }
      },
      {
        "type": "actions",
        "elements": [
          { "type": "button", "text": { "type": "plain_text", "text": "View Dashboard" }, "url": "{{DASHBOARD_URL}}" },
          { "type": "button", "text": { "type": "plain_text", "text": "Open Runbook" }, "url": "{{RUNBOOK_URL}}" }
        ]
      }
    ]
  },
  'deployment-complete': {
    "blocks": [
      { "type": "header", "text": { "type": "plain_text", "text": "✅ MOBIUS Deploy Complete" } },
      {
        "type": "section",
        "text": { "type": "mrkdwn", "text": "Deployment *{{RELEASE_TAG}}* to *{{ENV}}* completed successfully after 60 minutes.\n\nNo action required." }
      }
    ]
  }
};

// Teams Adaptive Card templates
const teamsTemplates = {
  'deployment-started': {
    "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
    "type": "AdaptiveCard",
    "version": "1.4",
    "body": [
      { "type": "TextBlock", "size": "Large", "weight": "Bolder", "text": "🚀 MOBIUS Deploy Started" },
      {
        "type": "FactSet",
        "facts": [
          { "title": "Release", "value": "{{RELEASE_TAG}}" },
          { "title": "Env", "value": "{{ENV}}" },
          { "title": "PR", "value": "{{PR_URL}}" },
          { "title": "Lead", "value": "{{DEPLOY_LEAD}}" }
        ]
      },
      {
        "type": "TextBlock",
        "text": "[View Dashboard]({{DASHBOARD_URL}}) • [Logs]({{ARTIFACT_URL}})",
        "wrap": true
      }
    ]
  },
  'deployment-complete': {
    "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
    "type": "AdaptiveCard",
    "version": "1.4",
    "body": [
      { "type": "TextBlock", "size": "Large", "weight": "Bolder", "text": "✅ MOBIUS Deploy Complete" },
      { "type": "TextBlock", "text": "Deployment {{RELEASE_TAG}} to {{ENV}} completed successfully.", "wrap": true }
    ]
  }
};

async function sendNotification(service, template, params, dryRun = false) {
  if (service === 'slack') {
    const payload = JSON.parse(replaceTemplates(JSON.stringify(slackTemplates[template] || {}), params));
    if (dryRun) {
      console.log('Slack payload:');
      console.log(JSON.stringify(payload, null, 2));
      return;
    }
    // In real implementation, send to Slack webhook
    console.log(`Would send Slack notification for ${template}`);
  } else if (service === 'teams') {
    const payload = JSON.parse(replaceTemplates(JSON.stringify(teamsTemplates[template] || {}), params));
    if (dryRun) {
      console.log('Teams payload:');
      console.log(JSON.stringify(payload, null, 2));
      return;
    }
    // In real implementation, send to Teams webhook
    console.log(`Would send Teams notification for ${template}`);
  }
}

async function main() {
  const opts = parseArgs();
  
  if (!opts.service || !opts.template) {
    console.error('Usage: node send-notification.js --service slack,teams --template deployment-started [options]');
    console.error('Options: --release, --pr, --env, --lead, --dry-run');
    process.exit(1);
  }

  const services = Array.isArray(opts.service) ? opts.service : [opts.service];
  const isDryRun = opts['dry-run'] !== undefined;

  for (const service of services) {
    await sendNotification(service, opts.template, opts, isDryRun);
  }
}

if (require.main === module) {
  main().catch(console.error);
}