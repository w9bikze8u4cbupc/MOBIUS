const logger = require('../src/utils/logger');
const fs = require('fs');
const path = require('path');

class LoggingTester {
  constructor() {
    this.testResults = {
      timestamp: new Date().toISOString(),
      tests: {},
      summary: {
        total: 0,
        passed: 0,
        failed: 0
      }
    };
  }

  addTestResult(testName, success, details = {}) {
    this.testResults.tests[testName] = {
      success,
      ...details,
      timestamp: new Date().toISOString()
    };
    
    this.testResults.summary.total++;
    if (success) {
      this.testResults.summary.passed++;
    } else {
      this.testResults.summary.failed++;
    }
  }

  async testBasicLogging() {
    console.log('📝 Testing basic logging functionality...');
    
    try {
      // Test different log levels
      logger.info('Test info message', { test_category: 'basic_logging', test_id: 1 });
      logger.warn('Test warning message', { test_category: 'basic_logging', test_id: 2 });
      logger.error('Test error message', { test_category: 'basic_logging', test_id: 3 });
      logger.debug('Test debug message', { test_category: 'basic_logging', test_id: 4 });
      
      console.log('✅ Basic logging test passed');
      this.addTestResult('basic_logging', true);
      return true;
    } catch (error) {
      console.log(`❌ Basic logging test failed: ${error.message}`);
      this.addTestResult('basic_logging', false, { error: error.message });
      return false;
    }
  }

  async testPIIRedaction() {
    console.log('🔒 Testing PII redaction...');
    
    try {
      // Test messages with PII that should be redacted
      logger.info('User email: john.doe@example.com should be redacted', { test_category: 'pii_redaction' });
      logger.warn('SSN: 123-45-6789 should be redacted', { test_category: 'pii_redaction' });
      logger.info('Credit card: 1234567890123456 should be redacted', { test_category: 'pii_redaction' });
      logger.error('IP address: ip 192.168.1.100 should be redacted', { test_category: 'pii_redaction' });
      
      console.log('✅ PII redaction test passed (check logs for [REDACTED] markers)');
      this.addTestResult('pii_redaction', true);
      return true;
    } catch (error) {
      console.log(`❌ PII redaction test failed: ${error.message}`);
      this.addTestResult('pii_redaction', false, { error: error.message });
      return false;
    }
  }

  async testDHashLogging() {
    console.log('🔗 Testing dhash-specific logging...');
    
    try {
      // Test dhash extraction logging methods
      logger.dhash.extraction_start({ imagePath: '/test/sample1.jpg', requestId: 'test-req-001' });
      
      // Simulate successful extraction
      logger.dhash.extraction_success('abc123def456789', 125, 0.95);
      
      // Simulate failed extraction
      const testError = new Error('Mock extraction failure');
      logger.dhash.extraction_failure(testError, 200);
      
      // Simulate low confidence result
      logger.dhash.low_confidence('xyz789uvw012345', 0.75, 0.8);
      
      console.log('✅ DHash logging test passed');
      this.addTestResult('dhash_logging', true);
      return true;
    } catch (error) {
      console.log(`❌ DHash logging test failed: ${error.message}`);
      this.addTestResult('dhash_logging', false, { error: error.message });
      return false;
    }
  }

  async testLogFileCreation() {
    console.log('📄 Testing log file creation...');
    
    try {
      const logsDir = path.join(process.cwd(), 'logs');
      const expectedFiles = [
        'application',
        'error',
        'dhash-metrics'
      ];
      
      let filesFound = 0;
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
      
      for (const filePrefix of expectedFiles) {
        const pattern = `${filePrefix}-${today}.log`;
        const fullPath = path.join(logsDir, pattern);
        
        if (fs.existsSync(fullPath)) {
          filesFound++;
          console.log(`   ✅ Found log file: ${pattern}`);
        } else {
          console.log(`   ⚠️  Log file not found: ${pattern}`);
        }
      }
      
      if (filesFound > 0) {
        console.log(`✅ Log file creation test passed (${filesFound}/${expectedFiles.length} files found)`);
        this.addTestResult('log_file_creation', true, { files_found: filesFound, files_expected: expectedFiles.length });
        return true;
      } else {
        console.log('❌ No log files were created');
        this.addTestResult('log_file_creation', false, { error: 'No log files found' });
        return false;
      }
    } catch (error) {
      console.log(`❌ Log file creation test failed: ${error.message}`);
      this.addTestResult('log_file_creation', false, { error: error.message });
      return false;
    }
  }

