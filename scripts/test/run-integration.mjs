#!/usr/bin/env node
// scripts/test/run-integration.mjs
// Wrapper to run integration tests with required environment variables

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '../..');

// Set environment variables
process.env.NODE_ENV = 'test';
process.env.SKIP_LEGACY_CHECK = 'true';

// Run integration tests
const testProcess = spawn(
  'node',
  ['--test', 'tests/integration/hephaestus-extract.node.test.mjs'],
  {
    cwd: projectRoot,
    stdio: 'inherit',
    env: process.env
  }
);

testProcess.on('exit', (code) => {
  process.exit(code);
});
