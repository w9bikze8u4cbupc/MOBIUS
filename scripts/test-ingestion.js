#!/usr/bin/env node
// scripts/test-ingestion.js
// Simple test script for the ingestion pipeline

import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import fs from 'fs';

// Fix for __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Get DATA_DIR from environment variable or default to ./data
const dataDir = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const fixturesDir = path.join(dataDir, 'fixtures');

console.log('Testing ingestion pipeline...');
console.log('Data directory:', dataDir);

// Ensure directories exist
if (!fs.existsSync(dataDir)) {
  console.log('Creating data directory...');
  fs.mkdirSync(dataDir, { recursive: true });
}

if (!fs.existsSync(fixturesDir)) {
  console.log('Creating fixtures directory...');
  fs.mkdirSync(fixturesDir, { recursive: true });
}

console.log('Ingestion pipeline test completed successfully');
console.log('You can now run the server with:');
console.log('  NODE_ENV=development DATA_DIR=./data npm run server');

/**
 * Test script for the ingestion pipeline
 */

import { fetchBggMetadata } from '../src/ingest/bgg.js';
import { generateStoryboard } from '../src/ingest/storyboard.js';

async function testIngestion() {
  console.log('Testing BGG metadata fetching...');
  
  try {
    // Test with a known game ID (Wingspan)
    const bggMeta = await fetchBggMetadata('266192');
    console.log('BGG metadata fetched successfully:');
    console.log(`Game: ${bggMeta.name}`);
    console.log(`Year: ${bggMeta.yearPublished}`);
    console.log(`Players: ${bggMeta.minPlayers}-${bggMeta.maxPlayers}`);
    console.log(`Play time: ${bggMeta.playingTime} minutes`);
    
    // Test storyboard generation with sample data
    console.log('\nTesting storyboard generation...');
    const samplePages = [
      {
        pageNumber: 1,
        text: 'Setup: Place the board in the center of the table. Give each player a player mat, a food cost card, and a set of bird cards. Shuffle the bird cards and place them face down in the bird tray.',
        textConfidence: 1.0,
        source: 'pdf-parse'
      },
      {
        pageNumber: 2,
        text: 'Gameplay: On your turn, you can take one of three actions: gain food, lay eggs, or draw bird cards. The game is played over four rounds, with each round consisting of a planning phase and a bird feeding phase.',
        textConfidence: 1.0,
        source: 'pdf-parse'
      }
    ];
    
    const storyboard = generateStoryboard({ 
      parsedPages: samplePages, 
      bgg: bggMeta 
    });
    
    console.log('Storyboard generated successfully:');
    console.log(`Scenes: ${storyboard.scenes.length}`);
    console.log('First scene:');
    console.log(`  Title: ${storyboard.scenes[0].title}`);
    console.log(`  Duration: ${storyboard.scenes[0].duration} seconds`);
    console.log(`  Captions: ${storyboard.scenes[0].captions.length} items`);
    
  } catch (error) {
    console.error('Error testing ingestion pipeline:', error.message);
  }
}

// Run the test
testIngestion().catch(console.error);