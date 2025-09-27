#!/usr/bin/env node

/**
 * dhash Logging Validation Script
 * Validates logging configuration, tests concurrency, and checks redaction
 * Usage: node scripts/validate_logging.js [--env staging|production] [--concurrency 10]
 */

const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');

// Default configuration
const DEFAULT_CONFIG = {
  environment: 'staging',
  concurrency: 10,
  testDuration: 30, // seconds
  logLevel: 'info',
  expectedLogFiles: [
    'dhash.log',
    'dhash-error.log', 
    'dhash-access.log',
    'dhash-audit.log'
  ],
  sensitivePatterns: [
    /password['":\s]*['"]\w+['"]/gi,
    /token['":\s]*['"]\w+['"]/gi, 
    /api[-_]?key['":\s]*['"]\w+['"]/gi,
    /secret['":\s]*['"]\w+['"]/gi,
    /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, // Credit card numbers
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, // Email addresses
    /\b\d{3}-?\d{2}-?\d{4}\b/g // SSN format
  ]
};

class LoggingValidator {
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.results = {
      configValidation: [],
      concurrencyTest: [],
      redactionTest: [],
      performanceTest: []
    };
    
    // Setup logging
    this.logDir = path.join(process.cwd(), 'logs');
    this.testLogDir = path.join(this.logDir, 'validation');
    this.ensureDirectories();
    
