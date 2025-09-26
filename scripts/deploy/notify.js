#!/usr/bin/env node
/**
 * notify.js
 *
 * Usage (examples):
 *  node scripts/deploy/notify.js --service slack --template slack_deploy_started.json --data '{"release":"v1.2.3","pr":123,"env":"production","lead":"Jane Doe"}' --dry-run
 *  node scripts/deploy/notify.js --service slack,teams --template deploy_started --template-dir templates/notifications --webhook-url "https://hooks.slack.com/..." --dry-run
 *
 * Notes:
 *  - For Slack/Teams, either set env vars SLACK_WEBHOOK, TEAMS_WEBHOOK or pass --webhook-url (applies to all services).
 *  - Template lookup: tries {templateDir}/{template}.{ext} where ext depends on service:
 *      slack -> .json
 *      teams -> .json
 *      email -> .txt
 *  - Template placeholders use {{var}} and are replaced by provided data.
 */

import fs from 'fs/promises';
import path from 'path';
import process from 'process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function usage() {
  console.log(`Usage: notify.js --service <slack|teams|email>[,...] --template <name> [--template-dir <dir>] [--data '{"k":"v"}' | --data-file <file>] [--webhook-url <url>] [--dry-run]

Environment variables:
  SLACK_WEBHOOK   Slack webhook URL (optional)
  TEAMS_WEBHOOK   Teams webhook URL (optional)

Examples:
  node notify.js --service slack --template slack_deploy_started.json --data '{"release":"v1.2.3","pr":123}' --dry-run
  node notify.js --service slack,teams --template deploy_started --template-dir templates/notifications --data-file ./deploy.json
`);
  process.exit(1);
}

function parseArgs(argv) {
  const opts = {
    service: null,
    template: null,
    templateDir: path.join(process.cwd(), 'templates', 'notifications'),
    data: {},
    dataFile: null,
    webhookUrl: null,
    dryRun: false,
  };

  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--service':
        opts.service = argv[++i];
        break;
      case '--template':
        opts.template = argv[++i];
        break;
      case '--template-dir':
        opts.templateDir = argv[++i];
        break;
      case '--data':
        try {
          opts.data = JSON.parse(argv[++i]);
        } catch (e) {
          console.error('Invalid JSON for --data');
          process.exit(2);
        }
        break;
      case '--data-file':
        opts.dataFile = argv[++i];
        break;
      case '--webhook-url':
        opts.webhookUrl = argv[++i];
        break;
      case '--dry-run':
        opts.dryRun = true;
        break;
      case '--help':
      case '-h':
        usage();
        break;
      default:
        console.error('Unknown arg:', a);
        usage();
    }
  }
  if (!opts.service || !opts.template) usage();
  return opts;
}

function substitute(templateText, data) {
  return templateText.replace(/{{\s*([\w.-]+)\s*}}/g, (_, key) => {
    const val = key.split('.').reduce((acc, k) => (acc && acc[k] != null ? acc[k] : undefined), data);
    return val == null ? '' : String(val);
  });
}

async function loadTemplate(templateDir, templateName, service) {
  // Determine extensions: slack/json, teams/json, email/txt
  const extMap = { slack: '.json', teams: '.json', email: '.txt' };
  const ext = extMap[service] || '.txt';
  let filePath = templateName.endsWith(ext) ? path.join(templateDir, templateName) : path.join(templateDir, `${templateName}${ext}`);
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return { raw, filePath };
  } catch (e) {
    throw new Error(`Template not found: ${filePath}`);
  }
}

async function postWebhook(url, body, headers = {}) {
  // Use global fetch (Node 18+)
  const res = await fetch(url, {
    method: 'POST',
    headers: Object.assign({ 'Content-Type': 'application/json' }, headers),
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, text };
}

async function handleService(service, templateName, templateDir, data, webhookUrl, dryRun) {
  const svc = service.toLowerCase();
  const { raw, filePath } = await loadTemplate(templateDir, templateName, svc);
  const message = substitute(raw, data);

  if (svc === 'slack') {
    // Template is JSON body
    let payload;
    try {
      payload = JSON.parse(message);
    } catch (e) {
      throw new Error(`Slack template ${filePath} did not produce valid JSON after substitution`);
    }
    const url = webhookUrl || process.env.SLACK_WEBHOOK;
    if (!url) throw new Error('No Slack webhook provided (use --webhook-url or set SLACK_WEBHOOK)');
    console.log(`[slack] Template: ${filePath}`);
    if (dryRun) {
      console.log('[dry-run] Would POST to Slack webhook:', url);
      console.log(JSON.stringify(payload, null, 2));
      return { service: 'slack', dryRun: true };
    }
    const res = await postWebhook(url, payload);
    return { service: 'slack', ok: res.ok, status: res.status, text: res.text };
  }

  if (svc === 'teams') {
    let payload;
    try {
      payload = JSON.parse(message);
    } catch (e) {
      throw new Error(`Teams template ${filePath} did not produce valid JSON after substitution`);
    }
    const url = webhookUrl || process.env.TEAMS_WEBHOOK;
    if (!url) throw new Error('No Teams webhook provided (use --webhook-url or set TEAMS_WEBHOOK)');
    console.log(`[teams] Template: ${filePath}`);
    if (dryRun) {
      console.log('[dry-run] Would POST to Teams webhook:', url);
      console.log(JSON.stringify(payload, null, 2));
      return { service: 'teams', dryRun: true };
    }
    const res = await postWebhook(url, payload);
    return { service: 'teams', ok: res.ok, status: res.status, text: res.text };
  }

  if (svc === 'email') {
    // For email, just output the substituted text. Integrate with SMTP outside of this tool.
    console.log(`[email] Template: ${filePath}`);
    if (dryRun) {
      console.log('[dry-run] Email content:');
      console.log(message);
      return { service: 'email', dryRun: true };
    }
    // default behavior: print email text to stdout and also write to ./out/email_<timestamp>.txt
    const outDir = path.join(process.cwd(), 'notifications_out');
    await fs.mkdir(outDir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const outFile = path.join(outDir, `email_${ts}.txt`);
    await fs.writeFile(outFile, message, 'utf8');
    console.log(`Email content written to ${outFile}`);
    return { service: 'email', outFile };
  }

  throw new Error(`Unsupported service: ${service}`);
}

async function main() {
  try {
    const opts = parseArgs(process.argv);

    // load data file if provided
    if (opts.dataFile) {
      const raw = await fs.readFile(opts.dataFile, 'utf8');
      opts.data = JSON.parse(raw);
    }

    const services = opts.service.split(',').map(s => s.trim()).filter(Boolean);
    const results = [];
    for (const svc of services) {
      try {
        const res = await handleService(svc, opts.template, opts.templateDir, opts.data, opts.webhookUrl, opts.dryRun);
        results.push({ service: svc, result: res });
      } catch (e) {
        console.error(`Error for service "${svc}": ${e.message}`);
        results.push({ service: svc, error: e.message });
      }
    }

    // summarize
    console.log('Summary:');
    for (const r of results) {
      console.log(JSON.stringify(r, null, 2));
    }

    // exit with non-zero if any error and not dry-run
    const failures = results.filter(r => r.error || (r.result && r.result.ok === false));
    if (failures.length > 0 && !opts.dryRun) process.exit(2);
    process.exit(0);
  } catch (err) {
    console.error('Fatal:', err.message);
    process.exit(1);
  }
}

main();