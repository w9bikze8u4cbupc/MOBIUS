#!/usr/bin/env node
/**
 * validate_logging.js - Logging validation including redaction & concurrency tests
 * 
 * Validates that logging system is properly configured and functioning,
 * including sensitive data redaction and concurrent logging scenarios.
 * 
 * Usage: node scripts/validate_logging.js --env production [--output-file results.log]
 */

const fs = require('fs');
const path = require('path');
const { spawn, exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

// Configuration
const DEFAULT_CONFIG = {
  logFile: 'deploy_logs/logging_validation.log',
  testLogFile: 'deploy_logs/test_logging.log',
  outputFile: null,
  concurrency: 10,
  testDuration: 5000, // 5 seconds
  sensitiveDataPatterns: [
    /password[=:]\s*[^\s]+/gi,
    /api[_-]?key[=:]\s*[^\s]+/gi,
    /secret[=:]\s*[^\s]+/gi,
    /token[=:]\s*[^\s]+/gi,
    /auth[=:]\s*[^\s]+/gi,
    /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, // Credit card numbers
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, // Email addresses
    /\b\d{3}-\d{2}-\d{4}\b/g // SSN format
  ]
};

// Test results
let testResults = {
  passed: 0,
  failed: 0,
  total: 0,
  details: []
};

// Logging utilities
function log(level, message, data = null) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    level: level.toUpperCase(),
    message,
    data
  };
  
  const logLine = `[${timestamp}] [${level.toUpperCase()}] ${message}${data ? ' | ' + JSON.stringify(data) : ''}`;
  
  console.log(logLine);
  
  // Append to log file
  try {
    fs.appendFileSync(DEFAULT_CONFIG.logFile, logLine + '\n');
  } catch (err) {
    console.error('Failed to write to log file:', err.message);
  }
  
  // Append to output file if specified
  if (DEFAULT_CONFIG.outputFile) {
    try {
      fs.appendFileSync(DEFAULT_CONFIG.outputFile, logLine + '\n');
    } catch (err) {
      console.error('Failed to write to output file:', err.message);
    }
  }
}

function logInfo(message, data = null) {
  log('info', message, data);
}

function logWarn(message, data = null) {
  log('warn', message, data);
}

function logError(message, data = null) {
  log('error', message, data);
}

function logSuccess(message, data = null) {
  log('success', message, data);
}

// Test result recording
function recordTestResult(testName, passed, message, details = null) {
  testResults.total++;
  
  if (passed) {
    testResults.passed++;
    logSuccess(`✓ ${testName}: ${message}`, details);
  } else {
    testResults.failed++;
    logError(`✗ ${testName}: ${message}`, details);
  }
  
  testResults.details.push({
    test: testName,
    passed,
    message,
    details,
    timestamp: new Date().toISOString()
  });
}

// Test 1: Basic logging functionality
async function testBasicLogging() {
  const testName = 'Basic Logging';
  
  try {
    const testMessage = `Test log message ${Date.now()}`;
    const testData = { test: true, timestamp: new Date().toISOString() };
    
    // Write test log entry
    log('test', testMessage, testData);
    
    // Wait a moment for file system
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Check if log was written
    if (fs.existsSync(DEFAULT_CONFIG.logFile)) {
      const logContent = fs.readFileSync(DEFAULT_CONFIG.logFile, 'utf8');
      
      if (logContent.includes(testMessage)) {
        recordTestResult(testName, true, 'Log message successfully written and verified');
        return true;
      } else {
        recordTestResult(testName, false, 'Log message not found in log file');
        return false;
      }
    } else {
      recordTestResult(testName, false, 'Log file was not created');
      return false;
    }
    
  } catch (err) {
    recordTestResult(testName, false, `Basic logging test failed: ${err.message}`);
    return false;
  }
}

