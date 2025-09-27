#!/usr/bin/env node
/**
 * notify.js
 * Zero-dependency Node 18+ CLI to post templates to Slack/Teams or write email files.
 * Added: retry/backoff on POST failures.
 *
 * Exit codes:
 *   0 success (or dry-run)
 *   1 fatal usage/template error
 *   2 one or more sends failed (after retries)
 */

import fs from 'fs/promises';
import path from 'path';
import process from 'process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function usage() {
  console.log(`Usage: notify.js --service <slack|teams|email>[,...] --template <name> [--template-dir <dir>] [--data '{"k":"v"}' | --data-file <file>] [--webhook-url <url>] [--dry-run] [--retries <n>]

Examples:
  node notify.js --service slack --template slack_deploy_started --data '{"release":"v1.2.3"}' --dry-run
  node notify.js --service slack,teams --template deploy_started --data-file ./deploy.json
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
    retries: 3,
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
        try { opts.data = JSON.parse(argv[++i]); } catch (e) { console.error('Invalid JSON for --data'); process.exit(1); }
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
      case '--retries':
        opts.retries = Number(argv[++i]) || 3;
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
  const extMap = { slack: '.json', teams: '.json', email: '.txt' };
  const ext = extMap[service] || '.txt';
  const filePath = templateName.endsWith(ext) ? path.join(templateDir, templateName) : path.join(templateDir, `${templateName}${ext}`);
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return { raw, filePath };
  } catch (e) {
    throw new Error(`Template not found: ${filePath}`);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function postWebhookWithRetry(url, body, headers = {}, retries = 3) {
  // exponential backoff with jitter: base 500ms, factor *2, jitter 0..200ms
  let attempt = 0;
  while (attempt < retries) {
    attempt++;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json' }, headers),
        body: typeof body === 'string' ? body : JSON.stringify(body),
      });
      const text = await res.text();
      if (res.ok) return { ok: true, status: res.status, text };
      // treat non-2xx as retryable
      const err = `HTTP ${res.status}: ${text}`;
      if (attempt >= retries) return { ok: false, status: res.status, text: err };
      const backoff = Math.pow(2, attempt) * 500 + Math.floor(Math.random() * 200);
      console.warn(`Webhook POST failed (attempt ${attempt}/${retries}): ${err}. Retrying in ${backoff}ms`);
      await sleep(backoff);
    } catch (e) {
      if (attempt >= retries) return { ok: false, status: 0, text: e.message };
      const backoff = Math.pow(2, attempt) * 500 + Math.floor(Math.random() * 200);
      console.warn(`Network error on webhook POST (attempt ${attempt}/${retries}): ${e.message}. Retrying in ${backoff}ms`);
      await sleep(backoff);
    }
  }
  return { ok: false, status: 0, text: 'Exhausted retries' };
}

async function handleService(service, templateName, templateDir, data, webhookUrl, dryRun, retries) {
  const svc = service.toLowerCase();
  const { raw, filePath } = await loadTemplate(templateDir, templateName, svc);
  const message = substitute(raw, data);

  if (svc === 'slack') {
    let payload;
    try { payload = JSON.parse(message); } catch (e) { throw new Error(`Slack template ${filePath} did not produce valid JSON after substitution`); }
    const url = webhookUrl || process.env.SLACK_WEBHOOK;
    if (!url) throw new Error('No Slack webhook provided (use --webhook-url or set SLACK_WEBHOOK)');
    console.log(`[slack] Template: ${filePath}`);
    if (dryRun) {
      console.log('[dry-run] Would POST to Slack webhook:', url);
      console.log(JSON.stringify(payload, null, 2));
      return { service: 'slack', dryRun: true };
    }
    return await postWebhookWithRetry(url, payload, {}, retries);
  }

  if (svc === 'teams') {
    let payload;
    try { payload = JSON.parse(message); } catch (e) { throw new Error(`Teams template ${filePath} did not produce valid JSON after substitution`); }
    const url = webhookUrl || process.env.TEAMS_WEBHOOK;
    if (!url) throw new Error('No Teams webhook provided (use --webhook-url or set TEAMS_WEBHOOK)');
    console.log(`[teams] Template: ${filePath}`);
    if (dryRun) {
      console.log('[dry-run] Would POST to Teams webhook:', url);
      console.log(JSON.stringify(payload, null, 2));
      return { service: 'teams', dryRun: true };
    }
    return await postWebhookWithRetry(url, payload, {}, retries);
  }

  if (svc === 'email') {
    console.log(`[email] Template: ${filePath}`);
    if (dryRun) {
      console.log('[dry-run] Email content:');
      console.log(message);
      return { service: 'email', dryRun: true };
    }
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
    if (opts.dataFile) {
      const raw = await fs.readFile(opts.dataFile, 'utf8');
      opts.data = JSON.parse(raw);
    }

    const services = opts.service.split(',').map(s => s.trim()).filter(Boolean);
    const results = [];
    for (const svc of services) {
      try {
        const res = await handleService(svc, opts.template, opts.templateDir, opts.data, opts.webhookUrl, opts.dryRun, opts.retries);
        results.push({ service: svc, result: res });
      } catch (e) {
        console.error(`Error for service "${svc}": ${e.message}`);
        results.push({ service: svc, error: e.message });
      }
    }

    console.log('Summary:');
    for (const r of results) console.log(JSON.stringify(r, null, 2));

    const failures = results.filter(r => r.error || (r.result && r.result.ok === false));
    if (failures.length > 0 && !opts.dryRun) process.exit(2);
    process.exit(0);
  } catch (err) {
    console.error('Fatal:', err.message);
    process.exit(1);
  }
}

main();