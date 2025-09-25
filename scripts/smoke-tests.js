#!/usr/bin/env node

/**
 * MOBIUS Comprehensive Smoke Tests
 * Tests critical application functionality
 * Usage: node scripts/smoke-tests.js [--quick] [--endpoint URL]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = path.join(__dirname, '..');

// Test configuration
const DEFAULT_CONFIG = {
  baseUrl: 'http://localhost:5001',
  timeout: 30000, // 30 seconds
  quick: false,
  verbose: false
};

let config = { ...DEFAULT_CONFIG };
let testResults = {
  passed: 0,
  failed: 0,
  skipped: 0,
  total: 0,
  details: []
};

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--quick':
        config.quick = true;
        break;
      case '--endpoint':
        config.baseUrl = args[++i];
        break;
      case '--timeout':
        config.timeout = parseInt(args[++i]);
        break;
      case '--verbose':
        config.verbose = true;
        break;
      case '--help':
        console.log('Usage: node scripts/smoke-tests.js [OPTIONS]');
        console.log('');
        console.log('Options:');
        console.log('  --quick             Run quick tests only (skip file processing tests)');
        console.log('  --endpoint URL      Base URL for API tests (default: http://localhost:5001)');
        console.log('  --timeout MS        Request timeout in milliseconds (default: 30000)');
        console.log('  --verbose           Enable verbose output');
        console.log('  --help              Show this help message');
        console.log('');
        console.log('Examples:');
        console.log('  node scripts/smoke-tests.js --quick');
        console.log('  node scripts/smoke-tests.js --endpoint http://localhost:5000');
        process.exit(0);
      default:
        console.error(`Unknown option: ${args[i]}`);
        process.exit(1);
    }
  }
}

// Test helper functions
function logTest(name, status, details = '', duration = null) {
  testResults.total++;
  
  const durationStr = duration ? ` (${duration}ms)` : '';
  
  switch (status) {
    case 'pass':
      testResults.passed++;
      console.log(`✅ ${name}${durationStr}`);
      break;
    case 'fail':
      testResults.failed++;
      console.log(`❌ ${name}${durationStr}${details ? ': ' + details : ''}`);
      break;
    case 'skip':
      testResults.skipped++;
      console.log(`⏭️  ${name} (SKIPPED)`);
      break;
  }
  
  testResults.details.push({ name, status, details, duration });
}

// HTTP request helper
async function httpRequest(url, options = {}) {
  const startTime = Date.now();
  
  try {
    // Use dynamic import for node-fetch or build a simple fetch with http
    const response = await fetch(url, {
      timeout: config.timeout,
      ...options
    });
    
    const duration = Date.now() - startTime;
    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
      json: async () => await response.json(),
      text: async () => await response.text(),
      duration
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    return {
      ok: false,
      error: error.message,
      duration
    };
  }
}

// Alternative HTTP request using Node.js built-ins
function simpleHttpRequest(url, options = {}) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const urlObj = new URL(url);
    const http = urlObj.protocol === 'https:' ? require('https') : require('http');
    
    const req = http.request({
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: options.headers || {},
      timeout: config.timeout
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const duration = Date.now() - startTime;
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          statusText: res.statusMessage,
          headers: res.headers,
          text: () => Promise.resolve(data),
          json: () => Promise.resolve(JSON.parse(data)),
          duration
        });
      });
    });
    
    req.on('error', (error) => {
      const duration = Date.now() - startTime;
      resolve({
        ok: false,
        error: error.message,
        duration
      });
    });
    
    req.on('timeout', () => {
      req.destroy();
      const duration = Date.now() - startTime;
      resolve({
        ok: false,
        error: 'Request timeout',
        duration
      });
    });
    
    if (options.body) {
      req.write(options.body);
    }
    
    req.end();
  });
}

// Test 1: Health endpoint
async function testHealthEndpoint() {
  try {
    const response = await simpleHttpRequest(`${config.baseUrl}/health`);
    
    if (!response.ok) {
      logTest('Health endpoint availability', 'fail', 
        `HTTP ${response.status}: ${response.error || response.statusText}`, 
        response.duration);
      return false;
    }
    
    const healthData = await response.json();
    
    if (healthData.status === 'healthy') {
      logTest('Health endpoint functionality', 'pass', '', response.duration);
      
      if (config.verbose) {
        console.log('   Health data:', JSON.stringify(healthData, null, 2));
      }
      
      return true;
    } else {
      logTest('Health endpoint functionality', 'fail', 
        `Status: ${healthData.status}`, response.duration);
      return false;
    }
  } catch (error) {
    logTest('Health endpoint availability', 'fail', error.message);
    return false;
  }
}

// Test 2: Metrics endpoint
async function testMetricsEndpoint() {
  try {
    const response = await simpleHttpRequest(`${config.baseUrl}/metrics`);
    
    if (!response.ok) {
      logTest('Metrics endpoint availability', 'fail', 
        `HTTP ${response.status}: ${response.error || response.statusText}`, 
        response.duration);
      return false;
    }
    
    const metricsText = await response.text();
    
    // Check if it looks like Prometheus metrics
    if (metricsText.includes('# HELP') && metricsText.includes('# TYPE')) {
      logTest('Metrics endpoint functionality', 'pass', '', response.duration);
      return true;
    } else {
      logTest('Metrics endpoint functionality', 'fail', 
        'Invalid metrics format', response.duration);
      return false;
    }
  } catch (error) {
    logTest('Metrics endpoint availability', 'fail', error.message);
    return false;
  }
}

// Test 3: File system permissions
async function testFileSystemPermissions() {
  const testPaths = [
    path.join(projectRoot, 'logs'),
    path.join(projectRoot, 'src', 'api', 'uploads'),
    path.join(projectRoot, 'backups')
  ];

  let allPassed = true;

  for (const testPath of testPaths) {
    try {
      // Ensure directory exists
      if (!fs.existsSync(testPath)) {
        fs.mkdirSync(testPath, { recursive: true });
      }

      // Test write permissions
      const testFile = path.join(testPath, '.smoke-test');
      fs.writeFileSync(testFile, 'test');
      fs.unlinkSync(testFile);

      logTest(`File system: ${path.relative(projectRoot, testPath)}`, 'pass');
    } catch (error) {
      logTest(`File system: ${path.relative(projectRoot, testPath)}`, 'fail', error.message);
      allPassed = false;
    }
  }

  return allPassed;
}

// Test 4: Required files existence
async function testRequiredFiles() {
  const requiredFiles = [
    'package.json',
    'src/api/index.js',
    'src/utils/logger.js',
    'src/utils/metrics.js',
    'scripts/backup_library.sh',
    'scripts/deploy_dhash.sh',
    'scripts/rollback_dhash.sh'
  ];

  let allPassed = true;

  for (const file of requiredFiles) {
    const filePath = path.join(projectRoot, file);
    
    if (fs.existsSync(filePath)) {
      logTest(`Required file: ${file}`, 'pass');
    } else {
      logTest(`Required file: ${file}`, 'fail', 'File not found');
      allPassed = false;
    }
  }

  return allPassed;
}

// Test 5: Dependencies check
async function testDependencies() {
  try {
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8')
    );

    const criticalDeps = ['winston', 'winston-daily-rotate-file', 'prom-client'];
    let allFound = true;

    for (const dep of criticalDeps) {
      if (packageJson.dependencies[dep] || packageJson.devDependencies[dep]) {
        logTest(`Dependency: ${dep}`, 'pass');
      } else {
        logTest(`Dependency: ${dep}`, 'fail', 'Not found in package.json');
        allFound = false;
      }
    }

    return allFound;
  } catch (error) {
    logTest('Dependencies check', 'fail', error.message);
    return false;
  }
}

// Test 6: Process management
async function testProcessManagement() {
  try {
    // Check if we can find Node.js processes
    const processes = await new Promise((resolve) => {
      const ps = spawn('ps', ['aux']);
      let output = '';
      
      ps.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      ps.on('close', () => {
        resolve(output);
      });
      
      ps.on('error', () => {
        resolve('');
      });
    });

    if (processes.includes('node')) {
      logTest('Process visibility', 'pass');
      return true;
    } else {
      logTest('Process visibility', 'skip', 'Cannot detect Node.js processes');
      return true; // Not a critical failure
    }
  } catch (error) {
    logTest('Process management', 'fail', error.message);
    return false;
  }
}

// Test 7: Logging functionality (if not quick)
async function testLoggingFunctionality() {
  if (config.quick) {
    logTest('Logging functionality', 'skip', 'Quick mode enabled');
    return true;
  }

  try {
    // Import and run the logging test
    const { default: runLoggingTests } = await import('./test_logging.js');
    
    console.log('   Running detailed logging tests...');
    const loggingTestsPass = await runLoggingTests();
    
    if (loggingTestsPass) {
      logTest('Logging functionality', 'pass');
      return true;
    } else {
      logTest('Logging functionality', 'fail', 'Detailed logging tests failed');
      return false;
    }
  } catch (error) {
    logTest('Logging functionality', 'fail', error.message);
    return false;
  }
}

// Test 8: API endpoints (basic)
async function testApiEndpoints() {
  const endpoints = [
    { path: '/health', expectedStatus: 200 },
    { path: '/metrics', expectedStatus: 200 }
  ];

  let allPassed = true;

  for (const endpoint of endpoints) {
    try {
      const response = await simpleHttpRequest(`${config.baseUrl}${endpoint.path}`);
      
      if (response.status === endpoint.expectedStatus) {
        logTest(`API endpoint: ${endpoint.path}`, 'pass', '', response.duration);
      } else {
        logTest(`API endpoint: ${endpoint.path}`, 'fail', 
          `Expected ${endpoint.expectedStatus}, got ${response.status}`, response.duration);
        allPassed = false;
      }
    } catch (error) {
      logTest(`API endpoint: ${endpoint.path}`, 'fail', error.message);
      allPassed = false;
    }
  }

  return allPassed;
}

// Main test execution
async function runSmokeTests() {
  console.log('🧪 MOBIUS Comprehensive Smoke Tests');
  console.log('====================================');
  console.log(`   Base URL: ${config.baseUrl}`);
  console.log(`   Quick mode: ${config.quick}`);
  console.log(`   Timeout: ${config.timeout}ms`);
  console.log('');

  const startTime = Date.now();

  // Run tests in sequence
  const tests = [
    { name: 'Health Endpoint', fn: testHealthEndpoint },
    { name: 'Metrics Endpoint', fn: testMetricsEndpoint },
    { name: 'File System Permissions', fn: testFileSystemPermissions },
    { name: 'Required Files', fn: testRequiredFiles },
    { name: 'Dependencies', fn: testDependencies },
    { name: 'Process Management', fn: testProcessManagement },
    { name: 'Logging Functionality', fn: testLoggingFunctionality },
    { name: 'API Endpoints', fn: testApiEndpoints }
  ];

  let criticalFailures = 0;

  for (const test of tests) {
    console.log(`\n🔍 ${test.name}:`);
    
    try {
      const testPassed = await test.fn();
      if (!testPassed && ['Health Endpoint', 'Required Files', 'Dependencies'].includes(test.name)) {
        criticalFailures++;
      }
    } catch (error) {
      logTest(test.name, 'fail', `Test execution failed: ${error.message}`);
      criticalFailures++;
    }
  }

  const endTime = Date.now();
  const duration = endTime - startTime;

  console.log('\n');
  console.log('====================================');
  console.log('🏁 Smoke Test Results Summary');
  console.log('====================================');
  console.log(`📊 Total tests: ${testResults.total}`);
  console.log(`✅ Passed: ${testResults.passed}`);
  console.log(`❌ Failed: ${testResults.failed}`);
  console.log(`⏭️  Skipped: ${testResults.skipped}`);
  console.log(`🚨 Critical failures: ${criticalFailures}`);
  console.log(`⏱️  Duration: ${Math.round(duration / 1000)}s`);
  console.log('');

  const success = testResults.failed === 0 && criticalFailures === 0;
  
  if (success) {
    console.log('🎉 All smoke tests passed!');
    console.log('');
    console.log('✅ Application appears to be healthy and ready for use:');
    console.log('   • Health and metrics endpoints responding');
    console.log('   • File system permissions correct');
    console.log('   • Required files present');
    console.log('   • Dependencies available');
    console.log('   • Logging system functional');
  } else {
    console.log('💥 Some smoke tests failed!');
    console.log('');
    
    if (criticalFailures > 0) {
      console.log('🚨 CRITICAL FAILURES DETECTED:');
      testResults.details
        .filter(test => test.status === 'fail')
        .forEach(test => console.log(`   ❌ ${test.name}: ${test.details || 'Failed'}`));
      console.log('');
      console.log('   Fix critical issues before using in production!');
    } else {
      console.log('⚠️  Non-critical issues detected. Review and fix if needed.');
    }
  }

  return success && criticalFailures === 0;
}

// Handle script being run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  parseArgs();
  
  runSmokeTests()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('💥 Smoke test runner failed:', error.message);
      process.exit(1);
    });
}

export default runSmokeTests;