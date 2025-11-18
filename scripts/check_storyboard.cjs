#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { validateStoryboard } = require('../src/validators/storyboardValidator');

function getFlag(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

function escapeXml(value) {
  return value.replace(/[<>&"]/g, (char) => ({
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    '"': '&quot;'
  }[char]));
}

function writeJunitReport(filePath, bucket) {
  const failures = bucket.valid ? 0 : 1;
  const message = bucket.valid ? '' : `    <failure message="${escapeXml(bucket.errors.join('; '))}"/>\n`;
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<testsuite name="${bucket.name}" tests="1" failures="${failures}">\n  <testcase classname="storyboard" name="${bucket.name}">\n${message}  </testcase>\n</testsuite>`;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, xml, 'utf-8');
}

const storyboardPath = getFlag('--storyboard') || getFlag('--input');
const junitPath = getFlag('--junit');
const junitDir = getFlag('--junit-dir');
const contractVersion = getFlag('--contract-version');
const contractPath = getFlag('--contract');

if (!storyboardPath) {
  console.error('Usage: node scripts/check_storyboard.cjs --storyboard <path> [--contract-version <ver>] [--contract <path>] [--junit <file>] [--junit-dir <dir>]');
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), storyboardPath), 'utf-8'));
const result = validateStoryboard(manifest, { contractVersion, contractPath });

if (junitDir) {
  writeJunitReport(path.join(junitDir, 'storyboard-scenes-contract.xml'), result.reports.scenes);
  writeJunitReport(path.join(junitDir, 'storyboard-motion-contract.xml'), result.reports.motion);
  writeJunitReport(path.join(junitDir, 'storyboard-layout-contract.xml'), result.reports.layout);
  writeJunitReport(path.join(junitDir, 'storyboard-timing-contract.xml'), result.reports.timing);
}

if (junitPath) {
  const bucket = {
    name: 'storyboard-contract',
    valid: result.valid,
    errors: result.valid ? [] : result.errors.concat(
      Object.values(result.reports)
        .filter((report) => !report.valid)
        .flatMap((report) => report.errors.map((err) => `${report.name}: ${err}`))
    )
  };
  writeJunitReport(junitPath, bucket);
}

if (!result.valid) {
  const detail = Object.values(result.reports)
    .filter((bucket) => !bucket.valid)
    .map((bucket) => `${bucket.name}: ${bucket.errors.join('; ')}`);
  const combined = result.errors.concat(detail);
  console.error('Storyboard contract violations:', combined.join(' | '));
  process.exit(1);
}

console.log('Storyboard manifest validated successfully.');
