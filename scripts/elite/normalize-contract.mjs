#!/usr/bin/env node
// scripts/elite/normalize-contract.mjs
// Normalize Elite contract: sort rules by ID, format with 2-space indent
// Supports --check mode for CI validation (non-destructive)

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, '../..');

const CONTRACT_PATH = join(REPO_ROOT, 'config/elite/MOBIUS_ELITE_VIDEO_STANDARD_v1.json');

// Parse CLI args
const args = process.argv.slice(2);
const checkMode = args.includes('--check');

if (checkMode) {
  console.log('Checking Elite contract formatting...');
} else {
  console.log('Normalizing Elite contract...');
}
console.log(`  Path: ${CONTRACT_PATH}`);

// Load contract
const rawContent = readFileSync(CONTRACT_PATH, 'utf8');
const contract = JSON.parse(rawContent);

// Sort rules by ID (lexicographic)
contract.rules.sort((a, b) => a.id.localeCompare(b.id));

// Generate normalized content
const normalizedContent = JSON.stringify(contract, null, 2) + '\n';

// Check mode: compare without writing
if (checkMode) {
  if (rawContent === normalizedContent) {
    console.log('✅ Contract is properly formatted');
    console.log(`  - Rules sorted by ID (${contract.rules.length} rules)`);
    console.log(`  - 2-space indentation`);
    process.exit(0);
  } else {
    console.error('❌ Contract formatting differs from canonical format');
    console.error('');
    console.error('Run to fix: npm run elite:normalize');
    process.exit(1);
  }
}

// Write mode: update file
writeFileSync(CONTRACT_PATH, normalizedContent, 'utf8');

console.log('✅ Contract normalized:');
console.log(`  - Rules sorted by ID (${contract.rules.length} rules)`);
console.log(`  - Formatted with 2-space indentation`);
console.log('');
console.log('Run tests to verify: npm run test:elite-contract');
