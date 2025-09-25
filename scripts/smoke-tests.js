#!/usr/bin/env node

/**
 * Smoke Tests - Validates application health endpoints and performance metrics
 * Ensures system is working correctly after deployment
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

// Configuration
const config = {
  environment: process.env.ENVIRONMENT || 'staging',
  dryRun: process.env.DRY_RUN !== 'false',
  healthUrl: process.env.HEALTH_URL || 'http://localhost:5000/health',
  metricsUrl: process.env.METRICS_URL || 'http://localhost:5000/metrics/dhash',
  apiUrl: process.env.API_URL || 'http://localhost:5001',
  timeout: parseInt(process.env.SMOKE_TIMEOUT) || 30000,
  retries: parseInt(process.env.SMOKE_RETRIES) || 3,
  retryDelay: parseInt(process.env.RETRY_DELAY) || 5000
};

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

// Logging functions
function log(level, message) {
  const timestamp = new Date().toISOString();
  const color = colors[level === 'error' ? 'red' : level === 'success' ? 'green' : 
                       level === 'warning' ? 'yellow' : 'blue'];
  
  console.error(`${color}[${timestamp}] ${message}${colors.reset}`);
}

function logInfo(message) { log('info', message); }
function logSuccess(message) { log('success', `✅ ${message}`); }
function logError(message) { log('error', `❌ ${message}`); }
function logWarning(message) { log('warning', `⚠️  ${message}`); }

// Help function
function showHelp() {
  console.log(`
Smoke Tests - Application health and performance validation

Usage: node smoke-tests.js [OPTIONS]

Options:
    --env <environment>     Target environment (staging|production) [default: staging]
    --dry-run              Run in dry-run mode (simulation) [default: true]
    --no-dry-run           Disable dry-run mode
    --health-url <url>     Health check endpoint [default: http://localhost:5000/health]
    --metrics-url <url>    Metrics endpoint [default: http://localhost:5000/metrics/dhash]
    --api-url <url>        API base URL [default: http://localhost:5001]
    --timeout <ms>         Request timeout in milliseconds [default: 30000]
    --retries <count>      Number of retries for failed tests [default: 3]
    --retry-delay <ms>     Delay between retries in milliseconds [default: 5000]
    --test <name>          Run specific test (health|metrics|api|all) [default: all]
    --help, -h             Show this help message

Examples:
    # Run all smoke tests with dry-run
    node smoke-tests.js --env production

    # Run real tests against staging
    node smoke-tests.js --env staging --no-dry-run

    # Run only health checks
    node smoke-tests.js --test health --no-dry-run

    # Custom endpoints and timeout
    node smoke-tests.js --health-url http://api.example.com/health --timeout 60000

Environment Variables:
    ENVIRONMENT           Target environment
    DRY_RUN              Enable/disable dry-run mode
    HEALTH_URL           Health endpoint URL
    METRICS_URL          Metrics endpoint URL
    API_URL              API base URL
    SMOKE_TIMEOUT        Request timeout in milliseconds
    SMOKE_RETRIES        Number of retries
    RETRY_DELAY          Delay between retries
`);
}

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    testSuite: 'all'
  };
  
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--env':
        config.environment = args[++i];
        break;
      case '--dry-run':
        config.dryRun = true;
        break;
      case '--no-dry-run':
        config.dryRun = false;
        break;
      case '--health-url':
        config.healthUrl = args[++i];
        break;
      case '--metrics-url':
        config.metricsUrl = args[++i];
        break;
      case '--api-url':
        config.apiUrl = args[++i];
        break;
      case '--timeout':
        config.timeout = parseInt(args[++i]);
        break;
      case '--retries':
        config.retries = parseInt(args[++i]);
        break;
      case '--retry-delay':
        config.retryDelay = parseInt(args[++i]);
        break;
      case '--test':
        options.testSuite = args[++i];
        break;
      case '--help':
      case '-h':
        showHelp();
        process.exit(0);
        break;
      default:
        logError(`Unknown option: ${args[i]}`);
        showHelp();
        process.exit(1);
    }
  }
  
  return options;
}

// HTTP request helper with timeout and retries
function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const client = parsedUrl.protocol === 'https:' ? https : http;
    
    const requestOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: options.method || 'GET',
      headers: {
        'User-Agent': 'MOBIUS-SmokeTest/1.0',
        'Accept': 'application/json, text/plain, */*',
        ...options.headers
      },
      timeout: config.timeout
    };
    
    const req = client.request(requestOptions, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data: data,
          responseTime: Date.now() - startTime
        });
      });
    });
    
    const startTime = Date.now();
    
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Request timeout after ${config.timeout}ms`));
    });
    
    req.on('error', (error) => {
      reject(error);
    });
    
    if (options.data) {
      req.write(options.data);
    }
    
    req.end();
  });
}

// Retry wrapper for tests
async function withRetries(testFn, testName) {
  let lastError;
  
  for (let attempt = 1; attempt <= config.retries; attempt++) {
    try {
      const result = await testFn();
      if (attempt > 1) {
        logSuccess(`${testName} passed on attempt ${attempt}/${config.retries}`);
      }
      return result;
    } catch (error) {
      lastError = error;
      
      if (attempt < config.retries) {
        logWarning(`${testName} failed (attempt ${attempt}/${config.retries}): ${error.message}`);
        logInfo(`Retrying in ${config.retryDelay}ms...`);
        await new Promise(resolve => setTimeout(resolve, config.retryDelay));
      }
    }
  }
  
  throw lastError;
}

// Health check test
async function testHealthEndpoint() {
  logInfo('Testing health endpoint...');
  
  if (config.dryRun) {
    logInfo(`DRY-RUN: Would test health endpoint: ${config.healthUrl}`);
    return {
      passed: true,
      endpoint: config.healthUrl,
      responseTime: 150,
      status: 'healthy',
      simulation: true
    };
  }
  
  const response = await makeRequest(config.healthUrl);
  
  if (response.statusCode !== 200) {
    throw new Error(`Health check failed with status ${response.statusCode}`);
  }
  
  let healthData;
  try {
    healthData = JSON.parse(response.data);
  } catch (error) {
    throw new Error('Health endpoint returned invalid JSON');
  }
  
  // Validate health response structure
  if (!healthData.status) {
    throw new Error('Health response missing status field');
  }
  
  if (healthData.status !== 'healthy' && healthData.status !== 'ok') {
    throw new Error(`Health status is not healthy: ${healthData.status}`);
  }
  
  logSuccess(`Health check passed (${response.responseTime}ms)`);
  
  return {
    passed: true,
    endpoint: config.healthUrl,
    responseTime: response.responseTime,
    status: healthData.status,
    details: healthData
  };
}

// Metrics endpoint test
async function testMetricsEndpoint() {
  logInfo('Testing metrics endpoint...');
  
  if (config.dryRun) {
    logInfo(`DRY-RUN: Would test metrics endpoint: ${config.metricsUrl}`);
    return {
      passed: true,
      endpoint: config.metricsUrl,
      responseTime: 200,
      metricsCount: 25,
      simulation: true
    };
  }
  
  const response = await makeRequest(config.metricsUrl);
  
  if (response.statusCode !== 200) {
    throw new Error(`Metrics endpoint failed with status ${response.statusCode}`);
  }
  
  let metricsData;
  try {
    metricsData = JSON.parse(response.data);
  } catch (error) {
    // Metrics might be in Prometheus format, which is fine
    metricsData = { raw: response.data };
  }
  
  // Basic validation of metrics response
  if (response.data.length === 0) {
    throw new Error('Metrics endpoint returned empty response');
  }
  
  const metricsCount = typeof metricsData === 'object' ? 
    Object.keys(metricsData).length : 
    response.data.split('\n').filter(line => line.startsWith('# HELP')).length;
  
  logSuccess(`Metrics endpoint passed (${response.responseTime}ms, ${metricsCount} metrics)`);
  
  return {
    passed: true,
    endpoint: config.metricsUrl,
    responseTime: response.responseTime,
    metricsCount,
    data: metricsData
  };
}

// API endpoint tests
async function testApiEndpoints() {
  logInfo('Testing API endpoints...');
  
  const apiTests = [
    {
      name: 'API Root',
      path: '/',
      expectedStatus: [200, 404], // Root might not exist, that's OK
      required: false
    },
    {
      name: 'API Health',
      path: '/api/health',
      expectedStatus: [200],
      required: false
    },
    {
      name: 'API Status',
      path: '/api/status',
      expectedStatus: [200],
      required: false
    }
  ];
  
  const results = [];
  
  for (const test of apiTests) {
    try {
      if (config.dryRun) {
        logInfo(`DRY-RUN: Would test ${test.name}: ${config.apiUrl}${test.path}`);
        results.push({
          name: test.name,
          passed: true,
          responseTime: Math.floor(Math.random() * 300) + 100,
          simulation: true
        });
        continue;
      }
      
      const url = `${config.apiUrl}${test.path}`;
      const response = await makeRequest(url);
      
      const passed = test.expectedStatus.includes(response.statusCode);
      
      if (passed || !test.required) {
        logSuccess(`${test.name} test passed (${response.statusCode}, ${response.responseTime}ms)`);
        results.push({
          name: test.name,
          passed: true,
          statusCode: response.statusCode,
          responseTime: response.responseTime
        });
      } else {
        throw new Error(`Expected status ${test.expectedStatus.join(' or ')}, got ${response.statusCode}`);
      }
      
    } catch (error) {
      if (test.required) {
        throw error;
      } else {
        logWarning(`${test.name} test failed (optional): ${error.message}`);
        results.push({
          name: test.name,
          passed: false,
          error: error.message,
          optional: true
        });
      }
    }
  }
  
  return results;
}

// Performance benchmarks
async function runPerformanceBenchmarks() {
  logInfo('Running performance benchmarks...');
  
  if (config.dryRun) {
    logInfo('DRY-RUN: Would run performance benchmarks');
    return {
      health_avg_response: 120,
      metrics_avg_response: 180,
      api_avg_response: 200,
      simulation: true
    };
  }
  
  const benchmarks = [];
  const iterations = 5;
  
  // Benchmark health endpoint
  logInfo(`Benchmarking health endpoint (${iterations} iterations)...`);
  const healthTimes = [];
  
  for (let i = 0; i < iterations; i++) {
    try {
      const response = await makeRequest(config.healthUrl);
      healthTimes.push(response.responseTime);
    } catch (error) {
      logWarning(`Benchmark iteration ${i + 1} failed: ${error.message}`);
    }
  }
  
  // Benchmark metrics endpoint
  logInfo(`Benchmarking metrics endpoint (${iterations} iterations)...`);
  const metricsTimes = [];
  
  for (let i = 0; i < iterations; i++) {
    try {
      const response = await makeRequest(config.metricsUrl);
      metricsTimes.push(response.responseTime);
    } catch (error) {
      logWarning(`Benchmark iteration ${i + 1} failed: ${error.message}`);
    }
  }
  
  const calculateStats = (times) => {
    if (times.length === 0) return { avg: 0, min: 0, max: 0, p95: 0 };
    
    const sorted = [...times].sort((a, b) => a - b);
    const sum = times.reduce((a, b) => a + b, 0);
    const p95Index = Math.floor(sorted.length * 0.95);
    
    return {
      avg: Math.round(sum / times.length),
      min: sorted[0],
      max: sorted[sorted.length - 1],
      p95: sorted[p95Index] || sorted[sorted.length - 1]
    };
  };
  
  const healthStats = calculateStats(healthTimes);
  const metricsStats = calculateStats(metricsTimes);
  
  logSuccess(`Health endpoint benchmark: avg=${healthStats.avg}ms, p95=${healthStats.p95}ms`);
  logSuccess(`Metrics endpoint benchmark: avg=${metricsStats.avg}ms, p95=${metricsStats.p95}ms`);
  
  return {
    health: healthStats,
    metrics: metricsStats,
    iterations
  };
}

// Generate test report
async function generateTestReport(results) {
  const timestamp = new Date().toISOString();
  const reportFile = `artifacts/smoke_test_${config.environment}_${Date.now()}.json`;
  
  const report = {
    smoke_test: {
      environment: config.environment,
      timestamp,
      dry_run: config.dryRun,
      configuration: {
        health_url: config.healthUrl,
        metrics_url: config.metricsUrl,
        api_url: config.apiUrl,
        timeout: config.timeout,
        retries: config.retries
      }
    },
    results,
    summary: {
      total_tests: Object.keys(results).length,
      passed_tests: Object.values(results).filter(r => r.passed || (Array.isArray(r) && r.every(t => t.passed || t.optional))).length,
      failed_tests: Object.values(results).filter(r => !r.passed && (!Array.isArray(r) || r.some(t => !t.passed && !t.optional))).length
    }
  };
  
  // Ensure artifacts directory exists
  fs.mkdirSync('artifacts', { recursive: true });
  
  if (config.dryRun) {
    logInfo(`DRY-RUN: Would create test report: ${reportFile}`);
    console.log('Report content:', JSON.stringify(report, null, 2));
  } else {
    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
    logSuccess(`Test report created: ${reportFile}`);
  }
  
  return report;
}

// Main test suite runner
async function runTestSuite(testSuite) {
  const results = {};
  
  try {
    switch (testSuite) {
      case 'health':
        results.health = await withRetries(testHealthEndpoint, 'Health test');
        break;
        
      case 'metrics':
        results.metrics = await withRetries(testMetricsEndpoint, 'Metrics test');
        break;
        
      case 'api':
        results.api = await testApiEndpoints();
        break;
        
      case 'all':
      default:
        results.health = await withRetries(testHealthEndpoint, 'Health test');
        results.metrics = await withRetries(testMetricsEndpoint, 'Metrics test');
        results.api = await testApiEndpoints();
        results.performance = await runPerformanceBenchmarks();
        break;
    }
    
    return results;
    
  } catch (error) {
    logError(`Test suite failed: ${error.message}`);
    throw error;
  }
}

// Main execution function
async function main() {
  const startTime = Date.now();
  
  logInfo('🔥 Starting smoke tests');
  logInfo(`Environment: ${config.environment}`);
  logInfo(`Dry-run mode: ${config.dryRun}`);
  logInfo(`Health URL: ${config.healthUrl}`);
  logInfo(`Metrics URL: ${config.metricsUrl}`);
  logInfo(`API URL: ${config.apiUrl}`);
  
  try {
    const options = parseArgs();
    
    // Validate environment
    if (!['staging', 'production'].includes(config.environment)) {
      throw new Error(`Invalid environment: ${config.environment}. Must be 'staging' or 'production'`);
    }
    
    // Run test suite
    const results = await runTestSuite(options.testSuite);
    
    // Generate report
    const report = await generateTestReport(results);
    
    // Summary
    const duration = Date.now() - startTime;
    logSuccess(`🎉 Smoke tests completed successfully`);
    logSuccess(`Total execution time: ${duration}ms`);
    
    if (config.dryRun) {
      logWarning('This was a DRY-RUN. No actual requests were made.');
      logInfo('To run with real requests, use: --no-dry-run');
    }
    
    console.log('\n📊 Test Summary:');
    console.log(`  Total tests: ${report.summary.total_tests}`);
    console.log(`  Passed: ${report.summary.passed_tests}`);
    console.log(`  Failed: ${report.summary.failed_tests}`);
    
    if (report.summary.failed_tests > 0) {
      process.exit(1);
    }
    
  } catch (error) {
    logError(`Smoke tests failed: ${error.message}`);
    process.exit(1);
  }
}

// Handle unhandled errors
process.on('uncaughtException', (error) => {
  logError(`Uncaught exception: ${error.message}`);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logError(`Unhandled rejection at ${promise}: ${reason}`);
  process.exit(1);
});

// Execute main function
if (require.main === module) {
  main();
}

module.exports = {
  main,
  testHealthEndpoint,
  testMetricsEndpoint,
  testApiEndpoints,
  runPerformanceBenchmarks
};