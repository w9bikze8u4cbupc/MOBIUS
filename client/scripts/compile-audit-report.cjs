#!/usr/bin/env node

const { existsSync, readFileSync, writeFileSync, mkdirSync } = require('fs');
const { resolve } = require('path');

const REPORTS_DIR = resolve(process.cwd(), 'reports');
const OUTPUT_DIR = resolve(process.cwd(), 'docs');
const OUTPUT_FILE = resolve(OUTPUT_DIR, 'frontend-audit-summary.md');

function readJsonReport(filename) {
  const filePath = resolve(REPORTS_DIR, filename);
  if (!existsSync(filePath)) {
    return { status: 'missing', summary: `Report not found: ${filename}` };
  }

  try {
    const contents = readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(contents);
    const status = parsed.status || (parsed.passed ? 'passed' : 'failed');
    const detail = parsed.summary || parsed.message || 'No additional details provided.';
    return { status, summary: detail };
  } catch (err) {
    return { status: 'error', summary: `Unable to parse ${filename}: ${err.message}` };
  }
}

function buildSummary() {
  const sections = [];
  sections.push('# Frontend audit summary');
  sections.push('');

  const rendering = readJsonReport('rendering-audit.json');
  sections.push(`- Rendering audit: ${rendering.status}`);
  sections.push(`  - ${rendering.summary}`);
  sections.push('');

  const accessibility = readJsonReport('accessibility-audit.json');
  sections.push(`- Accessibility audit: ${accessibility.status}`);
  sections.push(`  - ${accessibility.summary}`);
  sections.push('');

  sections.push(`_Generated on: ${new Date().toISOString()}_`);

  return sections.join('\n');
}

function ensureOutputDir() {
  mkdirSync(OUTPUT_DIR, { recursive: true });
}

function main() {
  ensureOutputDir();
  const summary = buildSummary();
  writeFileSync(OUTPUT_FILE, `${summary}\n`);
  console.log(`Wrote audit summary to ${OUTPUT_FILE}`);
}

if (require.main === module) {
  main();
}

module.exports = {
  buildSummary,
};
