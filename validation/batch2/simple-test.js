#!/usr/bin/env node

/**
 * Simple Test Script for Batch 2 Execution
 * Tests key endpoints directly
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Config
const API_BASE_URL = process.env.MOBIUS_API_URL || 'http://localhost:5001';
const LOGS_DIR = path.join(__dirname, 'logs');

console.log('=== Simple Test Script ===');
console.log(`API Base URL: ${API_BASE_URL}`);
console.log(`Logs Directory: ${LOGS_DIR}`);
console.log('---');

// Ensure logs directory exists
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

/**
 * Make API call
 */
async function apiCall(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`;
  console.log(`Making API call to: ${url}`);
  
  try {
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
      },
      ...options
    });
    
    let data;
    try {
      data = await response.json();
    } catch (e) {
      data = await response.text();
    }
    
    console.log(`Response status: ${response.status}`);
    return { status: response.status, data };
  } catch (error) {
    console.error(`API call failed: ${error.message}`);
    return { status: 0, error: error.message };
  }
}

/**
 * Save result to file
 */
function saveResult(filename, data) {
  const filepath = path.join(LOGS_DIR, filename);
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
  console.log(`Result saved to: ${filepath}`);
  return filepath;
}

/**
 * Test health endpoint
 */
async function testHealth() {
  console.log('\n--- Testing Health Endpoint ---');
  const result = await apiCall('/health');
  saveResult('health_test.json', result);
  return result;
}

/**
 * Test BGG endpoint
 */
async function testBGG() {
  console.log('\n--- Testing BGG Endpoint ---');
  const result = await apiCall('/api/ingest/bgg?url=https://boardgamegeek.com/boardgame/13/catan');
  saveResult('bgg_test.json', result);
  return result;
}

/**
 * Test ingest endpoint
 */
async function testIngest() {
  console.log('\n--- Testing Ingest Endpoint ---');
  const result = await apiCall('/api/ingest', {
    method: 'POST',
    body: JSON.stringify({
      projectName: 'test-batch2-project',
      language: 'en-US'
    })
  });
  saveResult('ingest_test.json', result);
  return result;
}

/**
 * Test assets endpoint
 */
async function testAssets() {
  console.log('\n--- Testing Assets Endpoint ---');
  const result = await apiCall('/api/assets', {
    method: 'POST',
    body: JSON.stringify({
      projectId: 'test-project-id',
      type: 'board',
      filename: 'test-board.png'
    })
  });
  saveResult('assets_test.json', result);
  return result;
}

/**
 * Main execution
 */
async function main() {
  console.log('Starting Simple Tests...\n');
  
  try {
    // Test health endpoint
    const healthResult = await testHealth();
    console.log('Health test result:', JSON.stringify(healthResult, null, 2));
    
    // Test BGG endpoint
    const bggResult = await testBGG();
    console.log('BGG test result:', JSON.stringify(bggResult, null, 2));
    
    // Test ingest endpoint
    const ingestResult = await testIngest();
    console.log('Ingest test result:', JSON.stringify(ingestResult, null, 2));
    
    // Test assets endpoint
    const assetsResult = await testAssets();
    console.log('Assets test result:', JSON.stringify(assetsResult, null, 2));
    
    // Create summary
    const summary = {
      timestamp: new Date().toISOString(),
      tests: {
        health: healthResult,
        bgg: bggResult,
        ingest: ingestResult,
        assets: assetsResult
      },
      status: 'COMPLETED'
    };
    
    const summaryPath = path.join(__dirname, 'SIMPLE_TEST_SUMMARY.json');
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
    console.log(`\nSimple test summary saved to: ${summaryPath}`);
    
    console.log('\n=== Simple Tests COMPLETED ===');
    
    return summary;
    
  } catch (error) {
    console.error('\n❌ Simple Tests FAILED:', error.message);
    
    const errorSummary = {
      timestamp: new Date().toISOString(),
      status: 'FAILED',
      error: {
        message: error.message,
        stack: error.stack
      }
    };
    
    const errorPath = path.join(__dirname, 'SIMPLE_TEST_ERROR.json');
    fs.writeFileSync(errorPath, JSON.stringify(errorSummary, null, 2));
    console.log(`Error summary saved to: ${errorPath}`);
    
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { testHealth, testBGG, testIngest, testAssets, main };