    this.logFile = path.join(this.testLogDir, `logging_validation_${this.formatTimestamp(new Date())}.log`);
    this.initLog();
  }

  formatTimestamp(date) {
    return date.toISOString().replace(/[:.]/g, '-').replace('T', '_').split('.')[0];
  }

  ensureDirectories() {
    [this.logDir, this.testLogDir].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  initLog() {
    const logHeader = [
      '=== DHASH LOGGING VALIDATION ===',
      `Environment: ${this.config.environment}`,
      `Concurrency Level: ${this.config.concurrency}`,
      `Test Duration: ${this.config.testDuration}s`,
      `Started at: ${new Date().toISOString()}`,
      `Log file: ${this.logFile}`,
      ''
    ].join('\n');

    fs.writeFileSync(this.logFile, logHeader);
    this.log('Logging validation initialized');
  }

  log(message, level = 'INFO') {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level}] ${message}`;
    
    // Console output with colors
    const colors = {
      INFO: '\x1b[34m',    // Blue
      WARN: '\x1b[33m',    // Yellow
      ERROR: '\x1b[31m',   // Red
      SUCCESS: '\x1b[32m', // Green
      RESET: '\x1b[0m'     // Reset
    };
    
    console.log(`${colors[level] || colors.INFO}${logMessage}${colors.RESET}`);
    
    // File output
    fs.appendFileSync(this.logFile, logMessage + '\n');
  }

  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Validate logging configuration
  async validateLoggingConfig() {
    this.log('Starting logging configuration validation...');
    
    const tests = [
      {
        name: 'Log Directory Exists',
        test: () => fs.existsSync(this.logDir),
        critical: true
      },
      {
        name: 'Log Directory Writable',
        test: () => {
          const testFile = path.join(this.logDir, 'write_test.tmp');
          try {
            fs.writeFileSync(testFile, 'test');
            fs.unlinkSync(testFile);
            return true;
          } catch (error) {
            return false;
          }
        },
        critical: true
      },
      {
        name: 'Log Rotation Configuration',
        test: () => {
          // Check if logrotate configuration exists
          const logrotateConfig = '/etc/logrotate.d/dhash';
          return fs.existsSync(logrotateConfig) || process.env.LOG_ROTATION_ENABLED === 'true';
        },
        critical: false
      },
      {
        name: 'Log Level Configuration',
        test: () => {
          const logLevel = process.env.LOG_LEVEL || this.config.logLevel;
          return ['error', 'warn', 'info', 'debug', 'trace'].includes(logLevel.toLowerCase());
        },
        critical: true
      },
      {
        name: 'Structured Logging Format',
        test: () => {
          // Check if JSON logging is configured
          const logFormat = process.env.LOG_FORMAT || 'json';
          return ['json', 'structured'].includes(logFormat.toLowerCase());
        },
        critical: false
      }
    ];

    for (const test of tests) {
      try {
        const result = test.test();
        const status = result ? 'PASS' : 'FAIL';
        const level = result ? 'SUCCESS' : (test.critical ? 'ERROR' : 'WARN');
        
        this.log(`${test.name}: ${status}`, level);
        
        this.results.configValidation.push({
          name: test.name,
          status,
          critical: test.critical,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        this.log(`${test.name}: ERROR - ${error.message}`, 'ERROR');
        this.results.configValidation.push({
          name: test.name,
          status: 'ERROR',
          error: error.message,
          critical: test.critical,
          timestamp: new Date().toISOString()
        });
      }
    }

    const failures = this.results.configValidation.filter(r => r.status !== 'PASS');
    const criticalFailures = failures.filter(r => r.critical);

    if (criticalFailures.length > 0) {
      this.log(`Configuration validation failed: ${criticalFailures.length} critical issues found`, 'ERROR');
      return false;
    } else if (failures.length > 0) {
      this.log(`Configuration validation completed with ${failures.length} warnings`, 'WARN');
      return true;
    } else {
      this.log('Configuration validation: All tests passed', 'SUCCESS');
      return true;
    }
  }

  // Test concurrent logging performance
  async testConcurrentLogging() {
    this.log('Starting concurrent logging test...');
    
    const testFile = path.join(this.testLogDir, `concurrent_test_${Date.now()}.log`);
    const messagesPerProcess = 100;
    const totalMessages = this.config.concurrency * messagesPerProcess;
    
    this.log(`Testing ${this.config.concurrency} concurrent processes, ${messagesPerProcess} messages each`);
    
    const startTime = Date.now();
    const processes = [];

    // Create concurrent logging processes
    for (let i = 0; i < this.config.concurrency; i++) {
      const process = spawn('node', ['-e', `
        const fs = require('fs');
        const processId = ${i};
        const logFile = '${testFile}';
        
        for (let j = 0; j < ${messagesPerProcess}; j++) {
          const message = JSON.stringify({
            timestamp: new Date().toISOString(),
            level: 'INFO',
            processId: processId,
            messageId: j,
            message: 'Concurrent logging test message',
            data: { testData: 'sample_' + j }
          }) + '\\n';
          
          fs.appendFileSync(logFile, message);
        }
        
        console.log('Process ' + processId + ' completed');
      `], { stdio: 'pipe' });

      processes.push(process);
    }

    // Wait for all processes to complete
    await Promise.all(processes.map(p => new Promise(resolve => p.on('close', resolve))));

    const endTime = Date.now();
    const duration = endTime - startTime;

    // Analyze results
    let actualMessages = 0;
    let corruptedLines = 0;

    if (fs.existsSync(testFile)) {
      const content = fs.readFileSync(testFile, 'utf8');
      const lines = content.split('\n').filter(line => line.trim());
      actualMessages = lines.length;

      // Check for corrupted/malformed JSON lines
      for (const line of lines) {
        try {
          JSON.parse(line);
        } catch (error) {
          corruptedLines++;
        }
      }

      // Clean up test file
      fs.unlinkSync(testFile);
    }

    const messagesPerSecond = Math.round(actualMessages / (duration / 1000));
    const dataLossRate = Math.max(0, (totalMessages - actualMessages) / totalMessages * 100);
    const corruptionRate = (corruptedLines / actualMessages) * 100;

    this.log(`Concurrency test results:`);
    this.log(`  Duration: ${duration}ms`);
    this.log(`  Expected messages: ${totalMessages}`);
    this.log(`  Actual messages: ${actualMessages}`);
    this.log(`  Messages/second: ${messagesPerSecond}`);
    this.log(`  Data loss rate: ${dataLossRate.toFixed(2)}%`);
    this.log(`  Corruption rate: ${corruptionRate.toFixed(2)}%`);

    const testResult = {
      duration,
      expectedMessages: totalMessages,
      actualMessages,
      messagesPerSecond,
      dataLossRate,
      corruptionRate,
      timestamp: new Date().toISOString()
    };

    // Determine test status
    let status = 'PASS';
    let level = 'SUCCESS';

    if (dataLossRate > 5) {
      status = 'FAIL';
      level = 'ERROR';
      this.log('High data loss rate detected', 'ERROR');
    } else if (corruptionRate > 1) {
      status = 'FAIL';
      level = 'ERROR';
      this.log('High corruption rate detected', 'ERROR');
    } else if (messagesPerSecond < 100) {
      status = 'WARN';
      level = 'WARN';
      this.log('Low throughput detected', 'WARN');
    }

    testResult.status = status;
    this.results.concurrencyTest.push(testResult);

    this.log(`Concurrent logging test: ${status}`, level);
    return status === 'PASS';
  }

  // Test sensitive data redaction
  async testDataRedaction() {
    this.log('Starting sensitive data redaction test...');
    
    const testFile = path.join(this.testLogDir, `redaction_test_${Date.now()}.log`);
    
    // Test data containing sensitive information
    const testMessages = [
      { message: 'User login successful', email: 'user@example.com', password: 'secret123' },
      { message: 'API call', token: 'abc123def456', apiKey: 'key_789xyz' },
      { message: 'Payment processed', creditCard: '4111-1111-1111-1111', ssn: '123-45-6789' },
      { message: 'Database connection', dbPassword: 'dbsecret456', connectionString: 'mysql://user:pass@localhost' }
    ];

    // Write test messages to log file
    for (const msg of testMessages) {
      const logMessage = JSON.stringify({
        timestamp: new Date().toISOString(),
        level: 'INFO',
        ...msg
      }) + '\n';
      
      fs.appendFileSync(testFile, logMessage);
    }

    // Analyze log content for sensitive data
    const content = fs.readFileSync(testFile, 'utf8');
    const detectedSensitiveData = [];

    for (const pattern of this.config.sensitivePatterns) {
      const matches = content.match(pattern);
      if (matches) {
        detectedSensitiveData.push({
          pattern: pattern.toString(),
          matches: matches.slice(0, 3) // Limit to first 3 matches
        });
      }
    }

    // Clean up test file
    fs.unlinkSync(testFile);

    const testResult = {
      detectedSensitiveData,
      totalSensitiveItems: detectedSensitiveData.reduce((sum, item) => sum + item.matches.length, 0),
      timestamp: new Date().toISOString()
    };

    if (detectedSensitiveData.length > 0) {
      testResult.status = 'FAIL';
      this.log(`Redaction test: FAIL - ${testResult.totalSensitiveItems} sensitive items found`, 'ERROR');
      detectedSensitiveData.forEach(item => {
        this.log(`  Pattern: ${item.pattern}`, 'ERROR');
        item.matches.forEach(match => {
          this.log(`    Found: ${match}`, 'ERROR');
        });
      });
    } else {
      testResult.status = 'PASS';
      this.log('Redaction test: PASS - No sensitive data detected', 'SUCCESS');
    }

    this.results.redactionTest.push(testResult);
    return testResult.status === 'PASS';
  }

  // Test logging performance under load
  async testLoggingPerformance() {
    this.log('Starting logging performance test...');
    
    const testFile = path.join(this.testLogDir, `performance_test_${Date.now()}.log`);
    const messageCount = 1000;
    const messageSize = 512; // bytes
    
    // Generate test message
    const testMessage = JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'INFO',
      message: 'Performance test message',
      data: 'x'.repeat(messageSize - 100) // Approximate target size
    }) + '\n';

    // Measure logging performance
    const startTime = Date.now();
    
    for (let i = 0; i < messageCount; i++) {
      fs.appendFileSync(testFile, testMessage);
    }
    
    const endTime = Date.now();
    const duration = endTime - startTime;

    // Get file stats
    const stats = fs.statSync(testFile);
    const fileSizeKB = Math.round(stats.size / 1024);
    const throughputMBps = (stats.size / (1024 * 1024)) / (duration / 1000);
    const messagesPerSecond = Math.round(messageCount / (duration / 1000));

    // Clean up test file
    fs.unlinkSync(testFile);

    const testResult = {
      messageCount,
      messageSize,
      duration,
      fileSizeKB,
      throughputMBps: parseFloat(throughputMBps.toFixed(3)),
      messagesPerSecond,
      timestamp: new Date().toISOString()
    };

    // Determine performance status
    let status = 'PASS';
    let level = 'SUCCESS';

    if (messagesPerSecond < 500) {
      status = 'WARN';
      level = 'WARN';
      this.log('Low logging throughput detected', 'WARN');
    } else if (messagesPerSecond < 100) {
      status = 'FAIL';
      level = 'ERROR';
      this.log('Very low logging throughput', 'ERROR');
    }

    testResult.status = status;
    this.results.performanceTest.push(testResult);

    this.log(`Performance test results:`);
    this.log(`  Duration: ${duration}ms`);
    this.log(`  Messages: ${messageCount}`);
    this.log(`  File size: ${fileSizeKB}KB`);
    this.log(`  Throughput: ${throughputMBps} MB/s`);
    this.log(`  Messages/second: ${messagesPerSecond}`);
    this.log(`Performance test: ${status}`, level);

    return status === 'PASS';
  }

  // Generate comprehensive report
  async generateReport() {
    const report = {
      logging_validation: {
        environment: this.config.environment,
        timestamp: new Date().toISOString(),
        results: this.results,
        summary: {
          configValidation: this.results.configValidation.length > 0 ? 
            (this.results.configValidation.every(r => r.status === 'PASS') ? 'PASS' : 'FAIL') : 'SKIPPED',
          concurrencyTest: this.results.concurrencyTest.length > 0 ? 
            this.results.concurrencyTest[0].status : 'SKIPPED',
          redactionTest: this.results.redactionTest.length > 0 ? 
            this.results.redactionTest[0].status : 'SKIPPED',
          performanceTest: this.results.performanceTest.length > 0 ? 
            this.results.performanceTest[0].status : 'SKIPPED'
        }
      }
    };

    const reportFile = path.join(this.testLogDir, `logging_validation_report_${this.formatTimestamp(new Date())}.json`);
    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));

    this.log(`Validation report generated: ${reportFile}`);
    return report;
  }

  // Run all validation tests
  async runAllTests() {
    this.log('Starting comprehensive logging validation...');
    
    const testResults = {};

    try {
      testResults.config = await this.validateLoggingConfig();
      testResults.concurrency = await this.testConcurrentLogging();
      testResults.redaction = await this.testDataRedaction();
      testResults.performance = await this.testLoggingPerformance();

      const report = await this.generateReport();

      // Print summary
      this.log('=== VALIDATION SUMMARY ===');
      this.log(`Configuration: ${testResults.config ? 'PASS' : 'FAIL'}`);
      this.log(`Concurrency: ${testResults.concurrency ? 'PASS' : 'FAIL'}`);
      this.log(`Redaction: ${testResults.redaction ? 'PASS' : 'FAIL'}`);
      this.log(`Performance: ${testResults.performance ? 'PASS' : 'FAIL'}`);

      const allPassed = Object.values(testResults).every(result => result === true);

      if (allPassed) {
        this.log('🎉 All logging validation tests passed!', 'SUCCESS');
        return { success: true, report };
      } else {
        this.log('❌ Some logging validation tests failed', 'ERROR');
        return { success: false, report };
      }

    } catch (error) {
      this.log(`Validation failed with error: ${error.message}`, 'ERROR');
      return { success: false, error: error.message };
    }
  }
}

// CLI handling
function parseArgs() {
  const args = process.argv.slice(2);
  const config = { ...DEFAULT_CONFIG };

  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    const value = args[i + 1];

    switch (flag) {
      case '--env':
      case '--environment':
        config.environment = value;
        i++;
        break;
      case '--concurrency':
        config.concurrency = parseInt(value, 10);
        i++;
        break;
      case '--duration':
        config.testDuration = parseInt(value, 10);
        i++;
        break;
      case '--log-level':
        config.logLevel = value;
        i++;
        break;
      case '--help':
        console.log(`
