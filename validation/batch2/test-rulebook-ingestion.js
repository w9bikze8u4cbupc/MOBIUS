#!/usr/bin/env node

/**
 * Test script for Batch 2 - Rulebook Ingestion
 * Tests Section C: Rulebook ingestion functionality
 */

import { fetchBGGMetadata } from '../tools/api-validation-harness.js';
import fs from 'fs';
import path from 'path';

console.log('=== Batch 2 - Rulebook Ingestion Test ===');

async function testRulebookIngestion() {
  try {
    console.log('\n1. Testing BGG metadata fetch (as part of ingestion workflow)...');
    
    // Test BGG metadata fetch
    const bggResult = await fetchBGGMetadata('https://boardgamegeek.com/boardgame/13/catan');
    console.log('BGG metadata test result status:', bggResult.status);
    
    // Save result to logs
    const logDir = path.join('validation', 'batch2', 'logs');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    
    const bggLogPath = path.join('validation', 'batch2', 'logs', 'C-02_bgg_during_ingestion_test.json');
    fs.writeFileSync(bggLogPath, JSON.stringify({
      test: 'C-02: Fetch BGG metadata during ingestion',
      timestamp: new Date().toISOString(),
      result: bggResult
    }, null, 2));
    console.log(`Result saved to ${bggLogPath}`);
    
    console.log('\n=== Batch 2 Test Phase Complete ===');
    console.log('Next steps:');
    console.log('1. Verify API responses in validation/batch2/logs/');
    console.log('2. Check database for stored components');
    console.log('3. Continue with visual assets testing');
    
  } catch (error) {
    console.error('Error during rulebook ingestion test:', error);
    
    // Save error to logs
    const logDir = path.join('validation', 'batch2', 'logs');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    
    const errorLogPath = path.join('validation', 'batch2', 'logs', 'batch2_error.json');
    fs.writeFileSync(errorLogPath, JSON.stringify({
      test: 'Batch 2 Error',
      timestamp: new Date().toISOString(),
      error: error.message,
      stack: error.stack
    }, null, 2));
    console.log(`Error saved to ${errorLogPath}`);
  }
}

// Run the test
testRulebookIngestion();