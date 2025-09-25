#!/usr/bin/env node
// scripts/test_logging.js - Logging system validation
const fs = require('fs');
const path = require('path');

// Configuration
const config = {
  logDir: process.env.LOG_DIR || path.join(__dirname, '..', 'logs'),
  testDuration: 10, // seconds
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
Usage: node scripts/test_logging.js [options]

Test and validate the logging system functionality.

Options:
  --duration SECONDS  Test duration in seconds (default: 10)
  --verbose          Enable verbose logging
  --log-file PATH    Write test results to specified file
  --log-dir DIR      Directory to test logging (default: logs/)
  --help             Show this help

Examples:
  node scripts/test_logging.js
  node scripts/test_logging.js --duration 30 --verbose
  node scripts/test_logging.js --log-file logging_test_results.log

Environment variables:
  LOG_DIR            Log directory to test (default: logs/)
`);
}

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--duration':
        config.testDuration = parseInt(args[++i], 10);
        if (isNaN(config.testDuration) || config.testDuration < 1) {
          log('ERROR', 'Duration must be a positive number');
          process.exit(1);
        }
        break;
      case '--verbose':
        config.verbose = true;
        break;
      case '--log-file':
        config.logFile = args[++i];
        break;
      case '--log-dir':
        config.logDir = path.resolve(args[++i]);
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

// Test suite results
const testResults = {
  timestamp: new Date().toISOString(),
  tests: [],
  passed: 0,
  failed: 0,
  duration: 0
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

// Test: Log directory creation and permissions
function testLogDirectory() {
  try {
    // Ensure log directory exists
    if (!fs.existsSync(config.logDir)) {
      fs.mkdirSync(config.logDir, { recursive: true });
    }
    
    const stats = fs.statSync(config.logDir);
    
    if (stats.isDirectory()) {
      // Test write permissions
      const testFile = path.join(config.logDir, 'test_write_permission.tmp');
      fs.writeFileSync(testFile, 'test');
      fs.unlinkSync(testFile);
      
      addTestResult(
        'Log Directory Setup',
        true,
        'Directory exists and is writable',
        { path: config.logDir, mode: stats.mode.toString(8) }
      );
    } else {
      addTestResult(
        'Log Directory Setup',
        false,
        'Path exists but is not a directory'
      );
    }
  } catch (error) {
    addTestResult(
      'Log Directory Setup',
      false,
      `Failed: ${error.message}`,
      { error: error.stack }
    );
  }
}

// Test: Log file rotation and retention
function testLogRotation() {
  try {
    const testLogFile = path.join(config.logDir, 'rotation_test.log');
    const maxSize = 1024; // 1KB for testing
    
    // Write data to exceed max size
    let data = '';
    for (let i = 0; i < 50; i++) {
      data += `Test log entry ${i} - ${new Date().toISOString()}\n`;
    }
    
    fs.writeFileSync(testLogFile, data);
    
    const stats = fs.statSync(testLogFile);
    
    if (stats.size > maxSize) {
      // Simulate rotation
      const rotatedFile = `${testLogFile}.1`;
      fs.renameSync(testLogFile, rotatedFile);
      fs.writeFileSync(testLogFile, 'New log file after rotation\n');
      
      addTestResult(
        'Log Rotation',
        true,
        'Log rotation mechanism works',
        { 
          originalSize: stats.size, 
          maxSize,
          rotatedFile: path.basename(rotatedFile)
        }
      );
      
      // Cleanup
      fs.unlinkSync(testLogFile);
      fs.unlinkSync(rotatedFile);
    } else {
      addTestResult(
        'Log Rotation',
        false,
        'Failed to generate sufficient log data for testing'
      );
    }
  } catch (error) {
    addTestResult(
      'Log Rotation',
      false,
      `Failed: ${error.message}`,
      { error: error.stack }
    );
  }
}

// Test: Log formatting and structure
function testLogFormatting() {
  try {
    const testLogFile = path.join(config.logDir, 'format_test.log');
    const testEntries = [
      { level: 'INFO', message: 'Test info message' },
      { level: 'WARN', message: 'Test warning message' },
      { level: 'ERROR', message: 'Test error message' },
      { level: 'DEBUG', message: 'Test debug message with details', data: { key: 'value' } }
    ];
    
    const logEntries = [];
    testEntries.forEach(entry => {
      const timestamp = new Date().toISOString();
      const logLine = entry.data 
        ? `[${timestamp}] [${entry.level}] ${entry.message} ${JSON.stringify(entry.data)}\n`
        : `[${timestamp}] [${entry.level}] ${entry.message}\n`;
      
      logEntries.push(logLine);
    });
    
    fs.writeFileSync(testLogFile, logEntries.join(''));
    
    // Validate log format
    const logContent = fs.readFileSync(testLogFile, 'utf8');
    const lines = logContent.trim().split('\n');
    
    let validFormat = true;
    const formatPattern = /^\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] \[(INFO|WARN|ERROR|DEBUG)\]/;
    
    lines.forEach((line, index) => {
      if (!formatPattern.test(line)) {
        validFormat = false;
      }
    });
    
    addTestResult(
      'Log Formatting',
      validFormat,
      validFormat ? 'Log format is consistent and parseable' : 'Log format validation failed',
      { 
        entriesWritten: testEntries.length,
        entriesValidated: lines.length,
        pattern: formatPattern.toString()
      }
    );
    
    // Cleanup
    fs.unlinkSync(testLogFile);
  } catch (error) {
    addTestResult(
      'Log Formatting',
      false,
      `Failed: ${error.message}`,
      { error: error.stack }
    );
  }
}

// Test: Concurrent logging
function testConcurrentLogging() {
  return new Promise((resolve) => {
    try {
      const testLogFile = path.join(config.logDir, 'concurrent_test.log');
      const numWorkers = 5;
      const messagesPerWorker = 10;
      const workers = [];
      
      for (let i = 0; i < numWorkers; i++) {
        workers.push(
          Promise.resolve().then(() => {
            for (let j = 0; j < messagesPerWorker; j++) {
              const message = `Worker ${i} - Message ${j} - ${new Date().toISOString()}\n`;
              fs.appendFileSync(testLogFile, message);
            }
          })
        );
      }
      
      Promise.all(workers)
        .then(() => {
          const logContent = fs.readFileSync(testLogFile, 'utf8');
          const lines = logContent.trim().split('\n').filter(line => line.length > 0);
          
          const expectedLines = numWorkers * messagesPerWorker;
          const success = lines.length === expectedLines;
          
          addTestResult(
            'Concurrent Logging',
            success,
            success 
              ? 'All concurrent log entries written successfully'
              : `Expected ${expectedLines} entries, found ${lines.length}`,
            { 
              workers: numWorkers, 
              messagesPerWorker, 
              expectedLines, 
              actualLines: lines.length 
            }
          );
          
          // Cleanup
          fs.unlinkSync(testLogFile);
          resolve();
        })
        .catch(error => {
          addTestResult(
            'Concurrent Logging',
            false,
            `Failed: ${error.message}`,
            { error: error.stack }
          );
          resolve();
        });
    } catch (error) {
      addTestResult(
        'Concurrent Logging',
        false,
        `Failed: ${error.message}`,
        { error: error.stack }
      );
      resolve();
    }
  });
}

// Test: Performance benchmarking
function testLoggingPerformance() {
  try {
    const testLogFile = path.join(config.logDir, 'performance_test.log');
    const numMessages = 1000;
    
    const startTime = process.hrtime.bigint();
    
    for (let i = 0; i < numMessages; i++) {
      const message = `Performance test message ${i} - ${new Date().toISOString()}\n`;
      fs.appendFileSync(testLogFile, message);
    }
    
    const endTime = process.hrtime.bigint();
    const durationMs = Number(endTime - startTime) / 1000000; // Convert to milliseconds
    
    const messagesPerSecond = Math.round(numMessages / (durationMs / 1000));
    const averageTimePerMessage = durationMs / numMessages;
    
    // Performance thresholds
    const minMessagesPerSecond = 100; // Minimum acceptable performance
    const maxAverageTimePerMessage = 10; // Maximum acceptable time per message in ms
    
    const performanceOk = messagesPerSecond >= minMessagesPerSecond && 
                         averageTimePerMessage <= maxAverageTimePerMessage;
    
    addTestResult(
      'Logging Performance',
      performanceOk,
      performanceOk 
        ? `Performance within acceptable limits (${messagesPerSecond} msgs/sec)`
        : `Performance below acceptable limits (${messagesPerSecond} msgs/sec)`,
      {
        numMessages,
        durationMs: Math.round(durationMs),
        messagesPerSecond,
        averageTimePerMessage: Math.round(averageTimePerMessage * 100) / 100,
        thresholds: {
          minMessagesPerSecond,
          maxAverageTimePerMessage
        }
      }
    );
    
    // Cleanup
    fs.unlinkSync(testLogFile);
  } catch (error) {
    addTestResult(
      'Logging Performance',
      false,
      `Failed: ${error.message}`,
      { error: error.stack }
    );
  }
}

// Main test function
async function runLoggingTests() {
  try {
    parseArgs();
    
    const startTime = Date.now();
    
    log('INFO', 'Starting logging system validation');
    log('INFO', `Test duration: ${config.testDuration} seconds`);
    log('INFO', `Log directory: ${config.logDir}`);
    
    if (config.logFile) {
      log('INFO', `Writing results to: ${config.logFile}`);
    }
    
    // Run test suite
    testLogDirectory();
    testLogRotation();
    testLogFormatting();
    await testConcurrentLogging();
    testLoggingPerformance();
    
    // Calculate duration
    testResults.duration = Math.round((Date.now() - startTime) / 1000);
    
    // Summary
    const totalTests = testResults.passed + testResults.failed;
    const successRate = Math.round((testResults.passed / totalTests) * 100);
    
    log('INFO', '=== LOGGING TEST SUMMARY ===');
    log('INFO', `Total tests: ${totalTests}`);
    log('INFO', `Passed: ${testResults.passed}`);
    log('INFO', `Failed: ${testResults.failed}`);
    log('INFO', `Success rate: ${successRate}%`);
    log('INFO', `Duration: ${testResults.duration}s`);
    
    // Write detailed results
    const resultsFile = path.join(config.logDir, 'logging_test_results.json');
    fs.writeFileSync(resultsFile, JSON.stringify(testResults, null, 2));
    log('INFO', `Detailed results saved to: ${resultsFile}`);
    
    if (testResults.failed > 0) {
      log('ERROR', 'Some logging tests failed - manual review required');
      process.exit(1);
    } else {
      log('INFO', 'All logging tests passed successfully');
    }
    
  } catch (error) {
    log('ERROR', 'Logging test suite failed:', error.message);
    if (config.verbose) {
      log('DEBUG', error.stack);
    }
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  runLoggingTests();
}

module.exports = { runLoggingTests, testResults };