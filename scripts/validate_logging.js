#!/usr/bin/env node
/**
 * dhash Logging Validation Script
 * 
 * Validates that dhash logging is working correctly and meets requirements
 * Usage: node scripts/validate_logging.js [--env ENV] [--config PATH] [--verbose]
 */

const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');

// Configuration
const PROJECT_ROOT = path.resolve(__dirname, '..');
const DEFAULT_LOG_DIR = path.join(PROJECT_ROOT, 'monitor_logs');

class LoggingValidator {
  constructor(options = {}) {
    this.environment = options.environment || 'production';
    this.configPath = options.configPath;
    this.verbose = options.verbose || false;
    this.logDir = options.logDir || DEFAULT_LOG_DIR;
    this.testOutputFile = path.join(this.logDir, `test_logging_${this.environment}_${Date.now()}.log`);
    
    // Test results
    this.results = {
      timestamp: new Date().toISOString(),
      environment: this.environment,
      tests: [],
      summary: {
        total: 0,
        passed: 0,
        failed: 0,
        warnings: 0
      }
    };
    
    this.initializeLogging();
  }
  
  initializeLogging() {
    // Ensure log directory exists
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
    
    this.log('info', 'dhash Logging Validation Started');
    this.log('info', `Environment: ${this.environment}`);
    this.log('info', `Log directory: ${this.logDir}`);
  }
  
