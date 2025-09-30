#!/usr/bin/env node
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const outDir = 'verification-reports';
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const outFile = path.join(outDir, `verify-${timestamp}.json`);

try {
  const gitFiles = execSync('git ls-files', { encoding: 'utf8' })
    .split(/\r?\n/)
    .filter(Boolean)
    .filter(f => 
      !f.startsWith('verification-reports/') && 
      !f.includes('node_modules/') && 
      f !== 'scripts/verify-clean-genesis.js' &&
      f !== 'package.json' &&
      f !== 'package-lock.json'
    );

  const needle = /genesis/i;
  const matches = [];
  for (const f of gitFiles) {
    try {
      const txt = fs.readFileSync(f, 'utf8');
      if (needle.test(txt)) matches.push({ file: f });
    } catch (e) {
      // ignore unreadable files (binary, etc.)
    }
  }

  const report = { timestamp: new Date().toISOString(), scanned: gitFiles.length, matches };
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2), 'utf8');
  console.log(`Wrote verification report: ${outFile}`);
  if (matches.length > 0) {
    console.error(`Found ${matches.length} matches for "genesis".`);
    process.exit(2);
  }
  console.log('No matches for "genesis" found.');
  process.exit(0);
} catch (err) {
  console.error('Verification failed', err);
  process.exit(3);
}
