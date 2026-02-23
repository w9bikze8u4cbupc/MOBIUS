#!/usr/bin/env node
// scripts/elite/normalize-contract.mjs
// Normalize Elite contract: sort rules by ID, format with 2-space indent

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, '../..');

const CONTRACT_PATH = join(REPO_ROOT, 'config/elite/MOBIUS_ELITE_VIDEO_STANDARD_v1.json');

console.log('Normalizing Elite contract...');
console.log(`  Path: ${CONTRACT_PATH}`);

// Load contract
const contract = JSON.parse(readFileSync(CONTRACT_PATH, 'utf8'));

// Sort rules by ID (lexicographic)
contract.rules.sort((a, b) => a.id.localeCompare(b.id));

// Write back with 2-space indentation
writeFileSync(CONTRACT_PATH, JSON.stringify(contract, null, 2) + '\n', 'utf8');

console.log('✅ Contract normalized:');
console.log(`  - Rules sorted by ID (${contract.rules.length} rules)`);
console.log(`  - Formatted with 2-space indentation`);
console.log('');
console.log('Run tests to verify: npm run test:elite-contract');
