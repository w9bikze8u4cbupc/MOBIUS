#!/usr/bin/env node
/**
 * Simple notification CLI
 * Usage (example):
 *  node send-notification.js --service slack,teams --template deployment-started --release v1.2.3 --pr 123 --env production --lead "Jane Doe" --dry-run
 *
 * Requires SLACK_WEBHOOK and TEAMS_WEBHOOK env vars for live posting.
 */
const https = require('https');
const { URL } = require('url');

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { service: [], dryRun: false };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--service') out.service = args[++i].split(',');
    else if (a === '--template') out.template = args[++i];
    else if (a === '--release') out.release = args[++i];
    else if (a === '--pr') out.pr = args[++i];
    else if (a === '--env') out.env = args[++i];
    else if (a === '--lead') out.lead = args[++i];
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--webhook') out.webhook = args[++i];
  }
  return out;
}

function buildPayload(template, vars) {
  // Only two simple templates implemented for brevity
  if (template === 'deployment-started') {
    const text = `🚀 Deploy started — ${vars.release} → ${vars.env}\nPR: ${vars.pr}\nLead: ${vars.lead}`;
    return {
      slack: { blocks: [{ type: 'section', text: { type: 'mrkdwn', text } }] },
      teams: {
        '@type': 'MessageCard',
        '@context': 'https://schema.org/extensions',
        summary: 'Deploy started',
        themeColor: '0078D4',
        title: `Deploy started — ${vars.release}`,
        text,
      }
    };
  } else if (template === 'deployment-complete') {
    const text = `✅ Deploy complete — ${vars.release} (${vars.env})\nPR: ${vars.pr}\nLead: ${vars.lead}`;
    return {
      slack: { blocks: [{ type: 'section', text: { type: 'mrkdwn', text } }] },
      teams: {
        '@type': 'MessageCard',
        '@context': 'https://schema.org/extensions',
        summary: 'Deploy complete',
        themeColor: '00C853',
        title: `Deploy complete — ${vars.release}`,
        text,
      }
    };
  }
  throw new Error(`Unknown template: ${template}`);
}

function postJson(webhookUrl, json, callback) {
  const url = new URL(webhookUrl);
  const data = JSON.stringify(json);
  const options = {
    hostname: url.hostname,
    path: url.pathname + (url.search || ''),
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data)
    }
  };
  const req = https.request(options, (res) => {
    let body = '';
    res.on('data', (d) => body += d);
    res.on('end', () => callback(null, { statusCode: res.statusCode, body }));
  });
  req.on('error', (e) => callback(e));
  req.write(data);
  req.end();
}

async function main() {
  const args = parseArgs();
  if (!args.template || !args.release || !args.pr || !args.env) {
    console.error('Missing required args. --template, --release, --pr, --env are required');
    process.exit(2);
  }

  const payloads = buildPayload(args.template, {
    release: args.release, pr: args.pr, env: args.env, lead: args.lead || ''
  });

  if (args.dryRun) {
    console.log('DRY RUN - payloads:');
    console.log('SLACK:', JSON.stringify(payloads.slack, null, 2));
    console.log('TEAMS:', JSON.stringify(payloads.teams, null, 2));
    process.exit(0);
  }

  // Post to Slack
  if (args.service.includes('slack') || args.service.includes('all')) {
    const slackWebhook = process.env.SLACK_WEBHOOK || args.webhook;
    if (!slackWebhook) {
      console.error('SLACK_WEBHOOK not set (or passed via --webhook). Skipping Slack.');
    } else {
      postJson(slackWebhook, payloads.slack, (err, res) => {
        if (err) console.error('Slack error', err);
        else console.log('Slack posted:', res.statusCode);
      });
    }
  }

  // Post to Teams
  if (args.service.includes('teams') || args.service.includes('all')) {
    const teamsWebhook = process.env.TEAMS_WEBHOOK || args.webhook;
    if (!teamsWebhook) {
      console.error('TEAMS_WEBHOOK not set (or passed via --webhook). Skipping Teams.');
    } else {
      postJson(teamsWebhook, payloads.teams, (err, res) => {
        if (err) console.error('Teams error', err);
        else console.log('Teams posted:', res.statusCode);
      });
    }
  }
}

main().catch((err) => {
  console.error('Fatal:', err && err.stack ? err.stack : err);
  process.exit(3);
});