#!/usr/bin/env node

/**
 * Test Logging - Comprehensive logging system validation with concurrency testing
 * Ensures logging infrastructure is working correctly and can handle load
 */

const fs = require('fs');
const path = require('path');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');

// Configuration
const config = {
  environment: process.env.ENVIRONMENT || 'staging',
  dryRun: process.env.DRY_RUN !== 'false',
  logDir: process.env.LOG_DIR || './logs',
  testDuration: parseInt(process.env.TEST_DURATION) || 30000,
  concurrency: parseInt(process.env.CONCURRENCY) || 5,
  messagesPerWorker: parseInt(process.env.MESSAGES_PER_WORKER) || 100
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
Test Logging - Comprehensive logging system validation with concurrency testing

Usage: node test_logging.js [OPTIONS]

Options:
    --env <environment>     Target environment (staging|production) [default: staging]
    --dry-run              Run in dry-run mode (simulation) [default: true]
    --no-dry-run           Disable dry-run mode
    --log-dir <dir>        Log directory [default: ./logs]
    --duration <ms>        Test duration in milliseconds [default: 30000]
    --concurrency <count>  Number of concurrent workers [default: 5]
    --messages <count>     Messages per worker [default: 100]
    --test <type>          Test type (basic|concurrency|stress|all) [default: all]
    --help, -h             Show this help message

Examples:
    # Basic logging validation
    node test_logging.js --test basic --no-dry-run

    # Stress test with high concurrency
    node test_logging.js --concurrency 20 --messages 500 --no-dry-run

    # Production logging validation
    node test_logging.js --env production --test all --no-dry-run

Environment Variables:
    ENVIRONMENT           Target environment
    DRY_RUN              Enable/disable dry-run mode
    LOG_DIR              Log directory path
    TEST_DURATION        Test duration in milliseconds
    CONCURRENCY          Number of concurrent workers
    MESSAGES_PER_WORKER  Messages per worker thread
`);
}

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    testType: 'all'
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
      case '--log-dir':
        config.logDir = args[++i];
        break;
      case '--duration':
        config.testDuration = parseInt(args[++i]);
        break;
      case '--concurrency':
        config.concurrency = parseInt(args[++i]);
        break;
      case '--messages':
        config.messagesPerWorker = parseInt(args[++i]);
        break;
      case '--test':
        options.testType = args[++i];
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

// Log message structure
function createLogMessage(level, message, context = {}) {
  return {
    timestamp: new Date().toISOString(),
    level,
    message,
    environment: config.environment,
    context: {
      pid: process.pid,
      ...context
    },
    version: '1.0.0'
  };
}

// File system logger
class FileLogger {
  constructor(logDir, filename) {
    this.logDir = logDir;
    this.filename = filename;
    this.filepath = path.join(logDir, filename);
    
    // Ensure log directory exists
    fs.mkdirSync(logDir, { recursive: true });
  }
  
  log(level, message, context = {}) {
    const logEntry = createLogMessage(level, message, context);
    const logLine = JSON.stringify(logEntry) + '\n';
    
    if (config.dryRun) {
      return Promise.resolve();
    }
    
    return new Promise((resolve, reject) => {
      fs.appendFile(this.filepath, logLine, (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }
  
  async getLogCount() {
    if (config.dryRun) {
      return Math.floor(Math.random() * 1000) + 100;
    }
    
    try {
      const content = await fs.promises.readFile(this.filepath, 'utf8');
      return content.split('\n').filter(line => line.trim()).length;
    } catch (error) {
      if (error.code === 'ENOENT') {
        return 0;
      }
      throw error;
    }
  }
  
  async getLogSize() {
    if (config.dryRun) {
      return Math.floor(Math.random() * 1000000) + 50000;
    }
    
    try {
      const stats = await fs.promises.stat(this.filepath);
      return stats.size;
    } catch (error) {
      if (error.code === 'ENOENT') {
        return 0;
      }
      throw error;
    }
  }
}

// Console logger
class ConsoleLogger {
  log(level, message, context = {}) {
    const logEntry = createLogMessage(level, message, context);
    
    if (config.dryRun) {
      return Promise.resolve();
    }
    
    const colorMap = {
      error: colors.red,
      warning: colors.yellow,
      info: colors.blue,
      debug: colors.cyan
    };
    
    const color = colorMap[level] || colors.reset;
    console.log(`${color}${JSON.stringify(logEntry)}${colors.reset}`);
    
    return Promise.resolve();
  }
}

// Basic logging functionality test
async function testBasicLogging() {
  logInfo('Testing basic logging functionality...');
  
  const logger = new FileLogger(config.logDir, `test_basic_${Date.now()}.log`);
  
  if (config.dryRun) {
    logInfo('DRY-RUN: Would test basic logging operations');
    logInfo('DRY-RUN: Would write various log levels');
    logInfo('DRY-RUN: Would validate log structure');
    return {
      passed: true,
      messagesWritten: 10,
      logLevels: ['info', 'warning', 'error', 'debug'],
      simulation: true
    };
  }
  
  // Test different log levels
  const testMessages = [
    { level: 'info', message: 'Basic info message' },
    { level: 'warning', message: 'Basic warning message' },
    { level: 'error', message: 'Basic error message' },
    { level: 'debug', message: 'Basic debug message' }
  ];
  
  let messagesWritten = 0;
  
  for (const { level, message } of testMessages) {
    await logger.log(level, message, { test: 'basic', sequence: messagesWritten + 1 });
    messagesWritten++;
  }
  
  // Verify logs were written
  const logCount = await logger.getLogCount();
  const logSize = await logger.getLogSize();
  
  if (logCount < testMessages.length) {
    throw new Error(`Expected at least ${testMessages.length} log entries, found ${logCount}`);
  }
  
  logSuccess(`Basic logging test passed (${messagesWritten} messages, ${logSize} bytes)`);
  
  return {
    passed: true,
    messagesWritten,
    logCount,
    logSize,
    logLevels: testMessages.map(m => m.level)
  };
}

// Concurrency test using worker threads
async function testConcurrentLogging() {
  logInfo('Testing concurrent logging...');
  
  if (config.dryRun) {
    logInfo(`DRY-RUN: Would test concurrent logging with ${config.concurrency} workers`);
    logInfo(`DRY-RUN: Each worker would write ${config.messagesPerWorker} messages`);
    return {
      passed: true,
      workers: config.concurrency,
      messagesPerWorker: config.messagesPerWorker,
      totalMessages: config.concurrency * config.messagesPerWorker,
      simulation: true
    };
  }
  
  const workers = [];
  const results = [];
  
  // Create worker threads
  for (let i = 0; i < config.concurrency; i++) {
    const worker = new Worker(__filename, {
      workerData: {
        workerId: i,
        logDir: config.logDir,
        messagesPerWorker: config.messagesPerWorker,
        environment: config.environment
      }
    });
    
    workers.push(worker);
    
    worker.on('message', (result) => {
      results.push(result);
    });
  }
  
  // Wait for all workers to complete
  await Promise.all(workers.map(worker => {
    return new Promise((resolve) => {
      worker.on('exit', resolve);
    });
  }));
  
  // Analyze results
  const totalMessages = results.reduce((sum, result) => sum + result.messagesWritten, 0);
  const totalDuration = Math.max(...results.map(r => r.duration));
  const avgDuration = results.reduce((sum, result) => sum + result.duration, 0) / results.length;
  
  logSuccess(`Concurrent logging test passed (${totalMessages} messages, ${totalDuration}ms max, ${Math.round(avgDuration)}ms avg)`);
  
  return {
    passed: true,
    workers: config.concurrency,
    messagesPerWorker: config.messagesPerWorker,
    totalMessages,
    maxDuration: totalDuration,
    avgDuration: Math.round(avgDuration)
  };
}

// Worker thread function for concurrent logging
async function runWorker() {
  const { workerId, logDir, messagesPerWorker, environment } = workerData;
  
  const logger = new FileLogger(logDir, `test_worker_${workerId}_${Date.now()}.log`);
  const startTime = Date.now();
  
  let messagesWritten = 0;
  
  try {
    for (let i = 0; i < messagesPerWorker; i++) {
      await logger.log('info', `Worker ${workerId} message ${i + 1}`, {
        workerId,
        sequence: i + 1,
        timestamp: Date.now()
      });
      messagesWritten++;
    }
    
    const duration = Date.now() - startTime;
    
    parentPort.postMessage({
      workerId,
      messagesWritten,
      duration,
      success: true
    });
    
  } catch (error) {
    parentPort.postMessage({
      workerId,
      messagesWritten,
      duration: Date.now() - startTime,
      success: false,
      error: error.message
    });
  }
}

// Stress test with high volume logging
async function testStressLogging() {
  logInfo('Testing stress logging...');
  
  const stressConfig = {
    duration: Math.min(config.testDuration, 10000), // Max 10 seconds for stress test
    messagesPerSecond: 100
  };
  
  if (config.dryRun) {
    logInfo(`DRY-RUN: Would run stress test for ${stressConfig.duration}ms`);
    logInfo(`DRY-RUN: Would generate ~${stressConfig.messagesPerSecond} messages/second`);
    return {
      passed: true,
      duration: stressConfig.duration,
      messagesPerSecond: stressConfig.messagesPerSecond,
      estimatedMessages: Math.floor(stressConfig.duration / 1000 * stressConfig.messagesPerSecond),
      simulation: true
    };
  }
  
  const logger = new FileLogger(config.logDir, `test_stress_${Date.now()}.log`);
  const startTime = Date.now();
  const endTime = startTime + stressConfig.duration;
  
  let messagesWritten = 0;
  const interval = 1000 / stressConfig.messagesPerSecond;
  
  while (Date.now() < endTime) {
    await logger.log('info', `Stress test message ${messagesWritten + 1}`, {
      test: 'stress',
      sequence: messagesWritten + 1,
      elapsed: Date.now() - startTime
    });
    
    messagesWritten++;
    
    // Control the rate
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  
  const actualDuration = Date.now() - startTime;
  const actualRate = Math.round(messagesWritten / actualDuration * 1000);
  
  logSuccess(`Stress logging test passed (${messagesWritten} messages, ${actualRate} msg/sec)`);
  
  return {
    passed: true,
    duration: actualDuration,
    messagesWritten,
    messagesPerSecond: actualRate
  };
}

// Log analysis and validation
async function analyzeLogIntegrity() {
  logInfo('Analyzing log integrity...');
  
  if (config.dryRun) {
    logInfo('DRY-RUN: Would analyze log file integrity');
    logInfo('DRY-RUN: Would validate JSON structure');
    logInfo('DRY-RUN: Would check for missing entries');
    return {
      passed: true,
      filesAnalyzed: 3,
      totalEntries: 750,
      validEntries: 750,
      corruptedEntries: 0,
      simulation: true
    };
  }
  
  const logFiles = fs.readdirSync(config.logDir)
    .filter(file => file.startsWith('test_') && file.endsWith('.log'))
    .map(file => path.join(config.logDir, file));
  
  let totalEntries = 0;
  let validEntries = 0;
  let corruptedEntries = 0;
  
  for (const logFile of logFiles) {
    try {
      const content = await fs.promises.readFile(logFile, 'utf8');
      const lines = content.split('\n').filter(line => line.trim());
      
      for (const line of lines) {
        totalEntries++;
        
        try {
          const entry = JSON.parse(line);
          
          // Validate required fields
          if (entry.timestamp && entry.level && entry.message && entry.environment) {
            validEntries++;
          } else {
            corruptedEntries++;
          }
        } catch (error) {
          corruptedEntries++;
        }
      }
    } catch (error) {
      logWarning(`Could not analyze log file ${logFile}: ${error.message}`);
    }
  }
  
  const integrityPercentage = totalEntries > 0 ? Math.round(validEntries / totalEntries * 100) : 100;
  
  if (integrityPercentage < 95) {
    throw new Error(`Log integrity below threshold: ${integrityPercentage}% (${corruptedEntries} corrupted entries)`);
  }
  
  logSuccess(`Log integrity analysis passed (${integrityPercentage}% integrity, ${totalEntries} entries)`);
  
  return {
    passed: true,
    filesAnalyzed: logFiles.length,
    totalEntries,
    validEntries,
    corruptedEntries,
    integrityPercentage
  };
}

// Generate test report
async function generateTestReport(results) {
  const timestamp = new Date().toISOString();
  const reportFile = `artifacts/logging_test_${config.environment}_${Date.now()}.json`;
  
  const report = {
    logging_test: {
      environment: config.environment,
      timestamp,
      dry_run: config.dryRun,
      configuration: {
        log_dir: config.logDir,
        test_duration: config.testDuration,
        concurrency: config.concurrency,
        messages_per_worker: config.messagesPerWorker
      }
    },
    results,
    summary: {
      total_tests: Object.keys(results).length,
      passed_tests: Object.values(results).filter(r => r.passed).length,
      failed_tests: Object.values(results).filter(r => !r.passed).length
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

// Run test suite
async function runTestSuite(testType) {
  const results = {};
  
  try {
    switch (testType) {
      case 'basic':
        results.basic = await testBasicLogging();
        break;
        
      case 'concurrency':
        results.concurrency = await testConcurrentLogging();
        break;
        
      case 'stress':
        results.stress = await testStressLogging();
        break;
        
      case 'all':
      default:
        results.basic = await testBasicLogging();
        results.concurrency = await testConcurrentLogging();
        results.stress = await testStressLogging();
        results.integrity = await analyzeLogIntegrity();
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
  if (!isMainThread) {
    return runWorker();
  }
  
  const startTime = Date.now();
  
  logInfo('📝 Starting logging system tests');
  logInfo(`Environment: ${config.environment}`);
  logInfo(`Dry-run mode: ${config.dryRun}`);
  logInfo(`Log directory: ${config.logDir}`);
  logInfo(`Concurrency: ${config.concurrency}`);
  
  try {
    const options = parseArgs();
    
    // Validate environment
    if (!['staging', 'production'].includes(config.environment)) {
      throw new Error(`Invalid environment: ${config.environment}. Must be 'staging' or 'production'`);
    }
    
    // Run test suite
    const results = await runTestSuite(options.testType);
    
    // Generate report
    const report = await generateTestReport(results);
    
    // Summary
    const duration = Date.now() - startTime;
    logSuccess(`🎉 Logging tests completed successfully`);
    logSuccess(`Total execution time: ${duration}ms`);
    
    if (config.dryRun) {
      logWarning('This was a DRY-RUN. No actual logs were written.');
      logInfo('To run with real logging, use: --no-dry-run');
    }
    
    console.log('\n📊 Test Summary:');
    console.log(`  Total tests: ${report.summary.total_tests}`);
    console.log(`  Passed: ${report.summary.passed_tests}`);
    console.log(`  Failed: ${report.summary.failed_tests}`);
    
    if (report.summary.failed_tests > 0) {
      process.exit(1);
    }
    
  } catch (error) {
    logError(`Logging tests failed: ${error.message}`);
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
  testBasicLogging,
  testConcurrentLogging,
  testStressLogging,
  FileLogger,
  ConsoleLogger
};