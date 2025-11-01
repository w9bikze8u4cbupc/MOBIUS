#!/usr/bin/env node
const { existsSync, readFileSync, writeFileSync } = require('fs');
const { resolve } = require('path');

const auditDir = resolve(process.cwd(), 'audit-reports');
const files = [
  { name: 'Dual-language rendering', file: 'dual-language.json' },
  { name: 'Accessibility (keyboard & ARIA)', file: 'accessibility.json' },
];

const lines = ['# Frontend Audit Summary', '', `Generated: ${new Date().toISOString()}`, ''];

for (const entry of files) {
  const target = resolve(auditDir, entry.file);
  if (!existsSync(target)) {
    lines.push(`## ${entry.name}`, '', '_No report found. Run the associated audit script first._', '');
    continue;
  }

  try {
    const payload = JSON.parse(readFileSync(target, 'utf-8'));
    const success = payload.success ?? payload.numFailedTests === 0;
    const passed = payload.numPassedTests ?? 0;
    const failed = payload.numFailedTests ?? 0;
    lines.push(`## ${entry.name}`, '', `- Status: ${success ? '✅ Pass' : '❌ Fail'}`, `- Passed tests: ${passed}`, `- Failed tests: ${failed}`, '');
  } catch (error) {
    lines.push(`## ${entry.name}`, '', `Unable to parse report: ${error.message}`, '');
  }
}

const outPath = resolve(process.cwd(), 'docs', 'frontend-audit-summary.md');
writeFileSync(outPath, `${lines.join('\n')}\n`);
// eslint-disable-next-line no-console
console.log(`[audit] wrote summary to ${outPath}`);
