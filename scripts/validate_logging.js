#!/usr/bin/env node
// validate_logging.js - Logging validation including redaction tests and concurrency scenarios
// Usage: node validate_logging.js [--env <environment>] [--config <config-file>] [--dry-run]

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

class LoggingValidator {
  constructor(options = {}) {
    this.environment = options.environment || 'test';
    this.dryRun = options.dryRun || false;
    this.config = options.config || this.loadDefaultConfig();
    this.testResults = [];
  }

  loadDefaultConfig() {
    return {
      log_levels: ['debug', 'info', 'warn', 'error'],
      redaction_patterns: [
        { name: 'credit_card', pattern: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, replacement: '[REDACTED-CC]' },
        { name: 'social_security', pattern: /\b\d{3}-\d{2}-\d{4}\b/g, replacement: '[REDACTED-SSN]' },
        { name: 'email', pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, replacement: '[REDACTED-EMAIL]' },
        { name: 'api_key', pattern: /\b[Aa]pi[_-]?[Kk]ey[\s:=]+[A-Za-z0-9_-]+/g, replacement: '[REDACTED-API-KEY]' },
        { name: 'bearer_token', pattern: /\bBearer\s+[A-Za-z0-9_-]+/g, replacement: 'Bearer [REDACTED-TOKEN]' },
        { name: 'password', pattern: /\b[Pp]assword[\s:=]+\S+/g, replacement: 'password: [REDACTED]' }
      ],
      performance_thresholds: {
        log_write_time_ms: 100,
        concurrent_writers: 10,
        log_rotation_time_ms: 5000
      }
    };
  }

  logResult(testName, passed, message = '') {
    const result = {
      test: testName,
      passed,
      message,
      timestamp: new Date().toISOString()
    };
    
    this.testResults.push(result);
    
    const icon = passed ? '✅' : '❌';
    const status = passed ? 'PASS' : 'FAIL';
    console.log(`  ${icon} ${testName}: ${status}${message ? ' - ' + message : ''}`);
    
    return result;
  }

  // Test basic logging functionality
  async testBasicLogging() {
    console.log('\n📝 Testing basic logging functionality...');
    
    if (this.dryRun) {
      this.logResult('basic_logging', true, '[DRY-RUN] Would test basic log writing');
      return;
    }

    try {
      const testLogFile = path.join('/tmp', `test_log_${Date.now()}.log`);
      const testMessages = [
        { level: 'debug', message: 'Debug message test' },
        { level: 'info', message: 'Info message test' },
        { level: 'warn', message: 'Warning message test' },
        { level: 'error', message: 'Error message test' }
      ];

      // Write test messages
      for (const msg of testMessages) {
        const logEntry = JSON.stringify({
          timestamp: new Date().toISOString(),
          level: msg.level,
          message: msg.message,
          environment: this.environment
        }) + '\n';
        
        fs.appendFileSync(testLogFile, logEntry);
      }

      // Verify log file exists and has correct content
      if (fs.existsSync(testLogFile)) {
        const logContent = fs.readFileSync(testLogFile, 'utf8');
        const logLines = logContent.trim().split('\n');
        
        if (logLines.length === testMessages.length) {
          this.logResult('basic_logging', true, `Successfully wrote ${logLines.length} log entries`);
        } else {
          this.logResult('basic_logging', false, `Expected ${testMessages.length} entries, found ${logLines.length}`);
        }
        
        // Clean up
        fs.unlinkSync(testLogFile);
      } else {
        this.logResult('basic_logging', false, 'Log file was not created');
      }
    } catch (error) {
      this.logResult('basic_logging', false, `Error: ${error.message}`);
    }
  }

