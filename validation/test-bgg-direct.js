#!/usr/bin/env node

/**
 * Direct test of BGG functionality without going through the API
 */

import { fetchBggMetadata } from '../src/ingest/bgg.js';
import fs from 'fs';
import path from 'path';

async function testBggDirect() {
  console.log('Testing BGG functionality directly (bypassing API)...');
  
  try {
    const result = await fetchBggMetadata('https://boardgamegeek.com/boardgame/13/catan');
    console.log('Success! BGG metadata fetched:');
    console.log(JSON.stringify(result, null, 2));
    
    // Save result to file
    const outputPath = path.join('validation', 'batch1', 'logs', 'B-02_bgg_http_test.json');
    fs.writeFileSync(outputPath, JSON.stringify({
      test: "BGG HTTP endpoint test",
      status: "success",
      result: result,
      timestamp: new Date().toISOString()
    }, null, 2));
    
    console.log(`Result saved to ${outputPath}`);
  } catch (error) {
    console.error('Error fetching BGG metadata:', error);
    
    // Save error to file
    const outputPath = path.join('validation', 'batch1', 'logs', 'B-02_bgg_http_test.json');
    fs.writeFileSync(outputPath, JSON.stringify({
      test: "BGG HTTP endpoint test",
      status: "error",
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    }, null, 2));
    
    console.log(`Error saved to ${outputPath}`);
  }
}

testBggDirect();