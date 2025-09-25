const http = require('http');
const logger = require('../src/utils/logger');

class SmokeTests {
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || 'http://localhost:5001';
    this.timeout = options.timeout || 10000;
    this.quick = options.quick || false;
  }

  async makeRequest(path, method = 'GET', body = null) {
    return new Promise((resolve, reject) => {
      const url = new URL(path, this.baseUrl);
      const options = {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method: method,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'MOBIUS-SmokeTest/1.0'
        },
        timeout: this.timeout
      };

      if (body && method !== 'GET') {
        const data = JSON.stringify(body);
        options.headers['Content-Length'] = Buffer.byteLength(data);
      }

      const req = http.request(options, (res) => {
        let responseData = '';
        res.on('data', chunk => {
          responseData += chunk;
        });

        res.on('end', () => {
          try {
            const parsedData = responseData ? JSON.parse(responseData) : {};
            resolve({
              statusCode: res.statusCode,
              headers: res.headers,
              data: parsedData,
              rawData: responseData
            });
          } catch (error) {
            resolve({
              statusCode: res.statusCode,
              headers: res.headers,
              data: {},
              rawData: responseData
            });
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Request timeout after ${this.timeout}ms`));
      });

      if (body && method !== 'GET') {
        req.write(JSON.stringify(body));
      }

      req.end();
    });
  }

  async testHealthEndpoint() {
    console.log('🔍 Testing health endpoint...');
    
    try {
      const response = await this.makeRequest('/health');
      
      if (response.statusCode === 200) {
        console.log('✅ Health endpoint responded with 200 OK');
        console.log(`   Status: ${response.data.status}`);
        console.log(`   Service: ${response.data.service}`);
        return { success: true, status: response.data.status };
      } else {
        console.log(`❌ Health endpoint returned ${response.statusCode}`);
        return { success: false, statusCode: response.statusCode };
      }
    } catch (error) {
      console.log(`❌ Health endpoint failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  async testMetricsEndpoint() {
    console.log('📊 Testing dhash metrics endpoint...');
    
    try {
      const response = await this.makeRequest('/metrics/dhash');
      
      if (response.statusCode === 200) {
        console.log('✅ Metrics endpoint responded with 200 OK');
        const metrics = response.data.metrics;
        console.log(`   Total extractions: ${metrics.total_extractions}`);
        console.log(`   Success rate: ${(100 * (1 - metrics.extraction_failures_rate)).toFixed(1)}%`);
        console.log(`   Avg hash time: ${metrics.avg_hash_time.toFixed(2)}ms`);
        return { success: true, metrics };
      } else {
        console.log(`❌ Metrics endpoint returned ${response.statusCode}`);
        return { success: false, statusCode: response.statusCode };
      }
    } catch (error) {
      console.log(`❌ Metrics endpoint failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  async testDHashExtraction() {
    console.log('🔗 Testing dhash extraction...');
    
    try {
      const response = await this.makeRequest('/api/dhash/extract', 'POST', {
        imagePath: '/test/sample.jpg'
      });
      
      if (response.statusCode === 200) {
        console.log('✅ Dhash extraction successful');
        console.log(`   Hash: ${response.data.hash}`);
        console.log(`   Confidence: ${response.data.confidence.toFixed(3)}`);
        console.log(`   Duration: ${response.data.duration_ms}ms`);
        return { success: true, hash: response.data.hash };
      } else {
        console.log(`❌ Dhash extraction returned ${response.statusCode}`);
        return { success: false, statusCode: response.statusCode };
      }
    } catch (error) {
      console.log(`❌ Dhash extraction failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  async testLogging() {
    console.log('📝 Testing logging functionality...');
    
    try {
      // Test various log levels
      logger.info('Smoke test info message', { category: 'smoke-test' });
      logger.warn('Smoke test warning message', { category: 'smoke-test' });
      logger.error('Smoke test error message', { category: 'smoke-test' });
      
      // Test dhash-specific logging
      logger.dhash.extraction_start({ imagePath: '/test/sample.jpg' });
      logger.dhash.extraction_success('abc123def456', 150, 0.95);
      logger.dhash.low_confidence('xyz789uvw012', 0.75);
      
      console.log('✅ Logging test completed - check log files');
      return { success: true };
    } catch (error) {
      console.log(`❌ Logging test failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  async testServerConnectivity() {
    console.log('🌐 Testing server connectivity...');
    
    try {
      // Test a basic endpoint that should always exist
      const response = await this.makeRequest('/');
      
      console.log(`✅ Server responded (${response.statusCode})`);
      return { success: true, statusCode: response.statusCode };
    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        console.log('❌ Server is not running or not accessible');
        return { success: false, error: 'Server not running' };
      } else {
        console.log(`❌ Server connectivity failed: ${error.message}`);
        return { success: false, error: error.message };
      }
    }
  }

  async runAllTests() {
    console.log('🧪 Starting MOBIUS dhash smoke tests...\n');
    
    const startTime = Date.now();
    const results = {
      timestamp: new Date().toISOString(),
      quick: this.quick,
      tests: {},
      summary: {
        total: 0,
        passed: 0,
        failed: 0
      }
    };

    // Define test suite
    const tests = [
      { name: 'server_connectivity', fn: () => this.testServerConnectivity() },
      { name: 'health_endpoint', fn: () => this.testHealthEndpoint() },
      { name: 'metrics_endpoint', fn: () => this.testMetricsEndpoint() },
      { name: 'logging', fn: () => this.testLogging() },
    ];

    // Add dhash extraction test if not in quick mode
    if (!this.quick) {
      tests.push({ name: 'dhash_extraction', fn: () => this.testDHashExtraction() });
    }

    // Run tests
    for (const test of tests) {
      console.log(`\n--- ${test.name.toUpperCase().replace(/_/g, ' ')} ---`);
      
      try {
        const result = await test.fn();
        results.tests[test.name] = result;
        
        if (result.success) {
          results.summary.passed++;
          console.log(`✅ ${test.name} PASSED`);
        } else {
          results.summary.failed++;
          console.log(`❌ ${test.name} FAILED`);
        }
      } catch (error) {
        results.tests[test.name] = { success: false, error: error.message };
        results.summary.failed++;
        console.log(`❌ ${test.name} FAILED: ${error.message}`);
      }
      
      results.summary.total++;
    }

    const duration = Date.now() - startTime;
    results.duration_ms = duration;

    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('SMOKE TESTS SUMMARY');
    console.log('='.repeat(50));
    console.log(`Total tests: ${results.summary.total}`);
    console.log(`Passed: ${results.summary.passed}`);
    console.log(`Failed: ${results.summary.failed}`);
    console.log(`Duration: ${duration}ms`);
    console.log(`Success rate: ${(100 * results.summary.passed / results.summary.total).toFixed(1)}%`);

    if (results.summary.failed > 0) {
      console.log('\n❌ Some tests failed!');
      process.exit(1);
    } else {
      console.log('\n✅ All tests passed!');
      process.exit(0);
    }

    return results;
  }
}

// Command line interface
async function main() {
  const args = process.argv.slice(2);
  const options = {};

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--quick':
        options.quick = true;
        break;
      case '--baseUrl':
        if (args[i + 1]) {
          options.baseUrl = args[i + 1];
          i++;
        }
        break;
      case '--timeout':
        if (args[i + 1]) {
          options.timeout = parseInt(args[i + 1]);
          i++;
        }
        break;
      case '--help':
        console.log(`
Usage: node smoke-tests.js [options]

Options:
  --quick           Run quick tests only (skip dhash extraction)
  --baseUrl URL     Base URL for API calls (default: http://localhost:5001)
  --timeout MS      Request timeout in milliseconds (default: 10000)
  --help            Show this help message
        `);
        process.exit(0);
        break;
    }
  }

  const smokeTests = new SmokeTests(options);
  await smokeTests.runAllTests();
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = SmokeTests;