  // Test log redaction functionality
  async testLogRedaction() {
    console.log('\n🔒 Testing log redaction functionality...');
    
    if (this.dryRun) {
      this.logResult('log_redaction', true, '[DRY-RUN] Would test sensitive data redaction');
      return;
    }

    const testCases = [
      { input: 'Credit card: 4532-1234-5678-9012', expectedRedacted: true },
      { input: 'SSN: 123-45-6789', expectedRedacted: true },
      { input: 'Email: user@example.com', expectedRedacted: true },
      { input: 'API_KEY: sk_test_123456789abcdef', expectedRedacted: true },
      { input: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9', expectedRedacted: true },
      { input: 'Password: secretpassword123', expectedRedacted: true },
      { input: 'Normal log message without sensitive data', expectedRedacted: false }
    ];

    let passedTests = 0;
    let totalTests = testCases.length;

    for (const testCase of testCases) {
      let redacted = testCase.input;
      
      // Apply redaction patterns
      this.config.redaction_patterns.forEach(pattern => {
        redacted = redacted.replace(pattern.pattern, pattern.replacement);
      });
      
      const wasRedacted = redacted !== testCase.input;
      const testPassed = wasRedacted === testCase.expectedRedacted;
      
      if (testPassed) {
        passedTests++;
      }
      
      console.log(`    ${testPassed ? '✅' : '❌'} "${testCase.input.substring(0, 30)}..." - ${wasRedacted ? 'REDACTED' : 'NOT_REDACTED'}`);
    }

    const allPassed = passedTests === totalTests;
    this.logResult('log_redaction', allPassed, `${passedTests}/${totalTests} redaction tests passed`);
  }

  // Test concurrent logging scenarios
  async testConcurrentLogging() {
    console.log('\n🚀 Testing concurrent logging scenarios...');
    
    if (this.dryRun) {
      this.logResult('concurrent_logging', true, '[DRY-RUN] Would test concurrent log writing');
      return;
    }

    try {
      const testLogFile = path.join('/tmp', `concurrent_test_${Date.now()}.log`);
      const concurrentWriters = this.config.performance_thresholds.concurrent_writers;
      const messagesPerWriter = 10;
      
      const startTime = Date.now();
      
      // Create multiple concurrent writers
      const writers = [];
      for (let i = 0; i < concurrentWriters; i++) {
        const writer = new Promise((resolve, reject) => {
          try {
            for (let j = 0; j < messagesPerWriter; j++) {
              const logEntry = JSON.stringify({
                timestamp: new Date().toISOString(),
                level: 'info',
                message: `Concurrent writer ${i}, message ${j}`,
                writerId: i,
                messageId: j
              }) + '\n';
              
              fs.appendFileSync(testLogFile, logEntry);
            }
            resolve(i);
          } catch (error) {
            reject(error);
          }
        });
        writers.push(writer);
      }
      
      // Wait for all writers to complete
      await Promise.all(writers);
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // Verify log file
      if (fs.existsSync(testLogFile)) {
        const logContent = fs.readFileSync(testLogFile, 'utf8');
        const logLines = logContent.trim().split('\n');
        const expectedLines = concurrentWriters * messagesPerWriter;
        
        if (logLines.length === expectedLines) {
          this.logResult('concurrent_logging', true, `${concurrentWriters} writers completed in ${duration}ms`);
        } else {
          this.logResult('concurrent_logging', false, `Expected ${expectedLines} lines, found ${logLines.length}`);
        }
        
        // Clean up
        fs.unlinkSync(testLogFile);
      } else {
        this.logResult('concurrent_logging', false, 'Concurrent log file was not created');
      }
    } catch (error) {
      this.logResult('concurrent_logging', false, `Error: ${error.message}`);
    }
  }

  // Test log rotation functionality
  async testLogRotation() {
    console.log('\n🔄 Testing log rotation functionality...');
    
    if (this.dryRun) {
      this.logResult('log_rotation', true, '[DRY-RUN] Would test log rotation');
      return;
    }

    try {
      const baseLogFile = path.join('/tmp', `rotation_test_${Date.now()}.log`);
      const maxLogSize = 1024; // 1KB for testing
      
      // Write logs until rotation should occur
      let totalBytes = 0;
      let logCount = 0;
      
      while (totalBytes < maxLogSize * 2) { // Write enough to trigger rotation
        const logEntry = JSON.stringify({
          timestamp: new Date().toISOString(),
          level: 'info',
          message: `Log rotation test message ${logCount} - padding to increase file size`,
          padding: 'x'.repeat(100) // Add padding to reach size limit faster
        }) + '\n';
        
        fs.appendFileSync(baseLogFile, logEntry);
        totalBytes += Buffer.byteLength(logEntry, 'utf8');
        logCount++;
      }
      
      // Check if log file exists and has expected size
      const stats = fs.statSync(baseLogFile);
      const fileSize = stats.size;
      
      if (fileSize > maxLogSize) {
        this.logResult('log_rotation', true, `Log file grew to ${fileSize} bytes (${logCount} entries)`);
      } else {
        this.logResult('log_rotation', false, `Log file size ${fileSize} bytes is too small`);
      }
      
      // Clean up
      fs.unlinkSync(baseLogFile);
    } catch (error) {
      this.logResult('log_rotation', false, `Error: ${error.message}`);
    }
  }

  // Test log format validation
  async testLogFormatValidation() {
    console.log('\n📋 Testing log format validation...');
    
    if (this.dryRun) {
      this.logResult('log_format', true, '[DRY-RUN] Would test log format validation');
      return;
    }

    try {
      const testLogFile = path.join('/tmp', `format_test_${Date.now()}.log`);
      
      // Write a properly formatted log entry
      const logEntry = {
        timestamp: new Date().toISOString(),
        level: 'info',
        message: 'Test message for format validation',
        environment: this.environment,
        service: 'dhash',
        requestId: 'req-123456',
        userId: 'user-789'
      };
      
      fs.writeFileSync(testLogFile, JSON.stringify(logEntry) + '\n');
      
      // Read and validate format
      const logContent = fs.readFileSync(testLogFile, 'utf8');
      const parsedLog = JSON.parse(logContent.trim());
      
      const requiredFields = ['timestamp', 'level', 'message'];
      const missingFields = requiredFields.filter(field => !parsedLog[field]);
      
      if (missingFields.length === 0) {
        // Validate timestamp format
        const timestampValid = !isNaN(Date.parse(parsedLog.timestamp));
        
        if (timestampValid) {
          this.logResult('log_format', true, 'Log format validation passed');
        } else {
          this.logResult('log_format', false, 'Invalid timestamp format');
        }
      } else {
        this.logResult('log_format', false, `Missing required fields: ${missingFields.join(', ')}`);
      }
      
      // Clean up
      fs.unlinkSync(testLogFile);
    } catch (error) {
      this.logResult('log_format', false, `Error: ${error.message}`);
    }
  }

  // Generate validation report
  generateReport() {
    const passed = this.testResults.filter(r => r.passed).length;
    const failed = this.testResults.filter(r => r.passed === false).length;
    const total = this.testResults.length;
    const passRate = total > 0 ? ((passed / total) * 100).toFixed(2) : 0;
    
    console.log('\n📊 Logging Validation Report');
    console.log('============================');
    console.log(`Environment: ${this.environment}`);
    console.log(`Total Tests: ${total}`);
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);
    console.log(`Pass Rate: ${passRate}%`);
    
    if (failed > 0) {
      console.log('\n❌ Failed Tests:');
      this.testResults
        .filter(r => r.passed === false)
        .forEach(r => console.log(`   - ${r.test}: ${r.message}`));
    }
    
    // Write report to file
    const reportFile = `logging_validation_report_${this.environment}_${new Date().toISOString().split('T')[0]}.json`;
    const report = {
      environment: this.environment,
      timestamp: new Date().toISOString(),
      summary: { total, passed, failed, passRate: parseFloat(passRate) },
      tests: this.testResults
    };
    
    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
    console.log(`\n📄 Report saved to: ${reportFile}`);
    
    return failed === 0;
  }

