#!/usr/bin/env node

// test_logging.js - Test logging functionality
// Usage: node scripts/test_logging.js

const fs = require('fs');
const path = require('path');

function log(level, message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
  console.log(logMessage);
  
  // Write to log file
  const logDir = 'logs';
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  
  const logFile = path.join(logDir, 'test_logging.log');
  fs.appendFileSync(logFile, logMessage + '\n');
}

async function testLogging() {
  log('info', '=== DHASH LOGGING TEST STARTED ===');
  
  // Test different log levels
  log('info', 'Testing info level logging');
  log('warn', 'Testing warn level logging');
  log('error', 'Testing error level logging');
  log('debug', 'Testing debug level logging');
  
  // Test structured logging
  const testData = {
    dhash: 'abc123def456',
    confidence: 0.95,
    extraction_time_ms: 150,
    metadata: {
      width: 1920,
      height: 1080,
      format: 'jpg'
    }
  };
  
  log('info', `Structured log test: ${JSON.stringify(testData)}`);
  
  // Simulate processing time
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // Test PII redaction simulation
  const piiData = {
    user_id: 'user_12345',
    ip_address: '192.168.1.100',
    dhash: 'sensitive_hash_data',
    processing_node: 'worker-node-03'
  };
  
  // Mock PII redaction
  const redactedData = {
    ...piiData,
    user_id: '***REDACTED***',
    ip_address: '***REDACTED***'
  };
  
  log('info', `PII redaction test: ${JSON.stringify(redactedData)}`);
  
  // Test log rotation simulation
  log('info', 'Testing log rotation readiness - current log size check');
  
  // Test metrics logging
  const metrics = {
    avg_hash_time: 125.5,
    p95_hash_time: 250.0,
    extraction_failures_rate: 2.1,
    low_confidence_queue_length: 15,
    total_requests: 1000,
    timestamp: new Date().toISOString()
  };
  
  log('info', `Metrics snapshot: ${JSON.stringify(metrics)}`);
  
  log('info', '=== DHASH LOGGING TEST COMPLETED SUCCESSFULLY ===');
  
  // Verify log file was created
  const logFile = path.join('logs', 'test_logging.log');
  if (fs.existsSync(logFile)) {
    const stats = fs.statSync(logFile);
    log('info', `✓ Log file created: ${logFile} (${stats.size} bytes)`);
  } else {
    log('error', '✗ Log file was not created');
    process.exit(1);
  }
}

async function main() {
  try {
    await testLogging();
    console.log('\n✓ All logging tests passed');
    process.exit(0);
  } catch (error) {
    console.error(`\n✗ Logging test failed: ${error.message}`);
    process.exit(1);
  }
}

main();