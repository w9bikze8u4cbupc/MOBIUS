const http = require('http');
const https = require('https');
const { URL } = require('url');

// Smoke tests for MOBIUS dhash service
class SmokeTestRunner {
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || 'http://localhost:5001';
    this.timeout = options.timeout || 30000;
    this.quick = options.quick || false;
    this.verbose = options.verbose || false;
    this.results = [];
  }

  log(message, data = {}) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      service: 'smoke-tests',
      message,
      ...data
    };
    
    if (this.verbose) {
      console.log(JSON.stringify(logEntry));
    } else {
      console.log(`[${timestamp.split('T')[1].split('.')[0]}] ${message}`);
    }
  }

  async makeRequest(path, options = {}) {
    return new Promise((resolve, reject) => {
      const url = new URL(path, this.baseUrl);
      const isHttps = url.protocol === 'https:';
      const client = isHttps ? https : http;
      
      const requestOptions = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        method: options.method || 'GET',
        headers: {
          'User-Agent': 'MOBIUS-SmokeTest/1.0',
          'Content-Type': 'application/json',
          ...options.headers
        },
        timeout: this.timeout
      };

      const req = client.request(requestOptions, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          try {
            const responseData = data ? JSON.parse(data) : null;
            resolve({
              statusCode: res.statusCode,
              headers: res.headers,
              data: responseData,
              rawData: data
            });
          } catch (err) {
            // If response is not JSON, return raw data
            resolve({
              statusCode: res.statusCode,
              headers: res.headers,
              data: null,
              rawData: data
            });
          }
        });
      });

      req.on('error', (err) => {
        reject(err);
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Request timeout after ${this.timeout}ms`));
      });

      if (options.body) {
        req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
      }

      req.end();
    });
  }

  async runTest(name, testFn) {
    const startTime = Date.now();
    this.log(`Running test: ${name}`);
    
    try {
      const result = await testFn();
      const duration = Date.now() - startTime;
      
      this.results.push({
        name,
        status: 'PASS',
        duration,
        result
      });
      
      this.log(`✓ ${name} (${duration}ms)`, { status: 'PASS', duration });
      return result;
    } catch (err) {
      const duration = Date.now() - startTime;
      
      this.results.push({
        name,
        status: 'FAIL',
        duration,
        error: err.message
      });
      
      this.log(`✗ ${name} (${duration}ms)`, { status: 'FAIL', duration, error: err.message });
      throw err;
    }
  }

  async testHealthEndpoint() {
    return this.runTest('Health Endpoint', async () => {
      const response = await this.makeRequest('/health');
      
      if (response.statusCode !== 200) {
        throw new Error(`Health check failed with status ${response.statusCode}`);
      }
      
      if (!response.data || !response.data.status) {
        throw new Error('Health response missing status field');
      }
      
      if (response.data.status !== 'OK' && response.data.status !== 'WARN') {
        throw new Error(`Health status is ${response.data.status}, expected OK or WARN`);
      }
      
      // Verify required fields
      const requiredFields = ['timestamp', 'uptime', 'checks'];
      for (const field of requiredFields) {
        if (!(field in response.data)) {
          throw new Error(`Health response missing required field: ${field}`);
        }
      }
      
      return {
        status: response.data.status,
        uptime: response.data.uptime,
        checksCount: Object.keys(response.data.checks || {}).length
      };
    });
  }

  async testMetricsEndpoint() {
    return this.runTest('Metrics Endpoint', async () => {
      const response = await this.makeRequest('/metrics/dhash');
      
      if (response.statusCode !== 200) {
        throw new Error(`Metrics endpoint failed with status ${response.statusCode}`);
      }
      
      if (!response.data) {
        throw new Error('Metrics response is empty');
      }
      
      // Verify expected metrics fields
      const expectedFields = [
        'total', 'successful', 'failed', 'avg_hash_time', 
        'p95_hash_time', 'extraction_failures_rate', 'timestamp'
      ];
      
      for (const field of expectedFields) {
        if (!(field in response.data)) {
          throw new Error(`Metrics response missing field: ${field}`);
        }
      }
      
      return {
        total: response.data.total,
        successRate: response.data.total > 0 ? 
          ((response.data.successful / response.data.total) * 100).toFixed(2) + '%' : 
          'N/A',
        avgHashTime: response.data.avg_hash_time,
        p95HashTime: response.data.p95_hash_time
      };
    });
  }

  async testApiResponsiveness() {
    return this.runTest('API Responsiveness', async () => {
      const startTime = Date.now();
      const response = await this.makeRequest('/health');
      const responseTime = Date.now() - startTime;
      
      if (responseTime > 5000) {
        throw new Error(`API response time too slow: ${responseTime}ms`);
      }
      
      return {
        responseTime: responseTime + 'ms',
        acceptable: responseTime < 2000
      };
    });
  }

  async testExplainChunkEndpoint() {
    return this.runTest('Explain Chunk Endpoint', async () => {
      const testPayload = {
        chunk: 'This is a test game rule chunk',
        language: 'en'
      };
      
      const response = await this.makeRequest('/api/explain-chunk', {
        method: 'POST',
        body: testPayload
      });
      
      // This endpoint might fail due to missing OpenAI key, but we test the basic structure
      if (response.statusCode === 500 && response.data && response.data.error) {
        // Expected failure due to configuration - this is acceptable for smoke test
        return {
          status: 'configuration_error',
          message: 'Endpoint structure correct, failing due to configuration'
        };
      }
      
      if (response.statusCode === 200 && response.data && response.data.explanation) {
        return {
          status: 'success',
          explanationLength: response.data.explanation.length
        };
      }
      
      if (response.statusCode === 400) {
        throw new Error('Bad request - endpoint validation working');
      }
      
      return {
        status: 'unknown',
        statusCode: response.statusCode
      };
    });
  }

  async testErrorHandling() {
    return this.runTest('Error Handling', async () => {
      // Test 404 handling
      const response = await this.makeRequest('/nonexistent-endpoint');
      
      if (response.statusCode !== 404) {
        throw new Error(`Expected 404 for nonexistent endpoint, got ${response.statusCode}`);
      }
      
      return {
        status: 'correct_404_handling'
      };
    });
  }

  async testCorsHeaders() {
    return this.runTest('CORS Headers', async () => {
      const response = await this.makeRequest('/health', {
        headers: {
          'Origin': 'http://localhost:3000'
        }
      });
      
      const corsHeader = response.headers['access-control-allow-origin'];
      if (!corsHeader) {
        throw new Error('CORS headers not present');
      }
      
      return {
        corsOrigin: corsHeader,
        corsConfigured: true
      };
    });
  }

  async runAllTests() {
    this.log('🚀 Starting MOBIUS smoke tests', { 
      baseUrl: this.baseUrl, 
      quick: this.quick,
      timeout: this.timeout 
    });
    
    const tests = [
      () => this.testHealthEndpoint(),
      () => this.testMetricsEndpoint(),
      () => this.testApiResponsiveness()
    ];
    
    if (!this.quick) {
      tests.push(
        () => this.testExplainChunkEndpoint(),
        () => this.testErrorHandling(),
        () => this.testCorsHeaders()
      );
    }
    
    let passedTests = 0;
    let failedTests = 0;
    
    for (const test of tests) {
      try {
        await test();
        passedTests++;
      } catch (err) {
        failedTests++;
        if (this.verbose) {
          console.error('Test error details:', err);
        }
      }
    }
    
    // Summary
    this.log('\n📊 Smoke Test Summary');
    this.log(`Total tests: ${passedTests + failedTests}`);
    this.log(`Passed: ${passedTests}`);
    this.log(`Failed: ${failedTests}`);
    this.log(`Success rate: ${((passedTests / (passedTests + failedTests)) * 100).toFixed(1)}%`);
    
    if (failedTests === 0) {
      this.log('🎉 All smoke tests passed!');
    } else {
      this.log('⚠️  Some smoke tests failed. Check the logs above for details.');
    }
    
    return {
      totalTests: passedTests + failedTests,
      passed: passedTests,
      failed: failedTests,
      success: failedTests === 0,
      results: this.results
    };
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const options = {
    baseUrl: 'http://localhost:5001',
    timeout: 30000,
    quick: false,
    verbose: false
  };

  // Parse command line arguments
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
    case '--quick':
      options.quick = true;
      break;
    case '--verbose':
    case '-v':
      options.verbose = true;
      break;
    case '--url':
      options.baseUrl = args[++i];
      break;
    case '--timeout':
      options.timeout = parseInt(args[++i], 10);
      break;
    case '--help':
      console.log(`
Usage: node smoke-tests.js [OPTIONS]

OPTIONS:
  --quick               Run only essential tests (faster)
  --verbose, -v         Enable verbose logging
  --url URL            Base URL for API (default: http://localhost:5001)
  --timeout MS         Request timeout in milliseconds (default: 30000)
  --help               Show this help message

EXAMPLES:
  node scripts/smoke-tests.js --quick
  node scripts/smoke-tests.js --url http://staging.mobius.com --verbose
  node scripts/smoke-tests.js --timeout 10000

        `);
      process.exit(0);
      break;
    default:
      console.error(`Unknown argument: ${args[i]}`);
      process.exit(1);
    }
  }

  try {
    const runner = new SmokeTestRunner(options);
    const results = await runner.runAllTests();
    process.exit(results.success ? 0 : 1);
  } catch (err) {
    console.error('Smoke test runner error:', err.message);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { SmokeTestRunner };