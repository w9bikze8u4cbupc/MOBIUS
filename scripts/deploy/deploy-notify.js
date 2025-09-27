#!/usr/bin/env node
/**
 * deploy-notify.js
 * Wrapper around notify.js that writes a temporary deploy_<phase>.json,
 * invokes notify.js, and cleans up the temp file reliably.
 *
 * Usage:
 *  node scripts/deploy/deploy-notify.js start|success|failure [--env <env>] [--pr <n>] [--release <v>] [--lead <name>] [--duration <dur>] [--dry-run] [--services slack,teams,email] [--template-dir <dir>]
 */

import { execSync } from 'child_process';
import fs from 'fs/promises';
import path from 'path';

const [, , cmd, ...rest] = process.argv;
if (!cmd || !['start', 'success', 'failure'].includes(cmd)) {
  console.error('Usage: deploy-notify.js <start|success|failure> [--env <env>] [--pr <n>] [--release <v>] [--lead <name>] [--duration <dur>] [--dry-run]');
  process.exit(1);
}

function parseFlags(args) {
  const opts = {
    env: process.env.DEPLOY_ENV || 'production',
    pr: process.env.PR_NUMBER || 0,
    release: process.env.RELEASE || process.env.GITHUB_REF_NAME || '',
    lead: process.env.DEPLOY_LEAD || process.env.GITHUB_ACTOR || '',
    duration: '',
    dryRun: false,
    services: 'slack,teams',
    templateDir: path.join(process.cwd(), 'templates', 'notifications'),
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--env') opts.env = args[++i];
    else if (a === '--pr') opts.pr = args[++i];
    else if (a === '--release') opts.release = args[++i];
    else if (a === '--lead') opts.lead = args[++i];
    else if (a === '--duration') opts.duration = args[++i];
    else if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--services') opts.services = args[++i];
    else if (a === '--template-dir') opts.templateDir = args[++i];
    else if (a === '--clean') opts.clean = true;
  }
  return opts;
}

function buildPayload(opts) {
  return {
    release: opts.release || '',
    pr: Number(opts.pr || 0),
    env: opts.env,
    lead: opts.lead,
    duration: opts.duration || '',
    timestamp: new Date().toISOString(),
  };
}

(async () => {
  const opts = parseFlags(rest);
  const payload = buildPayload(opts);
  const tmpFile = path.join(process.cwd(), `deploy_${cmd}.json`);

  try {
    if (opts.clean) {
      // remove previous deploy_*.json (best-effort)
      const files = await fs.readdir(process.cwd());
      for (const f of files) {
        if (f.startsWith('deploy_') && f.endsWith('.json')) {
          try { await fs.unlink(path.join(process.cwd(), f)); } catch (e) { /* ignore */ }
        }
      }
    }

    await fs.writeFile(tmpFile, JSON.stringify(payload), 'utf8');

    const notifyPath = path.join(process.cwd(), 'scripts', 'deploy', 'notify.js');
    let cmdLine = `node "${notifyPath}" --service ${opts.services} --template ${cmd === 'start' ? 'deploy_started' : (cmd === 'success' ? 'deploy_completed' : 'deploy_failed')} --data-file "${tmpFile}" --template-dir "${opts.templateDir}"`;
    if (opts.dryRun) cmdLine += ' --dry-run';

    console.log(`[deploy-notify] running: ${cmdLine}`);
    try {
      execSync(cmdLine, { stdio: 'inherit' });
    } catch (err) {
      console.error('[deploy-notify] notify call failed:', err.message || err);
      // leave cleanup to finally, and return failure code
      throw err;
    }

    // success
    process.exit(0);
  } catch (err) {
    // error; ensure non-zero exit
    console.error('[deploy-notify] Error:', err?.message || err);
    process.exit(2);
  } finally {
    // best-effort cleanup of tmp file
    try { await fs.unlink(tmpFile); } catch (e) { /* ignore if not present */ }
  }
})();