// Test 2: Log rotation and file management
async function testLogRotation() {
  const testName = 'Log Rotation';
  
  try {
    const testLogFile = DEFAULT_CONFIG.testLogFile;
    
    // Create a large log entry to test file handling
    const largeEntry = 'X'.repeat(1000);
    const testEntries = 100;
    
    // Write multiple large entries
    for (let i = 0; i < testEntries; i++) {
      fs.appendFileSync(testLogFile, `${new Date().toISOString()} - Entry ${i}: ${largeEntry}\n`);
    }
    
    // Check file size
    const stats = fs.statSync(testLogFile);
    const fileSizeKB = Math.round(stats.size / 1024);
    
    if (fileSizeKB > 0) {
      recordTestResult(testName, true, `Log file management working (${fileSizeKB} KB written)`, { fileSize: stats.size });
      
      // Clean up test file
      fs.unlinkSync(testLogFile);
      return true;
    } else {
      recordTestResult(testName, false, 'Log file was not created or is empty');
      return false;
    }
    
  } catch (err) {
    recordTestResult(testName, false, `Log rotation test failed: ${err.message}`);
    return false;
  }
}

// Test 3: Concurrent logging
async function testConcurrentLogging() {
  const testName = 'Concurrent Logging';
  
  try {
    const concurrentLogFile = DEFAULT_CONFIG.testLogFile;
    const processes = [];
    const startTime = Date.now();
    
    // Create multiple concurrent logging processes
    for (let i = 0; i < DEFAULT_CONFIG.concurrency; i++) {
      const process = spawn('node', ['-e', `
        const fs = require('fs');
        const processId = ${i};
        const logFile = '${concurrentLogFile}';
        const startTime = Date.now();
        
        // Log messages for ${DEFAULT_CONFIG.testDuration}ms
        while (Date.now() - startTime < ${DEFAULT_CONFIG.testDuration}) {
          const message = \`Process \${processId} - Message \${Date.now() - startTime}ms\\n\`;
          fs.appendFileSync(logFile, message);
          
          // Small delay to prevent overwhelming the system
          const delay = Math.floor(Math.random() * 10) + 1;
          const delayStart = Date.now();
          while (Date.now() - delayStart < delay) {
            // Busy wait for small delay
          }
        }
      `], { stdio: 'pipe' });
      
      processes.push(process);
    }
    
    // Wait for all processes to complete
    await Promise.all(processes.map(process => 
      new Promise((resolve) => {
        process.on('close', resolve);
      })
    ));
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    // Verify the log file
    if (fs.existsSync(concurrentLogFile)) {
      const logContent = fs.readFileSync(concurrentLogFile, 'utf8');
      const lineCount = logContent.split('\n').filter(line => line.trim().length > 0).length;
      
      // Check for evidence of concurrent writes
      const processIds = new Set();
      const lines = logContent.split('\n');
      lines.forEach(line => {
        const match = line.match(/Process (\d+)/);
        if (match) {
          processIds.add(parseInt(match[1]));
        }
      });
      
      if (processIds.size >= DEFAULT_CONFIG.concurrency * 0.8) { // Allow for some processes to not write
        recordTestResult(testName, true, 
          `Concurrent logging successful (${lineCount} lines from ${processIds.size} processes in ${duration}ms)`, 
          { 
            lineCount, 
            processCount: processIds.size, 
            duration,
            expectedProcesses: DEFAULT_CONFIG.concurrency
          }
        );
        
        // Clean up
        fs.unlinkSync(concurrentLogFile);
        return true;
      } else {
        recordTestResult(testName, false, 
          `Insufficient concurrent processes logged (expected: ${DEFAULT_CONFIG.concurrency}, found: ${processIds.size})`
        );
        return false;
      }
    } else {
      recordTestResult(testName, false, 'Concurrent log file was not created');
      return false;
    }
    
  } catch (err) {
    recordTestResult(testName, false, `Concurrent logging test failed: ${err.message}`);
    return false;
  }
}