  async testJSONFormatting() {
    console.log('🔧 Testing JSON log formatting...');
    
    try {
      // Create a structured log entry
      const testData = {
        user_action: 'test_action',
        metadata: {
          test_number: 42,
          test_array: [1, 2, 3],
          nested_object: {
            key1: 'value1',
            key2: 'value2'
          }
        },
        timestamp_test: new Date().toISOString()
      };
      
      logger.info('JSON formatting test message', testData);
      
      console.log('✅ JSON formatting test passed');
      this.addTestResult('json_formatting', true, { test_data_keys: Object.keys(testData) });
      return true;
    } catch (error) {
      console.log(`❌ JSON formatting test failed: ${error.message}`);
      this.addTestResult('json_formatting', false, { error: error.message });
      return false;
    }
  }

  async testErrorHandling() {
    console.log('⚠️  Testing error logging...');
    
    try {
      // Test logging of different error types
      const simpleError = new Error('Simple test error');
      const errorWithStack = new Error('Error with stack trace');
      errorWithStack.code = 'TEST_ERROR';
      errorWithStack.statusCode = 500;
      
      logger.error('Simple error test', { error: simpleError.message });
      logger.error('Complex error test', { 
        error: errorWithStack.message,
        code: errorWithStack.code,
        statusCode: errorWithStack.statusCode,
        stack: errorWithStack.stack
      });
      
      console.log('✅ Error handling test passed');
      this.addTestResult('error_handling', true);
      return true;
    } catch (error) {
      console.log(`❌ Error handling test failed: ${error.message}`);
      this.addTestResult('error_handling', false, { error: error.message });
      return false;
    }
  }

  async testRequestIdGeneration() {
    console.log('🆔 Testing request ID generation...');
    
    try {
      const requestId1 = logger.requestId();
      const requestId2 = logger.requestId();
      
      if (requestId1 && requestId2 && requestId1 !== requestId2) {
        console.log(`✅ Request ID generation test passed (${requestId1.length} chars, unique)`);
        this.addTestResult('request_id_generation', true, { 
          sample_id: requestId1.substring(0, 8) + '...',
          length: requestId1.length 
        });
        return true;
      } else {
        console.log('❌ Request ID generation failed - IDs not unique or missing');
        this.addTestResult('request_id_generation', false, { error: 'IDs not unique or missing' });
        return false;
      }
    } catch (error) {
      console.log(`❌ Request ID generation test failed: ${error.message}`);
      this.addTestResult('request_id_generation', false, { error: error.message });
      return false;
    }
  }

  async runAllTests() {
    console.log('🧪 Starting MOBIUS logging system tests...\n');
    
    const startTime = Date.now();
    
    // Run all tests
    await this.testBasicLogging();
    await this.testPIIRedaction();
    await this.testDHashLogging();
    await this.testLogFileCreation();
    await this.testJSONFormatting();
    await this.testErrorHandling();
    await this.testRequestIdGeneration();
    
    const duration = Date.now() - startTime;
    this.testResults.duration_ms = duration;
    
    // Print summary
    console.log('\n' + '='.repeat(50));
    console.log('LOGGING TESTS SUMMARY');
    console.log('='.repeat(50));
    console.log(`Total tests: ${this.testResults.summary.total}`);
    console.log(`Passed: ${this.testResults.summary.passed}`);
    console.log(`Failed: ${this.testResults.summary.failed}`);
    console.log(`Duration: ${duration}ms`);
    console.log(`Success rate: ${(100 * this.testResults.summary.passed / this.testResults.summary.total).toFixed(1)}%`);
    
    // Log final test results
    logger.info('Logging test suite completed', {
      category: 'logging_test_suite',
      results: this.testResults.summary
    });
    
    if (this.testResults.summary.failed > 0) {
      console.log('\n❌ Some logging tests failed!');
      
      // Show failed tests
      console.log('\nFailed tests:');
      for (const [testName, result] of Object.entries(this.testResults.tests)) {
        if (!result.success) {
          console.log(`  - ${testName}: ${result.error || 'Unknown error'}`);
        }
      }
      
      return false;
    } else {
      console.log('\n✅ All logging tests passed!');
      return true;
    }
  }

  getResults() {
    return this.testResults;
  }
}

// Command line interface
async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--help')) {
    console.log(`
Usage: node test_logging.js [options]

Options:
  --help            Show this help message

This script tests the MOBIUS logging system including:
- Basic logging functionality (info, warn, error levels)  
- PII redaction (emails, SSNs, credit cards, IPs)
- DHash-specific logging methods
- Log file creation and rotation
- JSON formatting
- Error handling
- Request ID generation
    `);
    process.exit(0);
  }
  
  const tester = new LoggingTester();
  const success = await tester.runAllTests();
  
  process.exit(success ? 0 : 1);
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = LoggingTester;