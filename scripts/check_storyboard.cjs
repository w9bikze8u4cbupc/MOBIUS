#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { validateStoryboard } = require('../src/validators/storyboardValidator');

function getFlag(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

const storyboardPath = getFlag('--storyboard');
const junitPath = getFlag('--junit');

if (!storyboardPath) {
  console.error('Usage: node scripts/check_storyboard.cjs --storyboard <path> [--junit <path>]');
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), storyboardPath), 'utf-8'));
const result = validateStoryboard(manifest);

if (junitPath) {
  const report = `<?xml version="1.0" encoding="UTF-8"?>\n<testsuite name="storyboard-contract" tests="1" failures="${
    result.valid ? 0 : 1
  }">\n  <testcase classname="storyboard" name="contract">${
    result.valid ? '' : `\n    <failure message="${result.errors.join('; ')}"/>\n`
  }  </testcase>\n</testsuite>`;
  fs.mkdirSync(path.dirname(junitPath), { recursive: true });
  fs.writeFileSync(junitPath, report);
}

if (!result.valid) {
  console.error('Storyboard contract violations:', result.errors.join('; '));
  process.exit(1);
}

console.log('Storyboard manifest validated successfully.');
