#!/usr/bin/env node
/**
 * deploy-notify.js
 *
 * Wrapper around scripts/deploy/notify.js to simplify CI workflow usage.
 *
 * Usage:
 *   node scripts/deploy/deploy-notify.js start   # notify start
 *   node scripts/deploy/deploy-notify.js success # notify success (optionally provide --duration "30s")
 *   node scripts/deploy/deploy-notify.js failure # notify failure
 *
 * It builds a deploy.json payload and invokes notify.js with the appropriate template.
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
  }
  return opts;
}

(async () => {
  try {
    const opts = parseFlags(rest);

    const payload = {
      release: opts.release || '',
      pr: Number(opts.pr || 0),
      env: opts.env,
      lead: opts.lead,
      duration: opts.duration || '',
      timestamp: new Date().toISOString(),
    };

    // Choose template per phase
    const templateMap = {
      start: 'deploy_started',
      success: 'deploy_completed',
      failure: 'deploy_failed',
    };
    const template = templateMap[cmd];

    // Write payload file
    const tmpFile = path.join(process.cwd(), `deploy_${cmd}.json`);
    await fs.writeFile(tmpFile, JSON.stringify(payload), 'utf8');

    // Build command to call notify.js
    const notifyPath = path.join(process.cwd(), 'scripts', 'deploy', 'notify.js');
    let cmdLine = `node "${notifyPath}" --service ${opts.services} --template ${template} --data-file "${tmpFile}" --template-dir "${opts.templateDir}"`;
    if (opts.dryRun) cmdLine += ' --dry-run';

    console.log(`[deploy-notify] running: ${cmdLine}`);
    // execSync will throw if non-zero exit
    const out = execSync(cmdLine, { stdio: 'inherit' });
    // Cleanup: leave payload file for debugging; optional removal:
    // await fs.unlink(tmpFile);

    process.exit(0);
  } catch (err) {
    console.error('[deploy-notify] Error:', err?.message || err);
    process.exit(2);
  }
})();