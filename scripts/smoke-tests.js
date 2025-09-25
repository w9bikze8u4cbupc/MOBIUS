#!/usr/bin/env node
// scripts/smoke-tests.js - Post-deploy smoke tests
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

// Configuration
const config = {
  mode: 'full', // 'quick' or 'full'
  timeout: 30000, // 30 seconds
  healthUrl: process.env.HEALTH_URL || 'http://localhost:5001/health',
  metricsUrl: process.env.METRICS_URL || 'http://localhost:5001/metrics/dhash',
  apiBaseUrl: process.env.API_BASE_URL || 'http://localhost:5001/api',
  verbose: false,
  logFile: null
};

// Logging function
function log(level, ...args) {
  const timestamp = new Date().toISOString();
  const message = `[${timestamp}] [${level}] ${args.join(' ')}`;
  console.log(message);
  
  if (config.logFile) {
    fs.appendFileSync(config.logFile, message + '\n');
  }
}

// Help text
function showHelp() {
  console.log(`
Usage: node scripts/smoke-tests.js [options]

Run smoke tests to verify application health after deployment.

Options:
  --quick            Run quick smoke tests only (default: full suite)
  --full             Run full smoke test suite
  --timeout MS       Request timeout in milliseconds (default: 30000)
  --health-url URL   Health check endpoint URL
  --metrics-url URL  Metrics endpoint URL
  --api-url URL      API base URL for testing
  --verbose          Enable verbose logging
  --log-file PATH    Write test results to specified file
  --help             Show this help

Examples:
  node scripts/smoke-tests.js --quick
  node scripts/smoke-tests.js --full --verbose
  node scripts/smoke-tests.js --health-url http://staging:5001/health

Environment variables:
  HEALTH_URL         Health check endpoint (default: http://localhost:5001/health)
  METRICS_URL        Metrics endpoint (default: http://localhost:5001/metrics/dhash)
  API_BASE_URL       API base URL (default: http://localhost:5001/api)
`);
}

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--quick':
        config.mode = 'quick';
        break;
      case '--full':
        config.mode = 'full';
        break;
      case '--timeout':
        config.timeout = parseInt(args[++i], 10);
        if (isNaN(config.timeout) || config.timeout < 1000) {
          log('ERROR', 'Timeout must be at least 1000ms');
          process.exit(1);
        }
        break;
      case '--health-url':
        config.healthUrl = args[++i];
        break;
      case '--metrics-url':
        config.metricsUrl = args[++i];
        break;
      case '--api-url':
        config.apiBaseUrl = args[++i];
        break;
      case '--verbose':
        config.verbose = true;
        break;
      case '--log-file':
        config.logFile = args[++i];
        break;
      case '--help':
        showHelp();
        process.exit(0);
        break;
      default:
        log('ERROR', `Unknown option: ${args[i]}`);
        showHelp();
        process.exit(1);
    }
  }
}

// Test results tracking
const testResults = {
  timestamp: new Date().toISOString(),
  mode: config.mode,
  tests: [],
  passed: 0,
  failed: 0,
  duration: 0,
  endpoints: {
    health: config.healthUrl,
    metrics: config.metricsUrl,
    api: config.apiBaseUrl
  }
};

// Add test result
function addTestResult(name, passed, message = '', details = {}) {
  const result = {
    name,
    passed,
    message,
    details,
    timestamp: new Date().toISOString()
  };
  
  testResults.tests.push(result);
  
  if (passed) {
    testResults.passed++;
    log('INFO', `✓ ${name}: ${message}`);
  } else {
    testResults.failed++;
    log('ERROR', `✗ ${name}: ${message}`);
  }
  
  if (config.verbose && Object.keys(details).length > 0) {
    log('DEBUG', `Details: ${JSON.stringify(details, null, 2)}`);
  }
}