  log(level, message, data = null) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level: level.toUpperCase(),
      message,
      environment: this.environment,
      ...(data && { data })
    };
    
    // Console output
    if (this.verbose || level === 'error' || level === 'warn') {
      console.log(`[${timestamp}] ${level.toUpperCase()}: ${message}`);
      if (data && this.verbose) {
        console.log('  Data:', JSON.stringify(data, null, 2));
      }
    }
    
    // File output
    this.writeTestLog(logEntry);
  }
  
  writeTestLog(entry) {
    try {
      const logLine = JSON.stringify(entry) + '\n';
      fs.appendFileSync(this.testOutputFile, logLine);
    } catch (error) {
      console.error(`Failed to write to test log: ${error.message}`);
    }
  }
  
  addTestResult(testName, status, details = null, duration = null) {
    const result = {
      test: testName,
      status, // 'pass', 'fail', 'warn'
      duration,
      timestamp: new Date().toISOString(),
      ...(details && { details })
    };
    
    this.results.tests.push(result);
    this.results.summary.total++;
    
    switch (status) {
      case 'pass':
        this.results.summary.passed++;
        this.log('info', `✅ ${testName}`);
        break;
      case 'fail':
        this.results.summary.failed++;
        this.log('error', `❌ ${testName}`, details);
        break;
      case 'warn':
        this.results.summary.warnings++;
        this.log('warn', `⚠️ ${testName}`, details);
        break;
    }
  }
  
  async testLogDirectoryStructure() {
    const testName = 'Log Directory Structure';
    const startTime = Date.now();
    
    try {
      // Check if log directory exists
      if (!fs.existsSync(this.logDir)) {
        this.addTestResult(testName, 'fail', { error: 'Log directory does not exist' });
        return;
      }
      
      // Check directory permissions
      try {
        const testFile = path.join(this.logDir, '.test_write');
        fs.writeFileSync(testFile, 'test');
        fs.unlinkSync(testFile);
      } catch (error) {
        this.addTestResult(testName, 'fail', { error: 'Log directory is not writable' });
        return;
      }
      
      // Check for expected subdirectories or patterns
      const files = fs.readdirSync(this.logDir);
      const logFiles = files.filter(f => f.endsWith('.log') || f.endsWith('.jsonl'));
      
      this.addTestResult(testName, 'pass', { 
        directory: this.logDir,
        log_files_found: logFiles.length,
        total_files: files.length
      }, Date.now() - startTime);
      
    } catch (error) {
      this.addTestResult(testName, 'fail', { error: error.message }, Date.now() - startTime);
    }
  }
  
  async testLogRotation() {
    const testName = 'Log Rotation';
    const startTime = Date.now();
    
    try {
      // Check if there are multiple log files (indicating rotation)
      const files = fs.readdirSync(this.logDir);
      const logFiles = files.filter(f => 
        f.includes('dhash') && 
        (f.endsWith('.log') || f.endsWith('.jsonl'))
      );
      
      if (logFiles.length === 0) {
        this.addTestResult(testName, 'warn', { 
          message: 'No dhash log files found - may be first run',
          log_files: logFiles
        }, Date.now() - startTime);
        return;
      }
      
      // Check file sizes to ensure they're not growing too large
      const largeLogs = [];
      const maxSize = 10 * 1024 * 1024; // 10MB threshold
      
      for (const logFile of logFiles) {
        const filePath = path.join(this.logDir, logFile);
        const stats = fs.statSync(filePath);
        if (stats.size > maxSize) {
          largeLogs.push({ file: logFile, size: stats.size });
        }
      }
      
      if (largeLogs.length > 0) {
        this.addTestResult(testName, 'warn', {
          message: 'Large log files detected - consider rotation',
          large_logs: largeLogs
        }, Date.now() - startTime);
      } else {
        this.addTestResult(testName, 'pass', {
          log_files_checked: logFiles.length,
          largest_size: Math.max(...logFiles.map(f => 
            fs.statSync(path.join(this.logDir, f)).size
          ))
        }, Date.now() - startTime);
      }
      
    } catch (error) {
      this.addTestResult(testName, 'fail', { error: error.message }, Date.now() - startTime);
    }
  }
  
  async testLogFormat() {
    const testName = 'Log Format Validation';
    const startTime = Date.now();
    
    try {
      // Find the most recent dhash log file
      const files = fs.readdirSync(this.logDir);
      const logFiles = files
        .filter(f => f.includes('dhash') && f.endsWith('.log'))
        .map(f => ({ 
          file: f, 
          path: path.join(this.logDir, f),
          mtime: fs.statSync(path.join(this.logDir, f)).mtime 
        }))
        .sort((a, b) => b.mtime - a.mtime);
      
      if (logFiles.length === 0) {
        this.addTestResult(testName, 'warn', { 
          message: 'No dhash log files found for format validation'
        }, Date.now() - startTime);
        return;
      }
      
      const latestLog = logFiles[0];
      const content = fs.readFileSync(latestLog.path, 'utf8');
      const lines = content.trim().split('\n').filter(line => line.trim());
      
      if (lines.length === 0) {
        this.addTestResult(testName, 'warn', {
          message: 'Log file is empty',
          file: latestLog.file
        }, Date.now() - startTime);
        return;
      }
      
      // Validate JSON format for structured logs
      let validJsonLines = 0;
      let totalLines = 0;
      const errors = [];
      
      for (const line of lines.slice(0, 10)) { // Check first 10 lines
        totalLines++;
        try {
          const parsed = JSON.parse(line);
          
          // Check for required fields
          const requiredFields = ['timestamp', 'level', 'message'];
          const missingFields = requiredFields.filter(field => !parsed[field]);
          
          if (missingFields.length === 0) {
            validJsonLines++;
            
            // Validate timestamp format
            if (!new Date(parsed.timestamp).getTime()) {
              errors.push(`Invalid timestamp format: ${parsed.timestamp}`);
            }
            
            // Validate log level
            const validLevels = ['DEBUG', 'INFO', 'WARN', 'ERROR', 'CRITICAL'];
            if (!validLevels.includes(parsed.level.toUpperCase())) {
              errors.push(`Invalid log level: ${parsed.level}`);
            }
          } else {
            errors.push(`Missing required fields: ${missingFields.join(', ')}`);
          }
        } catch (jsonError) {
          errors.push(`Invalid JSON: ${jsonError.message}`);
        }
      }
      
      const validPercentage = (validJsonLines / totalLines) * 100;
      
      if (validPercentage >= 90) {
        this.addTestResult(testName, 'pass', {
          file: latestLog.file,
          valid_lines: validJsonLines,
          total_lines: totalLines,
          valid_percentage: validPercentage.toFixed(1)
        }, Date.now() - startTime);
      } else if (validPercentage >= 50) {
        this.addTestResult(testName, 'warn', {
          file: latestLog.file,
          valid_lines: validJsonLines,
          total_lines: totalLines,
          valid_percentage: validPercentage.toFixed(1),
          errors: errors.slice(0, 3) // Show first 3 errors
        }, Date.now() - startTime);
      } else {
        this.addTestResult(testName, 'fail', {
          file: latestLog.file,
          valid_lines: validJsonLines,
          total_lines: totalLines,
          valid_percentage: validPercentage.toFixed(1),
          errors: errors.slice(0, 5) // Show first 5 errors
        }, Date.now() - startTime);
      }
      
    } catch (error) {
      this.addTestResult(testName, 'fail', { error: error.message }, Date.now() - startTime);
    }
  }
  
  async testLogLevels() {
    const testName = 'Log Level Configuration';
    const startTime = Date.now();
    
    try {
      // Test that we can write log entries at different levels
      const testLevels = ['DEBUG', 'INFO', 'WARN', 'ERROR'];
      const testResults = [];
      
      for (const level of testLevels) {
        try {
          const testMessage = `Test log entry for ${level} level`;
          const testEntry = {
            timestamp: new Date().toISOString(),
            level,
            message: testMessage,
            environment: this.environment,
            test: true
          };
          
          fs.appendFileSync(this.testOutputFile, JSON.stringify(testEntry) + '\n');
          testResults.push({ level, status: 'success' });
        } catch (error) {
          testResults.push({ level, status: 'error', error: error.message });
        }
      }
      
      const successfulLevels = testResults.filter(r => r.status === 'success').length;
      
      if (successfulLevels === testLevels.length) {
        this.addTestResult(testName, 'pass', {
          tested_levels: testLevels,
          successful_levels: successfulLevels
        }, Date.now() - startTime);
      } else {
        this.addTestResult(testName, 'fail', {
          tested_levels: testLevels,
          successful_levels: successfulLevels,
          results: testResults
        }, Date.now() - startTime);
      }
      
    } catch (error) {
      this.addTestResult(testName, 'fail', { error: error.message }, Date.now() - startTime);
    }
  }
  
  async testLogRetention() {
    const testName = 'Log Retention Policy';
    const startTime = Date.now();
    
    try {
      const files = fs.readdirSync(this.logDir);
      const logFiles = files.filter(f => 
        f.includes('dhash') && 
        (f.endsWith('.log') || f.endsWith('.jsonl'))
      );
      
      if (logFiles.length === 0) {
        this.addTestResult(testName, 'warn', {
          message: 'No log files found for retention check'
        }, Date.now() - startTime);
        return;
      }
      
      // Check file ages
      const now = Date.now();
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
      const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
      
      const fileAges = logFiles.map(f => {
        const filePath = path.join(this.logDir, f);
        const stats = fs.statSync(filePath);
        const age = now - stats.mtime.getTime();
        
        return {
          file: f,
          age_days: Math.floor(age / (24 * 60 * 60 * 1000)),
          age_ms: age
        };
      });
      
      const oldFiles = fileAges.filter(f => f.age_ms > thirtyDaysMs);
      const recentFiles = fileAges.filter(f => f.age_ms <= sevenDaysMs);
      
      if (oldFiles.length > 10) {
        this.addTestResult(testName, 'warn', {
          message: 'Many old log files detected - consider cleanup',
          old_files_count: oldFiles.length,
          oldest_file_age_days: Math.max(...fileAges.map(f => f.age_days))
        }, Date.now() - startTime);
      } else {
        this.addTestResult(testName, 'pass', {
          total_files: fileAges.length,
          recent_files: recentFiles.length,
          old_files: oldFiles.length
        }, Date.now() - startTime);
      }
      
    } catch (error) {
      this.addTestResult(testName, 'fail', { error: error.message }, Date.now() - startTime);
    }
  }
  
  async testNotificationFallback() {
    const testName = 'Notification Fallback Logging';
    const startTime = Date.now();
    
    try {
      const fallbackFile = path.join(this.logDir, 'notification_fallback.jsonl');
      
      // Test writing a fallback notification
      const testNotification = {
        timestamp: new Date().toISOString(),
        environment: this.environment,
        level: 'INFO',
        message: 'Test notification fallback',
        test: true,
        fallback_reason: 'Logging validation test'
      };
      
      fs.appendFileSync(fallbackFile, JSON.stringify(testNotification) + '\n');
      
      // Verify the file exists and is readable
      if (fs.existsSync(fallbackFile)) {
        const content = fs.readFileSync(fallbackFile, 'utf8');
        const lines = content.trim().split('\n').filter(line => line.trim());
        
        this.addTestResult(testName, 'pass', {
          fallback_file: fallbackFile,
          total_entries: lines.length,
          test_entry_written: true
        }, Date.now() - startTime);
      } else {
        this.addTestResult(testName, 'fail', {
          error: 'Fallback file was not created'
        }, Date.now() - startTime);
      }
      
    } catch (error) {
      this.addTestResult(testName, 'fail', { error: error.message }, Date.now() - startTime);
    }
  }
  
  async runAllTests() {
    this.log('info', 'Starting logging validation tests...');
    
    const tests = [
      this.testLogDirectoryStructure,
      this.testLogRotation,
      this.testLogFormat,
      this.testLogLevels,
      this.testLogRetention,
      this.testNotificationFallback
    ];
    
    for (const test of tests) {
      try {
        await test.call(this);
      } catch (error) {
        this.log('error', `Test execution failed: ${test.name}`, { error: error.message });
        this.addTestResult(test.name || 'Unknown Test', 'fail', { error: error.message });
      }
    }
    
    this.generateReport();
    return this.results;
  }
  
  generateReport() {
    this.log('info', 'Generating validation report...');
    
    const report = {
      ...this.results,
      report_file: this.testOutputFile,
      success_rate: (this.results.summary.passed / this.results.summary.total * 100).toFixed(1)
    };
    
    // Write detailed report
    const reportFile = path.join(this.logDir, `logging_validation_report_${this.environment}.json`);
    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
    
    // Console summary
    console.log('\n' + '='.repeat(60));
    console.log('dhash LOGGING VALIDATION SUMMARY');
    console.log('='.repeat(60));
    console.log(`Environment: ${this.environment}`);
    console.log(`Timestamp: ${this.results.timestamp}`);
    console.log(`Tests run: ${this.results.summary.total}`);
    console.log(`Passed: ${this.results.summary.passed}`);
    console.log(`Failed: ${this.results.summary.failed}`);
    console.log(`Warnings: ${this.results.summary.warnings}`);
    console.log(`Success rate: ${report.success_rate}%`);
    console.log(`Report file: ${reportFile}`);
    console.log(`Test log: ${this.testOutputFile}`);
    
    if (this.results.summary.failed > 0) {
      console.log('\nFAILED TESTS:');
      this.results.tests
        .filter(t => t.status === 'fail')
        .forEach(t => {
          console.log(`  ❌ ${t.test}: ${t.details?.error || 'See details in report'}`);
        });
    }
    
    if (this.results.summary.warnings > 0) {
      console.log('\nWARNINGS:');
      this.results.tests
        .filter(t => t.status === 'warn')
        .forEach(t => {
          console.log(`  ⚠️ ${t.test}: ${t.details?.message || 'See details in report'}`);
        });
    }
    
    console.log('='.repeat(60));
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const options = {};
  
  for (let i = 0; i < args.length; i += 2) {
    const flag = args[i];
    const value = args[i + 1];
    
    switch (flag) {
      case '--env':
      case '--environment':
        options.environment = value;
        break;
      case '--config':
        options.configPath = value;
        break;
      case '--log-dir':
        options.logDir = value;
        break;
      case '--verbose':
      case '-v':
        options.verbose = true;
        i--; // No value for this flag
        break;
      case '--help':
      case '-h':
        console.log(`
dhash Logging Validation Script

Usage: node scripts/validate_logging.js [options]

Options:
  --env, --environment ENV    Target environment (default: production)
  --config PATH              Path to configuration file
  --log-dir DIR              Log directory to validate (default: monitor_logs)
  --verbose, -v              Enable verbose output
  --help, -h                 Show this help message

Examples:
  node scripts/validate_logging.js --env production --verbose
  node scripts/validate_logging.js --env staging --log-dir ./logs
        `);
        process.exit(0);
      default:
        console.error(`Unknown option: ${flag}`);
        process.exit(1);
    }
  }
  
  try {
    const validator = new LoggingValidator(options);
    const results = await validator.runAllTests();
    
    // Exit with appropriate code
    if (results.summary.failed > 0) {
      process.exit(1); // Failed tests
    } else if (results.summary.warnings > 0) {
      process.exit(2); // Warnings but no failures
    } else {
      process.exit(0); // All tests passed
    }
  } catch (error) {
    console.error(`Logging validation failed: ${error.message}`);
    console.error(error.stack);
    process.exit(3);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('Unhandled error:', error);
    process.exit(3);
  });
}

module.exports = { LoggingValidator };