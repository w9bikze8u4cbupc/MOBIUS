#!/usr/bin/env node
const fs = require('fs');

function usage() {
  console.error('Usage: node scripts/check_mobius_export.cjs --input <bundle.json> [--contract <schema.json>] [--junit <report.xml>]');
}

function writeJUnit(ok, msg, outfile) {
  if (!outfile) return;
  const failureBlock = ok
    ? ''
    : `<failure message="${msg.replace(/"/g, '&quot;')}"></failure>`;
  const xml = `<?xml version="1.0"?>
<testsuite name="mobius-export-contract" tests="1">
  <testcase name="mobius-export-validation">
    ${failureBlock}
  </testcase>
</testsuite>`;
  fs.writeFileSync(outfile, xml);
}

function fail(msg, junit) {
  console.error(msg);
  writeJUnit(false, msg, junit);
  process.exit(1);
}

function ok(junit) {
  console.log('Mobius export contract OK');
  writeJUnit(true, '', junit);
  process.exit(0);
}

function loadJson(path) {
  try {
    return JSON.parse(fs.readFileSync(path, 'utf8'));
  } catch (err) {
    throw new Error(`Unable to load JSON at ${path}: ${err.message}`);
  }
}

const args = process.argv.slice(2);
if (args.length === 0) {
  usage();
  process.exit(1);
}

function getArgValue(flag) {
  const idx = args.indexOf(flag);
  if (idx === -1 || idx + 1 >= args.length) return null;
  return args[idx + 1];
}

const input = getArgValue('--input');
const contract = getArgValue('--contract') || 'docs/spec/mobius_export_contract_v1.0.0.json';
const junit = getArgValue('--junit');

if (!input) {
  fail('Missing --input <file>', junit);
}

let data;
let spec;
try {
  data = loadJson(input);
  spec = loadJson(contract);
} catch (err) {
  fail(err.message, junit);
}

if (data.exportContractVersion !== spec.exportContractVersion) {
  fail('exportContractVersion mismatch', junit);
}

const requiredTop = [
  'project',
  'game',
  'ingestion',
  'storyboard',
  'subtitles',
  'audio',
  'motion',
  'render',
  'provenance'
];

for (const k of requiredTop) {
  if (typeof data[k] === 'undefined') {
    fail(`Missing top-level field: ${k}`, junit);
  }
}

const contracts = data.provenance && data.provenance.contracts;
if (!contracts) {
  fail('Missing provenance.contracts', junit);
}

function ensureMatch(label, observed, expected) {
  if (observed !== expected) {
    fail(`${label} mismatch`, junit);
  }
}

ensureMatch('Ingestion contractVersion', data.ingestion.contractVersion, contracts.ingestion);
ensureMatch('Storyboard contractVersion', data.storyboard.contractVersion, contracts.storyboard);
ensureMatch('Subtitle contractVersion', data.subtitles.contractVersion, contracts.subtitle);
ensureMatch('AudioMixing contractVersion', data.audio.contractVersion, contracts.audioMixing);
ensureMatch('Motion contractVersion', data.motion.contractVersion, contracts.motion);
ensureMatch('ARC version', data.render.arcVersion, contracts.arc);

if (!Array.isArray(data.storyboard.scenes) || data.storyboard.scenes.length === 0) {
  fail('Storyboard must contain at least one scene', junit);
}
if (!Array.isArray(data.subtitles.tracks) || data.subtitles.tracks.length === 0) {
  fail('Subtitles must contain at least one track', junit);
}
if (!Array.isArray(data.motion.motions)) {
  fail('motion.motions must be an array', junit);
}

if (!data.provenance.mobiusCommit || !data.provenance.generatedAt) {
  fail('Provenance must include mobiusCommit and generatedAt', junit);
}
if (!data.project.slug) {
  fail('Project slug is required', junit);
}

ok(junit);