// HTTP request helper
function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const requestModule = url.startsWith('https:') ? https : http;
    
    const requestOptions = {
      timeout: config.timeout,
      headers: {
        'User-Agent': 'MOBIUS-SmokeTest/1.0',
        ...options.headers
      }
    };
    
    if (options.method) {
      requestOptions.method = options.method;
    }
    
    const startTime = Date.now();
    
    const req = requestModule.request(url, requestOptions, (res) => {
      let data = '';
      
      res.on('data', chunk => {
        data += chunk;
      });
      
      res.on('end', () => {
        const duration = Date.now() - startTime;
        
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data,
          duration
        });
      });
    });
    
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Request timeout after ${config.timeout}ms`));
    });
    
    req.on('error', reject);
    
    if (options.data) {
      req.write(JSON.stringify(options.data));
    }
    
    req.end();
  });
}

// Test: Health endpoint
async function testHealthEndpoint() {
  try {
    const response = await makeRequest(config.healthUrl);
    
    if (response.statusCode === 200) {
      try {
        const health = JSON.parse(response.data);
        
        if (health.status === 'OK') {
          addTestResult(
            'Health Endpoint',
            true,
            `Health check passed (${response.duration}ms)`,
            { 
              statusCode: response.statusCode,
              duration: response.duration,
              health
            }
          );
        } else {
          addTestResult(
            'Health Endpoint',
            false,
            `Health status is not OK: ${health.status}`,
            { health }
          );
        }
      } catch (parseError) {
        addTestResult(
          'Health Endpoint',
          false,
          'Invalid JSON response from health endpoint',
          { statusCode: response.statusCode, data: response.data }
        );
      }
    } else {
      addTestResult(
        'Health Endpoint',
        false,
        `HTTP ${response.statusCode}`,
        { statusCode: response.statusCode, data: response.data }
      );
    }
  } catch (error) {
    addTestResult(
      'Health Endpoint',
      false,
      `Request failed: ${error.message}`,
      { error: error.stack }
    );
  }
}

// Test: Metrics endpoint
async function testMetricsEndpoint() {
  try {
    const response = await makeRequest(config.metricsUrl);
    
    if (response.statusCode === 200) {
      try {
        const metrics = JSON.parse(response.data);
        
        // Check for expected metrics
        const expectedMetrics = [
          'avg_hash_time',
          'p95_hash_time', 
          'extraction_failures_rate',
          'low_confidence_queue_length'
        ];
        
        const missingMetrics = expectedMetrics.filter(metric => 
          !(metric in metrics)
        );
        
        if (missingMetrics.length === 0) {
          // Validate metric values
          const validationIssues = [];
          
          if (typeof metrics.avg_hash_time !== 'number' || metrics.avg_hash_time < 0) {
            validationIssues.push('avg_hash_time is not a valid positive number');
          }
          
          if (typeof metrics.p95_hash_time !== 'number' || metrics.p95_hash_time < 0) {
            validationIssues.push('p95_hash_time is not a valid positive number');
          }
          
          if (typeof metrics.extraction_failures_rate !== 'number' || 
              metrics.extraction_failures_rate < 0 || 
              metrics.extraction_failures_rate > 100) {
            validationIssues.push('extraction_failures_rate is not a valid percentage');
          }
          
          if (typeof metrics.low_confidence_queue_length !== 'number' || 
              metrics.low_confidence_queue_length < 0) {
            validationIssues.push('low_confidence_queue_length is not a valid positive number');
          }
          
          if (validationIssues.length === 0) {
            addTestResult(
              'Metrics Endpoint',
              true,
              `All expected metrics present and valid (${response.duration}ms)`,
              { 
                duration: response.duration,
                metrics 
              }
            );
          } else {
            addTestResult(
              'Metrics Endpoint',
              false,
              `Metric validation issues: ${validationIssues.join(', ')}`,
              { metrics, validationIssues }
            );
          }
        } else {
          addTestResult(
            'Metrics Endpoint',
            false,
            `Missing expected metrics: ${missingMetrics.join(', ')}`,
            { metrics, missingMetrics }
          );
        }
      } catch (parseError) {
        addTestResult(
          'Metrics Endpoint',
          false,
          'Invalid JSON response from metrics endpoint',
          { statusCode: response.statusCode, data: response.data }
        );
      }
    } else {
      addTestResult(
        'Metrics Endpoint',
        false,
        `HTTP ${response.statusCode}`,
        { statusCode: response.statusCode }
      );
    }
  } catch (error) {
    addTestResult(
      'Metrics Endpoint',
      false,
      `Request failed: ${error.message}`,
      { error: error.stack }
    );
  }
}

// Test: API basic functionality (if in full mode)
async function testApiBasicFunctionality() {
  if (config.mode !== 'full') {
    return;
  }
  
  try {
    // Test API root endpoint
    const response = await makeRequest(config.apiBaseUrl);
    
    if (response.statusCode === 200 || response.statusCode === 404) {
      addTestResult(
        'API Basic Connectivity',
        true,
        `API endpoint reachable (${response.statusCode})`,
        { 
          statusCode: response.statusCode,
          duration: response.duration 
        }
      );
    } else {
      addTestResult(
        'API Basic Connectivity',
        false,
        `Unexpected status: HTTP ${response.statusCode}`,
        { statusCode: response.statusCode }
      );
    }
  } catch (error) {
    addTestResult(
      'API Basic Connectivity',
      false,
      `Request failed: ${error.message}`,
      { error: error.stack }
    );
  }
}

// Test: Response time performance
async function testResponseTimePerformance() {
  try {
    const iterations = config.mode === 'quick' ? 3 : 10;
    const responseTimes = [];
    
    log('INFO', `Testing response time performance (${iterations} iterations)...`);
    
    for (let i = 0; i < iterations; i++) {
      try {
        const response = await makeRequest(config.healthUrl);
        responseTimes.push(response.duration);
        
        if (config.verbose) {
          log('DEBUG', `Iteration ${i + 1}: ${response.duration}ms`);
        }
      } catch (error) {
        log('WARN', `Performance test iteration ${i + 1} failed: ${error.message}`);
      }
    }
    
    if (responseTimes.length > 0) {
      const avgResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
      const maxResponseTime = Math.max(...responseTimes);
      const minResponseTime = Math.min(...responseTimes);
      
      // Performance thresholds
      const maxAcceptableAvg = 5000; // 5 seconds
      const maxAcceptableMax = 10000; // 10 seconds
      
      const performanceOk = avgResponseTime <= maxAcceptableAvg && 
                           maxResponseTime <= maxAcceptableMax;
      
      addTestResult(
        'Response Time Performance',
        performanceOk,
        performanceOk 
          ? `Performance within limits (avg: ${Math.round(avgResponseTime)}ms)`
          : `Performance degraded (avg: ${Math.round(avgResponseTime)}ms, max: ${maxResponseTime}ms)`,
        {
          iterations: responseTimes.length,
          avgResponseTime: Math.round(avgResponseTime),
          maxResponseTime,
          minResponseTime,
          thresholds: {
            maxAcceptableAvg,
            maxAcceptableMax
          },
          allResponseTimes: responseTimes
        }
      );
    } else {
      addTestResult(
        'Response Time Performance',
        false,
        'No successful responses received',
        { iterations }
      );
    }
  } catch (error) {
    addTestResult(
      'Response Time Performance',
      false,
      `Performance test failed: ${error.message}`,
      { error: error.stack }
    );
  }
}

// Main smoke test function
async function runSmokeTests() {
  try {
    parseArgs();
    
    const startTime = Date.now();
    
    log('INFO', 'Starting smoke tests');
    log('INFO', `Mode: ${config.mode}`);
    log('INFO', `Timeout: ${config.timeout}ms`);
    log('INFO', `Health URL: ${config.healthUrl}`);
    log('INFO', `Metrics URL: ${config.metricsUrl}`);
    
    if (config.mode === 'full') {
      log('INFO', `API URL: ${config.apiBaseUrl}`);
    }
    
    if (config.logFile) {
      log('INFO', `Writing results to: ${config.logFile}`);
    }
    
    // Run test suite
    await testHealthEndpoint();
    await testMetricsEndpoint();
    await testApiBasicFunctionality();
    await testResponseTimePerformance();
    
    // Calculate duration
    testResults.duration = Math.round((Date.now() - startTime) / 1000);
    
    // Summary
    const totalTests = testResults.passed + testResults.failed;
    const successRate = Math.round((testResults.passed / totalTests) * 100);
    
    log('INFO', '=== SMOKE TEST SUMMARY ===');
    log('INFO', `Total tests: ${totalTests}`);
    log('INFO', `Passed: ${testResults.passed}`);
    log('INFO', `Failed: ${testResults.failed}`);
    log('INFO', `Success rate: ${successRate}%`);
    log('INFO', `Duration: ${testResults.duration}s`);
    
    // Write detailed results
    const logDir = path.join(__dirname, '..', 'logs');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    
    const resultsFile = path.join(logDir, 'smoke_test_results.json');
    fs.writeFileSync(resultsFile, JSON.stringify(testResults, null, 2));
    log('INFO', `Detailed results saved to: ${resultsFile}`);
    
    if (testResults.failed > 0) {
      log('ERROR', 'Some smoke tests failed - deployment may have issues');
      process.exit(1);
    } else {
      log('INFO', 'All smoke tests passed successfully');
    }
    
  } catch (error) {
    log('ERROR', 'Smoke test suite failed:', error.message);
    if (config.verbose) {
      log('DEBUG', error.stack);
    }
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  runSmokeTests();
}

module.exports = { runSmokeTests, testResults };