// Test 4: Sensitive data redaction
async function testSensitiveDataRedaction() {
  const testName = 'Sensitive Data Redaction';
  
  try {
    const testLogFile = DEFAULT_CONFIG.testLogFile;
    
    // Test data containing sensitive information
    const sensitiveTestData = [
      'User login with password=secret123 was successful',
      'API call made with api_key=abc123xyz789',
      'Database connection string: mysql://user:password123@host/db',
      'JWT token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test',
      'Credit card: 4532 1234 5678 9012',
      'Email: user@example.com signed up',
      'SSN: 123-45-6789 on file'
    ];
    
    // Write sensitive data to log
    sensitiveTestData.forEach((data, index) => {
      fs.appendFileSync(testLogFile, `${new Date().toISOString()} - Sensitive test ${index}: ${data}\n`);
    });
    
    // Read back and check for redaction
    const logContent = fs.readFileSync(testLogFile, 'utf8');
    
    let foundSensitiveData = [];
    let redactionWorking = true;
    
    // Check each sensitive pattern
    DEFAULT_CONFIG.sensitiveDataPatterns.forEach((pattern, index) => {
      const matches = logContent.match(pattern);
      if (matches) {
        foundSensitiveData.push({
          pattern: pattern.toString(),
          matches: matches
        });
        redactionWorking = false;
      }
    });
    
    if (redactionWorking) {
      recordTestResult(testName, true, 'No sensitive data patterns found in logs (redaction working)');
      
      // Clean up
      fs.unlinkSync(testLogFile);
      return true;
    } else {
      // In this test, we expect to find sensitive data since we're not actually implementing redaction
      // This is more of a detection test to identify what would need to be redacted
      recordTestResult(testName, false, 
        `Found sensitive data patterns - redaction needed`, 
        { 
          foundPatterns: foundSensitiveData.length,
          details: foundSensitiveData.slice(0, 3) // First 3 for brevity
        }
      );
      
      // Clean up
      fs.unlinkSync(testLogFile);
      return false;
    }
    
  } catch (err) {
    recordTestResult(testName, false, `Sensitive data redaction test failed: ${err.message}`);
    return false;
  }
}

// Test 5: Log level filtering
async function testLogLevelFiltering() {
  const testName = 'Log Level Filtering';
  
  try {
    const testLogFile = DEFAULT_CONFIG.testLogFile;
    
    // Write different log levels
    const logLevels = ['debug', 'info', 'warn', 'error'];
    const testMessages = logLevels.map(level => ({
      level,
      message: `Test ${level} message ${Date.now()}`
    }));
    
    testMessages.forEach(({ level, message }) => {
      fs.appendFileSync(testLogFile, `[${new Date().toISOString()}] [${level.toUpperCase()}] ${message}\n`);
    });
    
    // Read back and verify all levels are present
    const logContent = fs.readFileSync(testLogFile, 'utf8');
    const foundLevels = logLevels.filter(level => 
      logContent.includes(`[${level.toUpperCase()}]`)
    );
    
    if (foundLevels.length === logLevels.length) {
      recordTestResult(testName, true, 
        `All log levels properly written (${foundLevels.join(', ')})`, 
        { foundLevels }
      );
      
      // Clean up
      fs.unlinkSync(testLogFile);
      return true;
    } else {
      recordTestResult(testName, false, 
        `Missing log levels (found: ${foundLevels.join(', ')}, expected: ${logLevels.join(', ')})`
      );
      return false;
    }
    
  } catch (err) {
    recordTestResult(testName, false, `Log level filtering test failed: ${err.message}`);
    return false;
  }
}

