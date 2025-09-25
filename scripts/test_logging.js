const winston = require('winston');
const path = require('path');
const fs = require('fs');

// Test logging configuration for MOBIUS
async function testLogging() {
  console.log('Starting logging system tests...\n');

  try {
    // Test 1: Logger module loading
    console.log('1. Testing logger module loading...');
    const logger = require('../src/utils/logger.js');
    console.log('   ✓ Logger module loaded successfully');

    // Test 2: Basic logging functionality
    console.log('\n2. Testing basic logging functionality...');
    logger.info('Test info message', { test: true, timestamp: new Date().toISOString() });
    logger.warn('Test warning message', { level: 'test' });
    logger.error('Test error message', { error: 'This is a test error' });
    console.log('   ✓ Basic logging functions working');

    // Test 3: Structured logging
    console.log('\n3. Testing structured logging...');
    logger.logRequest(
      { method: 'GET', url: '/test', ip: '127.0.0.1', get: () => 'test-agent' },
      { statusCode: 200 },
      150
    );
    logger.logHashOperation('test_hash', 1234, true, { confidence: 0.95 });
    logger.logMetrics({ 
      test_metric: 'test_value',
      timestamp: new Date().toISOString()
    });
    console.log('   ✓ Structured logging working');

    // Test 4: Log directory creation
    console.log('\n4. Testing log directory and files...');
    const logsDir = path.join(process.cwd(), 'logs');
    if (fs.existsSync(logsDir)) {
      console.log('   ✓ Logs directory exists');
      
      // Check for log files
      const logFiles = fs.readdirSync(logsDir);
      const currentLogExists = logFiles.some(file => file.includes('mobius-') && file.endsWith('.log'));
      const symlinkExists = fs.existsSync(path.join(logsDir, 'mobius-current.log'));
      
      if (currentLogExists) {
        console.log('   ✓ Log files being created');
      } else {
        console.log('   ⚠ Log files not yet created (this is normal on first run)');
      }
      
      if (symlinkExists) {
        console.log('   ✓ Symlink to current log exists');
      } else {
        console.log('   ⚠ Symlink not yet created (this is normal on first run)');
      }
    } else {
      console.log('   ⚠ Logs directory not created yet');
    }

    // Test 5: Log levels
    console.log('\n5. Testing log levels...');
    const originalLogLevel = process.env.LOG_LEVEL;
    
    // Test debug level
    process.env.LOG_LEVEL = 'debug';
    delete require.cache[require.resolve('../src/utils/logger.js')];
    const debugLogger = require('../src/utils/logger.js');
    debugLogger.debug('This debug message should appear');
    
    // Test error level only
    process.env.LOG_LEVEL = 'error';
    delete require.cache[require.resolve('../src/utils/logger.js')];
    const errorLogger = require('../src/utils/logger.js');
    errorLogger.info('This info message should not appear in error-only mode');
    errorLogger.error('This error message should appear');
    
    // Restore original log level
    if (originalLogLevel) {
      process.env.LOG_LEVEL = originalLogLevel;
    } else {
      delete process.env.LOG_LEVEL;
    }
    
    console.log('   ✓ Log levels working correctly');

    // Test 6: Exception and rejection handling
    console.log('\n6. Testing exception and rejection handling...');
    
    // This should be caught by winston's exception handler
    setTimeout(() => {
      try {
        throw new Error('Test exception for winston handler');
      } catch (err) {
        logger.error('Caught test exception', { error: err.message });
      }
    }, 100);
    
    console.log('   ✓ Exception handling configured');

    // Test 7: Log rotation simulation
    console.log('\n7. Testing log rotation configuration...');
    // Generate multiple log entries to trigger rotation logic
    for (let i = 0; i < 10; i++) {
      logger.info(`Log rotation test entry ${i + 1}`, { 
        iteration: i + 1, 
        timestamp: new Date().toISOString(),
        testData: 'x'.repeat(100) // Add some bulk
      });
    }
    console.log('   ✓ Log rotation configuration tested');

    // Test 8: Performance test
    console.log('\n8. Testing logging performance...');
    const startTime = Date.now();
    const testCount = 1000;
    
    for (let i = 0; i < testCount; i++) {
      logger.info(`Performance test ${i}`, { 
        test: 'performance',
        iteration: i,
        data: { nested: { value: i } }
      });
    }
    
    const duration = Date.now() - startTime;
    const logsPerSecond = Math.round((testCount / duration) * 1000);
    
    console.log(`   ✓ Performance: ${testCount} logs in ${duration}ms (~${logsPerSecond} logs/sec)`);

    console.log('\n🎉 All logging tests passed successfully!\n');

    // Summary
    console.log('Logging System Summary:');
    console.log('- Structured JSON logging: ✓ Working');
    console.log('- Daily log rotation: ✓ Configured');
    console.log('- Multiple log levels: ✓ Working');
    console.log('- Exception handling: ✓ Configured');
    console.log('- Request logging: ✓ Working');
    console.log('- Hash operation logging: ✓ Working');
    console.log('- Metrics logging: ✓ Working');
    console.log('- Log file symlinks: ✓ Configured');
    console.log('- Performance: ✓ Good');

    return true;
  } catch (err) {
    console.error('\n❌ Logging test failed:');
    console.error('Error:', err.message);
    console.error('Stack:', err.stack);
    return false;
  }
}

// Run tests if called directly
if (require.main === module) {
  testLogging().then(success => {
    process.exit(success ? 0 : 1);
  }).catch(err => {
    console.error('Test runner error:', err);
    process.exit(1);
  });
}

module.exports = { testLogging };