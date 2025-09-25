#!/usr/bin/env node

// scripts/test_logging.js
// Logging validation script for MOBIUS video generation pipeline

const fs = require('fs');
const path = require('path');

function validateLogLevel(level) {
  const validLevels = ['debug', 'info', 'warn', 'error'];
  if (!validLevels.includes(level.toLowerCase())) {
    throw new Error(`Invalid log level '${level}'. Must be one of: ${validLevels.join(', ')}`);
  }
}

function testLogOutput(message, level = 'info') {
  validateLogLevel(level);
  
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
  
  // Test console output
  console.log(logEntry);
  
  return {
    timestamp,
    level: level.toUpperCase(),
    message,
    formatted: logEntry
  };
}

function testLogLevels() {
  console.log('Testing log levels...');
  
  const testCases = [
    { level: 'debug', message: 'Debug message for troubleshooting' },
    { level: 'info', message: 'Informational message about normal operation' },
    { level: 'warn', message: 'Warning about potential issue' },
    { level: 'error', message: 'Error message for critical problems' }
  ];

  const results = [];
  
  for (const testCase of testCases) {
    try {
      const result = testLogOutput(testCase.message, testCase.level);
      results.push({ ...testCase, success: true, result });
      console.log(`  ✓ ${testCase.level.toUpperCase()} level logging works`);
    } catch (error) {
      results.push({ ...testCase, success: false, error: error.message });
      console.error(`  ✗ ${testCase.level.toUpperCase()} level logging failed: ${error.message}`);
    }
  }
  
  return results;
}

function testLogFormatting() {
  console.log('\nTesting log formatting...');
  
  const testMessages = [
    'Simple message',
    'Message with special chars: !@#$%^&*()',
    'Message with "quotes" and \'apostrophes\'',
    'Message with Unicode: 🎮 🎯 ✨',
    'Very long message that might need wrapping or truncation in some logging systems: ' + 'Lorem ipsum '.repeat(20)
  ];

  const results = [];
  
  for (let i = 0; i < testMessages.length; i++) {
    try {
      const result = testLogOutput(testMessages[i], 'info');
      results.push({ message: testMessages[i], success: true, result });
      console.log(`  ✓ Message ${i + 1} formatted correctly`);
    } catch (error) {
      results.push({ message: testMessages[i], success: false, error: error.message });
      console.error(`  ✗ Message ${i + 1} formatting failed: ${error.message}`);
    }
  }
  
  return results;
}

function testLogStructure() {
  console.log('\nTesting log structure compliance...');
  
  // Test that logs contain required fields
  const testLog = testLogOutput('Structure test message', 'info');
  const checks = [
    { 
      name: 'timestamp', 
      test: () => testLog.timestamp && !isNaN(Date.parse(testLog.timestamp)),
      description: 'Has valid ISO timestamp' 
    },
    { 
      name: 'level', 
      test: () => testLog.level && typeof testLog.level === 'string',
      description: 'Has log level field' 
    },
    { 
      name: 'message', 
      test: () => testLog.message && typeof testLog.message === 'string',
      description: 'Has message field' 
    },
    { 
      name: 'formatted', 
      test: () => testLog.formatted && testLog.formatted.includes(testLog.timestamp) && testLog.formatted.includes(testLog.level) && testLog.formatted.includes(testLog.message),
      description: 'Formatted output contains all required elements' 
    }
  ];

  const results = [];
  
  for (const check of checks) {
    try {
      const passed = check.test();
      results.push({ ...check, success: passed });
      console.log(`  ${passed ? '✓' : '✗'} ${check.description}`);
      if (!passed) {
        console.error(`    Expected check '${check.name}' to pass`);
      }
    } catch (error) {
      results.push({ ...check, success: false, error: error.message });
      console.error(`  ✗ ${check.description}: ${error.message}`);
    }
  }
  
  return results;
}

function testVideoProcessingLogging() {
  console.log('\nTesting video processing specific logging...');
  
  // Simulate video processing log scenarios
  const scenarios = [
    { context: 'video_start', message: 'Starting video processing for game: Sushi Go' },
    { context: 'ffmpeg_command', message: 'Executing FFmpeg command: ffmpeg -i input.mp4 -vf scale=1920:1080 output.mp4' },
    { context: 'frame_extraction', message: 'Extracting frame at timestamp: 5.0s' },
    { context: 'audio_analysis', message: 'Audio LUFS measurement: -23.2 LUFS' },
    { context: 'golden_test', message: 'SSIM comparison result: 0.998 (threshold: 0.995)' },
    { context: 'video_complete', message: 'Video processing completed successfully in 45.2s' }
  ];

  const results = [];
  
  for (const scenario of scenarios) {
    try {
      const contextMessage = `[${scenario.context}] ${scenario.message}`;
      const result = testLogOutput(contextMessage, 'info');
      results.push({ ...scenario, success: true, result });
      console.log(`  ✓ ${scenario.context} logging works`);
    } catch (error) {
      results.push({ ...scenario, success: false, error: error.message });
      console.error(`  ✗ ${scenario.context} logging failed: ${error.message}`);
    }
  }
  
  return results;
}

function generateLogReport(results) {
  const allTests = results.flat();
  const totalTests = allTests.length;
  const passedTests = allTests.filter(test => test.success).length;
  const failedTests = totalTests - passedTests;
  
  console.log('\n' + '='.repeat(50));
  console.log('LOGGING VALIDATION REPORT');
  console.log('='.repeat(50));
  console.log(`Total Tests: ${totalTests}`);
  console.log(`Passed: ${passedTests}`);
  console.log(`Failed: ${failedTests}`);
  console.log(`Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);
  
  if (failedTests > 0) {
    console.log('\nFailed Tests:');
    allTests.filter(test => !test.success).forEach(test => {
      console.log(`  - ${test.name || test.context || 'Unknown'}: ${test.error || 'Unknown error'}`);
    });
  }
  
  return {
    total: totalTests,
    passed: passedTests,
    failed: failedTests,
    successRate: (passedTests / totalTests) * 100
  };
}

async function main() {
  console.log('MOBIUS Logging Validation Test');
  console.log('==============================\n');
  
  try {
    // Run all logging tests
    const results = [
      testLogLevels(),
      testLogFormatting(),
      testLogStructure(),
      testVideoProcessingLogging()
    ];
    
    const report = generateLogReport(results);
    
    // Exit with appropriate code
    if (report.failed === 0) {
      console.log('\n✓ All logging tests passed!');
      process.exit(0);
    } else {
      console.error(`\n✗ ${report.failed} logging tests failed`);
      process.exit(1);
    }
  } catch (error) {
    console.error('Logging validation failed with unexpected error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}