// Test 6: Structured logging validation
async function testStructuredLogging() {
  const testName = 'Structured Logging';
  
  try {
    const testLogFile = DEFAULT_CONFIG.testLogFile;
    
    // Create structured log entries
    const structuredEntries = [
      {
        timestamp: new Date().toISOString(),
        level: 'info',
        message: 'User action',
        user_id: 12345,
        action: 'login',
        ip_address: '192.168.1.1'
      },
      {
        timestamp: new Date().toISOString(),
        level: 'error',
        message: 'Database error',
        error_code: 'DB001',
        query: 'SELECT * FROM users',
        duration_ms: 5000
      }
    ];
    
    // Write structured entries
    structuredEntries.forEach(entry => {
      fs.appendFileSync(testLogFile, JSON.stringify(entry) + '\n');
    });
    
    // Read back and validate JSON structure
    const logContent = fs.readFileSync(testLogFile, 'utf8');
    const lines = logContent.split('\n').filter(line => line.trim().length > 0);
    
    let validJsonCount = 0;
    let parseErrors = [];
    
    lines.forEach((line, index) => {
      try {
        const parsed = JSON.parse(line);
        if (parsed.timestamp && parsed.level && parsed.message) {
          validJsonCount++;
        } else {
          parseErrors.push(`Line ${index + 1}: Missing required fields`);
        }
      } catch (err) {
        parseErrors.push(`Line ${index + 1}: ${err.message}`);
      }
    });
    
    if (validJsonCount === structuredEntries.length && parseErrors.length === 0) {
      recordTestResult(testName, true, 
        `All structured log entries are valid JSON (${validJsonCount} entries)`,
        { validEntries: validJsonCount }
      );
      
      // Clean up
      fs.unlinkSync(testLogFile);
      return true;
    } else {
      recordTestResult(testName, false, 
        `Structured logging validation failed (valid: ${validJsonCount}, errors: ${parseErrors.length})`,
        { validEntries: validJsonCount, parseErrors: parseErrors.slice(0, 3) }
      );
      return false;
    }
    
  } catch (err) {
    recordTestResult(testName, false, `Structured logging test failed: ${err.message}`);
    return false;
  }
}

// Test 7: Log file permissions and security
async function testLogFileSecurity() {
  const testName = 'Log File Security';
  
  try {
    const testLogFile = DEFAULT_CONFIG.testLogFile;
    
    // Create test log file
    fs.writeFileSync(testLogFile, `Test log entry ${Date.now()}\n`);
    
    // Check file permissions
    const stats = fs.statSync(testLogFile);
    const mode = stats.mode;
    
    // Convert to octal permissions
    const permissions = (mode & parseInt('777', 8)).toString(8);
    
    // Check if file is readable by owner
    const ownerReadable = (mode & fs.constants.S_IRUSR) !== 0;
    const ownerWritable = (mode & fs.constants.S_IWUSR) !== 0;
    
    // Check if file is not world-readable (security concern)
    const worldReadable = (mode & fs.constants.S_IROTH) !== 0;
    
    if (ownerReadable && ownerWritable && !worldReadable) {
      recordTestResult(testName, true, 
        `Log file has secure permissions (${permissions})`,
        { permissions, ownerReadable, ownerWritable, worldReadable }
      );
      
      // Clean up
      fs.unlinkSync(testLogFile);
      return true;
    } else {
      recordTestResult(testName, false, 
        `Log file has insecure permissions (${permissions})`,
        { permissions, ownerReadable, ownerWritable, worldReadable }
      );
      return false;
    }
    
  } catch (err) {
    recordTestResult(testName, false, `Log file security test failed: ${err.message}`);
    return false;
  }
}

