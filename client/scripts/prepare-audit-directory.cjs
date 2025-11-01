#!/usr/bin/env node
const { mkdirSync } = require('fs');
const { resolve } = require('path');

const target = resolve(process.cwd(), 'audit-reports');

try {
  mkdirSync(target, { recursive: true });
  // eslint-disable-next-line no-console
  console.log(`[audit] ensuring directory exists: ${target}`);
} catch (error) {
  // eslint-disable-next-line no-console
  console.error('[audit] failed to create report directory', error);
  process.exitCode = 1;
}
