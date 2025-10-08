#!/usr/bin/env node
// scripts/demo-ingestion.js
// Demo script showing the ingestion pipeline in action

import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import fs from 'fs';

// Fix for __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('🚀 Mobius Games Tutorial Generator - Ingestion Pipeline Demo');
console.log('========================================================');

// Get DATA_DIR from environment variable or default to ./data
const dataDir = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const fixturesDir = path.join(dataDir, 'fixtures');

console.log(`📁 Using data directory: ${dataDir}`);

// Ensure directories exist
if (!fs.existsSync(dataDir)) {
  console.log('📂 Creating data directory...');
  fs.mkdirSync(dataDir, { recursive: true });
}

if (!fs.existsSync(fixturesDir)) {
  console.log('📂 Creating fixtures directory...');
  fs.mkdirSync(fixturesDir, { recursive: true });
}

// Demo the canonical data layout
console.log('\n📂 Canonical Data Layout:');
console.log(`   ${dataDir}/`);
console.log(`   ├── projects.db     (SQLite database)`);
console.log(`   ├── uploads/        (Uploaded PDFs)`);
console.log(`   ├── output/         (Generated content)`);
console.log(`   └── fixtures/       (Private test files)`);

// Demo environment variables
console.log('\n⚙️  Environment Variables:');
console.log('   DATA_DIR=./data');
console.log('   OPENAI_API_KEY=<your-key>');
console.log('   NODE_ENV=development');

// Demo commands
console.log('\n⚡ Run Commands:');
console.log('   Start server:');
console.log('   $ NODE_ENV=development DATA_DIR=./data OPENAI_API_KEY=<your-key> npm run server');
console.log('');
console.log('   Ingest PDF:');
console.log('   $ curl -F "file=@/path/to/rulebook.pdf" http://localhost:5001/api/ingest');
console.log('');
console.log('   Fetch BGG metadata:');
console.log('   $ curl -X POST http://localhost:5001/api/bgg \\');
console.log('        -H "Content-Type: application/json" \\');
console.log('        -d \'{"bggIdOrUrl": "https://boardgamegeek.com/boardgame/12345/game-name"}\'');

console.log('\n✅ Ingestion pipeline demo completed!');
console.log('📋 Next steps:');
console.log('   1. Place your rulebook PDFs in the data/fixtures directory');
console.log('   2. Run the server with the command above');
console.log('   3. Use the ingest endpoint to process your PDFs');
console.log('   4. Check the generated storyboard in the database');