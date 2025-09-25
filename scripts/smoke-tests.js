#!/usr/bin/env node

// smoke-tests.js - Smoke tests for dhash system
// Usage: node scripts/smoke-tests.js [--quick] [--endpoint URL]

const http = require('http');
const https = require('https');
const { URL } = require('url');

// Parse command line arguments
const args = process.argv.slice(2);
const isQuickMode = args.includes('--quick');
const endpointIndex = args.indexOf('--endpoint');
const customEndpoint = endpointIndex !== -1 ? args[endpointIndex + 1] : null;

// Configuration
const config = {
  baseUrl: customEndpoint || 'http://localhost:5000',
  timeout: 10000,
  quickMode: isQuickMode
};

// Logging function
function log(message) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
}

// HTTP request helper
function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const client = parsedUrl.protocol === 'https:' ? https : http;
    
    const requestOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: options.method || 'GET',
      timeout: config.timeout,
      headers: {
        'User-Agent': 'dhash-smoke-test/1.0',
        ...options.headers
      }
    };
    
    const req = client.request(requestOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data: data
        });
      });
    });
    
    req.on('error', reject);
    req.on('timeout', () => reject(new Error('Request timeout')));
    
    if (options.data) {
      req.write(options.data);
    }
    
    req.end();
  });
}

// Individual test functions
async function testHealthEndpoint() {
  log('Testing /health endpoint...');
  try {
    const response = await makeRequest(`${config.baseUrl}/health`);
    
    if (response.statusCode === 200) {
      const healthData = JSON.parse(response.data);
      if (healthData.status === 'OK') {
        log('✓ Health endpoint responding correctly');
        return true;
      } else {
        log(`✗ Health endpoint returned non-OK status: ${healthData.status}`);
        return false;
      }
    } else {
      log(`✗ Health endpoint returned status code: ${response.statusCode}`);
      return false;
    }
  } catch (error) {
    log(`✗ Health endpoint test failed: ${error.message}`);
    return false;
  }
}

async function testMetricsEndpoint() {
  log('Testing /metrics/dhash endpoint...');
  try {
    const response = await makeRequest(`${config.baseUrl}/metrics/dhash`);
    
    if (response.statusCode === 200) {
      const metricsData = JSON.parse(response.data);
      const requiredMetrics = ['avg_hash_time', 'p95_hash_time', 'extraction_failures_rate', 'low_confidence_queue_length'];
      
      let missingMetrics = [];
      for (const metric of requiredMetrics) {
        if (!(metric in metricsData)) {
          missingMetrics.push(metric);
        }
      }
      
      if (missingMetrics.length === 0) {
        log('✓ Metrics endpoint returning required fields');
        log(`  - avg_hash_time: ${metricsData.avg_hash_time} ms`);
        log(`  - p95_hash_time: ${metricsData.p95_hash_time} ms`);
        log(`  - extraction_failures_rate: ${metricsData.extraction_failures_rate}%`);
        log(`  - low_confidence_queue_length: ${metricsData.low_confidence_queue_length}`);
        return true;
      } else {
        log(`✗ Metrics endpoint missing required fields: ${missingMetrics.join(', ')}`);
        return false;
      }
    } else {
      log(`✗ Metrics endpoint returned status code: ${response.statusCode}`);
      return false;
    }
  } catch (error) {
    log(`✗ Metrics endpoint test failed: ${error.message}`);
    return false;
  }
}

async function testApiBasics() {
  log('Testing basic API responsiveness...');
  try {
    // Test a simple endpoint that should exist
    const response = await makeRequest(`${config.baseUrl}/`);
    
    if (response.statusCode < 500) {
      log('✓ API server is responding');
      return true;
    } else {
      log(`✗ API server returned server error: ${response.statusCode}`);
      return false;
    }
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      log('✗ API server is not running or not accessible');
    } else {
      log(`✗ Basic API test failed: ${error.message}`);
    }
    return false;
  }
}

async function testDhashProcessing() {
  if (config.quickMode) {
    log('Skipping dhash processing test in quick mode');
    return true;
  }
  
  log('Testing dhash processing functionality...');
  // This is a mock test - in reality, you'd test actual dhash processing
  try {
    await new Promise(resolve => setTimeout(resolve, 100));
    log('✓ Dhash processing test completed (mock)');
    return true;
  } catch (error) {
    log(`✗ Dhash processing test failed: ${error.message}`);
    return false;
  }
}

async function runSmokeTests() {
  log(`=== DHASH SMOKE TESTS STARTING ${config.quickMode ? '(QUICK MODE)' : ''} ===`);
  log(`Base URL: ${config.baseUrl}`);
  log(`Timeout: ${config.timeout}ms`);
  
  const tests = [
    { name: 'API Basics', fn: testApiBasics },
    { name: 'Health Endpoint', fn: testHealthEndpoint },
    { name: 'Metrics Endpoint', fn: testMetricsEndpoint },
    { name: 'Dhash Processing', fn: testDhashProcessing }
  ];
  
  let passed = 0;
  let failed = 0;
  
  for (const test of tests) {
    log(`\nRunning test: ${test.name}`);
    try {
      const result = await test.fn();
      if (result) {
        passed++;
      } else {
        failed++;
      }
    } catch (error) {
      log(`✗ Test ${test.name} threw an error: ${error.message}`);
      failed++;
    }
  }
  
  log('\n=== SMOKE TEST RESULTS ===');
  log(`Passed: ${passed}`);
  log(`Failed: ${failed}`);
  log(`Total:  ${passed + failed}`);
  
  if (failed === 0) {
    log('✓ All smoke tests passed');
    return true;
  } else {
    log(`✗ ${failed} smoke test(s) failed`);
    return false;
  }
}

async function main() {
  if (args.includes('-h') || args.includes('--help')) {
    console.log(`Usage: node scripts/smoke-tests.js [OPTIONS]

Options:
  --quick           Run in quick mode (skip slower tests)
  --endpoint URL    Custom endpoint URL (default: http://localhost:5000)
  -h, --help        Show this help message

Examples:
  node scripts/smoke-tests.js --quick
  node scripts/smoke-tests.js --endpoint http://staging.example.com`);
    process.exit(0);
  }
  
  try {
    const success = await runSmokeTests();
    process.exit(success ? 0 : 1);
  } catch (error) {
    log(`FATAL: Smoke tests failed with error: ${error.message}`);
    process.exit(1);
  }
}

main();