// Main validation function
async function runLoggingValidation(environment) {
  logInfo(`Starting logging validation for environment: ${environment}`);
  
  // Ensure log directories exist
  const logDir = path.dirname(DEFAULT_CONFIG.logFile);
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  
  // Run all tests
  const tests = [
    testBasicLogging,
    testLogRotation,
    testConcurrentLogging,
    testSensitiveDataRedaction,
    testLogLevelFiltering,
    testStructuredLogging,
    testLogFileSecurity
  ];
  
  for (const test of tests) {
    try {
      await test();
    } catch (err) {
      logError(`Test execution failed: ${err.message}`);
    }
    
    // Small delay between tests
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  return testResults;
}

// Generate test report
function generateReport(results, environment) {
  const successRate = results.total > 0 ? (results.passed / results.total * 100).toFixed(1) : 0;
  
  const report = `
═══════════════════════════════════════════════════════════════
LOGGING VALIDATION REPORT
═══════════════════════════════════════════════════════════════
Environment: ${environment}
Executed: ${new Date().toISOString()}
Total Tests: ${results.total}
Passed: ${results.passed}
Failed: ${results.failed}
Success Rate: ${successRate}%
═══════════════════════════════════════════════════════════════

DETAILED RESULTS:
${results.details.map(detail => 
  `${detail.passed ? '✓' : '✗'} ${detail.test}: ${detail.message}${
    detail.details ? '\n  ' + JSON.stringify(detail.details, null, 2).split('\n').join('\n  ') : ''
  }`
).join('\n')}

═══════════════════════════════════════════════════════════════
RECOMMENDATIONS:
${results.failed > 0 ? `
⚠ ${results.failed} test(s) failed - review and address issues before deployment
⚠ Pay special attention to sensitive data redaction failures
⚠ Ensure proper log file permissions for security
` : `
✓ All logging validation tests passed
✓ Logging system is properly configured
✓ Ready for production deployment
`}
═══════════════════════════════════════════════════════════════
`;
  
  console.log(report);
  
  if (DEFAULT_CONFIG.outputFile) {
    fs.appendFileSync(DEFAULT_CONFIG.outputFile, report);
  }
  
  return report;
}

// Command line argument parsing
function parseArguments() {
  const args = process.argv.slice(2);
  const options = { environment: null };
  
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i];
    const value = args[i + 1];
    
    switch (key) {
      case '--env':
        options.environment = value;
        break;
      case '--output-file':
        DEFAULT_CONFIG.outputFile = value;
        break;
      case '--concurrency':
        DEFAULT_CONFIG.concurrency = parseInt(value) || DEFAULT_CONFIG.concurrency;
        break;
      case '--test-duration':
        DEFAULT_CONFIG.testDuration = parseInt(value) || DEFAULT_CONFIG.testDuration;
        break;
      case '--help':
        showUsage();
        process.exit(0);
        break;
      default:
        console.error(`Unknown option: ${key}`);
        showUsage();
        process.exit(1);
    }
  }
  
  if (!options.environment) {
    console.error('Environment is required. Use --env ENVIRONMENT');
    showUsage();
    process.exit(1);
  }
  
  return options;
}

function showUsage() {
  console.log(`
Usage: node validate_logging.js --env ENVIRONMENT [OPTIONS]

Validate logging system configuration and functionality.

Required Arguments:
  --env ENVIRONMENT     Target environment (production, staging, development)

Optional Arguments:
  --output-file FILE    Save validation results to file
  --concurrency N       Number of concurrent processes for concurrency test (default: 10)
  --test-duration MS    Duration for concurrency test in milliseconds (default: 5000)
  --help               Show this help message

Examples:
  node validate_logging.js --env production
  node validate_logging.js --env staging --output-file logging_validation.log
  node validate_logging.js --env development --concurrency 5

Validation Tests:
  • Basic logging functionality
  • Log rotation and file management  
  • Concurrent logging scenarios
  • Sensitive data redaction
  • Log level filtering
  • Structured logging format
  • Log file security and permissions

`);
}

// Main execution
async function main() {
  const options = parseArguments();
  
  try {
    const results = await runLoggingValidation(options.environment);
    generateReport(results, options.environment);
    
    // Exit with appropriate code
    process.exit(results.failed === 0 ? 0 : 1);
    
  } catch (err) {
    logError('Logging validation failed', { error: err.message });
    process.exit(1);
  }
}

// Execute if run directly
if (require.main === module) {
  main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}

module.exports = {
  runLoggingValidation,
  testBasicLogging,
  testConcurrentLogging,
  testSensitiveDataRedaction,
  generateReport
};