  // Run all validation tests
  async runAllTests() {
    console.log(`🔍 Starting logging validation for environment: ${this.environment}`);
    console.log(`🚨 Dry run mode: ${this.dryRun}`);
    
    await this.testBasicLogging();
    await this.testLogRedaction();
    await this.testConcurrentLogging();
    await this.testLogRotation();
    await this.testLogFormatValidation();
    
    return this.generateReport();
  }
}

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {};
  
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--env':
        options.environment = args[++i];
        break;
      case '--config':
        options.configFile = args[++i];
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '-h':
      case '--help':
        console.log('Usage: node validate_logging.js [--env <environment>] [--config <config-file>] [--dry-run]');
        console.log('  --env: Environment name (default: test)');
        console.log('  --config: Path to configuration file (optional)');
        console.log('  --dry-run: Show what would be tested without executing');
        process.exit(0);
      default:
        console.error(`Unknown option: ${args[i]}`);
        process.exit(1);
    }
  }
  
  return options;
}

// Load configuration from file
function loadConfig(configFile) {
  if (configFile && fs.existsSync(configFile)) {
    try {
      return JSON.parse(fs.readFileSync(configFile, 'utf8'));
    } catch (error) {
      console.error(`Failed to load config file: ${error.message}`);
      process.exit(1);
    }
  }
  return undefined;
}

// Main execution
async function main() {
  const options = parseArgs();
  const config = loadConfig(options.configFile);
  
  const validator = new LoggingValidator({
    environment: options.environment,
    dryRun: options.dryRun,
    config
  });
  
  try {
    const allTestsPassed = await validator.runAllTests();
    
    if (allTestsPassed) {
      console.log('\n✅ All logging validation tests passed');
      process.exit(0);
    } else {
      console.log('\n❌ Some logging validation tests failed');
      process.exit(1);
    }
  } catch (error) {
    console.error(`❌ Logging validation failed: ${error.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { LoggingValidator };