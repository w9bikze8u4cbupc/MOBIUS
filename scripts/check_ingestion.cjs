#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { validateIngestionManifest } = require('../src/validators/ingestionValidator');

function getFlag(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

const manifestPath = getFlag('--manifest');
const junitPath = getFlag('--junit');

if (!manifestPath) {
  console.error('Usage: node scripts/check_ingestion.cjs --manifest <path> [--junit <path>]');
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), manifestPath), 'utf-8'));
const result = validateIngestionManifest(manifest);

if (junitPath) {
  const report = `<?xml version="1.0" encoding="UTF-8"?>\n<testsuite name="ingestion-contract" tests="1" failures="${
    result.valid ? 0 : 1
  }">\n  <testcase classname="ingestion" name="contract">${
    result.valid ? '' : `\n    <failure message="${result.errors.join('; ')}"/>\n`
  }  </testcase>\n</testsuite>`;
  fs.mkdirSync(path.dirname(junitPath), { recursive: true });
  fs.writeFileSync(junitPath, report);
}

if (!result.valid) {
  console.error('Ingestion contract violations:', result.errors.join('; '));
  process.exit(1);
}

console.log('Ingestion manifest validated successfully.');