dhash Logging Validation Script

Usage: node validate_logging.js [OPTIONS]

OPTIONS:
  --env ENV              Environment: staging|production (default: staging)
  --concurrency N        Number of concurrent processes (default: 10)
  --duration SECONDS     Test duration in seconds (default: 30)
  --log-level LEVEL      Expected log level (default: info)
  --help                 Show this help message

Examples:
  node validate_logging.js --env production
  node validate_logging.js --env staging --concurrency 5
  node validate_logging.js --env production --duration 60

Tests performed:
  1. Logging configuration validation
  2. Concurrent logging performance test
  3. Sensitive data redaction test
  4. Logging throughput performance test
        `);
        process.exit(0);
      default:
        if (flag.startsWith('--')) {
          console.error(`Unknown option: ${flag}`);
          process.exit(1);
        }
    }
  }

  return config;
}

// Main execution
if (require.main === module) {
  const config = parseArgs();
  const validator = new LoggingValidator(config);

  validator.runAllTests()
    .then((result) => {
      if (result.success) {
        console.log('\n✅ Logging validation completed successfully');
        process.exit(0);
      } else {
        console.log('\n❌ Logging validation failed');
        if (result.error) {
          console.error(`Error: ${result.error}`);
        }
        process.exit(1);
      }
    })
    .catch((error) => {
      console.error('Logging validation crashed:', error.message);
      process.exit(1);
    });
}

module.exports = LoggingValidator;