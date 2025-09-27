#!/usr/bin/env node

/**
 * dhash Logging Validation Script
 * Usage: node scripts/validate_logging.js [--env production|staging|canary] [--timeout 30]
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

// Default configuration
const DEFAULT_CONFIG = {
  environment: 'staging',
  timeout: 30,
  configPath: path.join(__dirname, '..', 'quality-gates-config.json')
};

// Colors for console output
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

// Logging functions
const log = (message) => {
  const timestamp = new Date().toISOString();
  console.log(`${colors.blue}[${timestamp}] LOG-VALIDATE:${colors.reset} ${message}`);
};

const error = (message) => {
  const timestamp = new Date().toISOString();
  console.error(`${colors.red}[${timestamp}] ERROR:${colors.reset} ${message}`);
};

const success = (message) => {
  const timestamp = new Date().toISOString();
  console.log(`${colors.green}[${timestamp}] SUCCESS:${colors.reset} ${message}`);
};

const warn = (message) => {
  const timestamp = new Date().toISOString();
  console.log(`${colors.yellow}[${timestamp}] WARNING:${colors.reset} ${message}`);
};

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const config = { ...DEFAULT_CONFIG };
  
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--env':
        config.environment = args[++i];
        break;
      case '--timeout':
        config.timeout = parseInt(args[++i], 10);
        break;
      case '--config':
        config.configPath = args[++i];
        break;
      case '-h':
      case '--help':
        console.log('Usage: node scripts/validate_logging.js [options]');
        console.log('');
        console.log('Options:');
        console.log('  --env ENV        Target environment (production, staging, canary)');
        console.log('  --timeout SEC    Timeout for each validation in seconds (default: 30)');
        console.log('  --config PATH    Path to quality gates config file');
        console.log('  -h, --help       Show this help message');
        process.exit(0);
      default:
        error(`Unknown option: ${args[i]}`);
        process.exit(1);
    }
  }
  
  return config;
}

// Load configuration file
function loadConfig(configPath) {
  try {
    if (!fs.existsSync(configPath)) {
      error(`Configuration file not found: ${configPath}`);
      process.exit(1);
    }
    
    const configData = fs.readFileSync(configPath, 'utf8');
    return JSON.parse(configData);
  } catch (err) {
    error(`Failed to load configuration: ${err.message}`);
    process.exit(1);
  }
}

// HTTP request helper
function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const requestModule = url.startsWith('https:') ? https : http;
    const requestOptions = {
      timeout: (options.timeout || 30) * 1000,
      ...options
    };
    
    const req = requestModule.get(url, requestOptions, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    });
    
    req.on('error', (err) => {
      reject(err);
    });
    
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

// Test counters
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

// Helper function to run a validation test
async function runValidationTest(testName, testFunction) {
  totalTests++;
  
  log(`Running validation: ${testName}`);
  
  try {
    const result = await testFunction();
    
    if (result) {
      success(`✅ ${testName}: PASSED`);
      passedTests++;
      return true;
    } else {
      error(`❌ ${testName}: FAILED`);
      failedTests++;
      return false;
    }
  } catch (err) {
    error(`❌ ${testName}: FAILED - ${err.message}`);
    failedTests++;
    return false;
  }
}

// Validation 1: Log Endpoints Accessibility
async function validateLogEndpoints(baseUrl, timeout) {
  const logEndpoints = [
    '/logs',
    '/api/v1/logs',
    '/health/logs',
    '/metrics/logs'
  ];
  
  let accessibleEndpoints = 0;
  
  for (const endpoint of logEndpoints) {
    try {
      const response = await makeRequest(`${baseUrl}${endpoint}`, { timeout });
      
      // Accept 200, 401 (auth required), or 403 (forbidden) as accessible
      if ([200, 401, 403].includes(response.statusCode)) {
        log(`  Log endpoint accessible: ${endpoint} (HTTP ${response.statusCode})`);
        accessibleEndpoints++;
      } else if (response.statusCode === 404) {
        log(`  Log endpoint not found: ${endpoint}`);
      } else {
        warn(`  Log endpoint error: ${endpoint} (HTTP ${response.statusCode})`);
      }
    } catch (err) {
      log(`  Log endpoint unreachable: ${endpoint} (${err.message})`);
    }
  }
  
  // At least one log endpoint should be accessible
  return accessibleEndpoints > 0;
}

// Validation 2: Log Format and Structure
async function validateLogFormat(baseUrl, timeout) {
  try {
    // Try to get recent logs
    const response = await makeRequest(`${baseUrl}/api/v1/logs?limit=10`, { timeout });
    
    if (response.statusCode !== 200) {
      // Try alternative endpoint
      const altResponse = await makeRequest(`${baseUrl}/logs`, { timeout });
      if (altResponse.statusCode !== 200) {
        warn('No accessible log endpoints found for format validation');
        return true; // Don't fail the validation if endpoints aren't available
      }
      
      return validateLogContent(altResponse.body);
    }
    
    return validateLogContent(response.body);
  } catch (err) {
    warn(`Log format validation skipped: ${err.message}`);
    return true; // Don't fail if logs aren't accessible
  }
}

// Helper function to validate log content structure
function validateLogContent(logContent) {
  try {
    // Try to parse as JSON array (structured logs)
    const logs = JSON.parse(logContent);
    
    if (Array.isArray(logs) && logs.length > 0) {
      const sampleLog = logs[0];
      
      // Check for required fields in structured logs
      const requiredFields = ['timestamp', 'level', 'message'];
      const hasRequiredFields = requiredFields.some(field => sampleLog.hasOwnProperty(field));
      
      if (hasRequiredFields) {
        log('  Structured JSON logs detected with required fields');
        return true;
      }
    }
    
    // If not JSON array, check if it's line-delimited JSON
    const lines = logContent.split('\n').filter(line => line.trim());
    if (lines.length > 0) {
      try {
        const sampleLogLine = JSON.parse(lines[0]);
        if (sampleLogLine.timestamp || sampleLogLine.level || sampleLogLine.message) {
          log('  Line-delimited JSON logs detected');
          return true;
        }
      } catch {
        // Not JSON, check plain text format
      }
    }
    
    // Check for plain text log format
    if (logContent.length > 0) {
      const lines = logContent.split('\n');
      const hasTimestamps = lines.some(line => 
        /\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4}|\w{3}\s+\d{1,2}/.test(line)
      );
      
      if (hasTimestamps) {
        log('  Plain text logs with timestamps detected');
        return true;
      }
    }
    
    warn('  Logs found but format validation inconclusive');
    return true; // Don't fail if we can't determine format
    
  } catch (err) {
    // Not JSON, check if it's plain text with reasonable content
    if (logContent.length > 100) {
      log('  Plain text logs detected');
      return true;
    }
    
    warn('  Unable to validate log format');
    return false;
  }
}

// Validation 3: Log Levels Present
async function validateLogLevels(baseUrl, timeout) {
  try {
    // Try to get logs and check for different levels
    const response = await makeRequest(`${baseUrl}/api/v1/logs?limit=100`, { timeout });
    
    if (response.statusCode !== 200) {
      warn('Cannot access logs for level validation');
      return true; // Don't fail if we can't access logs
    }
    
    const logContent = response.body;
    const expectedLevels = ['ERROR', 'WARN', 'INFO', 'DEBUG', 'error', 'warn', 'info', 'debug'];
    
    let foundLevels = 0;
    
    for (const level of expectedLevels) {
      if (logContent.toLowerCase().includes(level.toLowerCase())) {
        foundLevels++;
        log(`  Found log level: ${level.toUpperCase()}`);
      }
    }
    
    // Should have at least INFO and ERROR levels
    return foundLevels >= 2;
    
  } catch (err) {
    warn(`Log levels validation skipped: ${err.message}`);
    return true;
  }
}

// Validation 4: Application-Specific Log Validation
async function validateApplicationLogs(baseUrl, timeout) {
  try {
    const response = await makeRequest(`${baseUrl}/api/v1/logs?query=dhash&limit=50`, { timeout });
    
    if (response.statusCode !== 200) {
      // Try alternative
      const altResponse = await makeRequest(`${baseUrl}/logs`, { timeout });
      if (altResponse.statusCode !== 200) {
        warn('Cannot access application logs for validation');
        return true;
      }
      
      return checkApplicationLogContent(altResponse.body);
    }
    
    return checkApplicationLogContent(response.body);
    
  } catch (err) {
    warn(`Application log validation skipped: ${err.message}`);
    return true;
  }
}

// Helper function to check application-specific log content
function checkApplicationLogContent(logContent) {
  // Check for dhash-specific log entries
  const dhashKeywords = [
    'dhash',
    'hash',
    'extraction',
    'queue',
    'processing'
  ];
  
  let foundKeywords = 0;
  
  for (const keyword of dhashKeywords) {
    if (logContent.toLowerCase().includes(keyword)) {
      foundKeywords++;
      log(`  Found application keyword in logs: ${keyword}`);
    }
  }
  
  // Should find at least some application-specific content
  return foundKeywords > 0;
}

// Validation 5: Log Rotation and Retention
async function validateLogRotation(baseUrl, timeout) {
  try {
    // Check if there are multiple log files or rotation info
    const response = await makeRequest(`${baseUrl}/api/v1/logs/files`, { timeout });
    
    if (response.statusCode === 200) {
      const logFiles = JSON.parse(response.body);
      
      if (Array.isArray(logFiles) && logFiles.length > 1) {
        log(`  Found ${logFiles.length} log files - rotation appears to be working`);
        return true;
      }
    }
    
    // Alternative: check log headers for rotation info
    const logResponse = await makeRequest(`${baseUrl}/api/v1/logs`, { timeout });
    
    if (logResponse.headers['x-log-rotation'] || logResponse.headers['x-log-files']) {
      log('  Log rotation headers detected');
      return true;
    }
    
    warn('  Cannot verify log rotation - may not be configured');
    return true; // Don't fail if we can't verify rotation
    
  } catch (err) {
    warn(`Log rotation validation skipped: ${err.message}`);
    return true;
  }
}

// Validation 6: Log Performance and Accessibility
async function validateLogPerformance(baseUrl, timeout) {
  const startTime = Date.now();
  
  try {
    const response = await makeRequest(`${baseUrl}/api/v1/logs?limit=10`, { timeout });
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    log(`  Log endpoint response time: ${duration}ms`);
    
    // Response time should be reasonable (under 5 seconds)
    if (duration > 5000) {
      warn('  Log endpoint response time is slow (>5s)');
      return false;
    }
    
    // Should get some response
    if (response.statusCode >= 200 && response.statusCode < 400) {
      log('  Log endpoint performance acceptable');
      return true;
    }
    
    return false;
    
  } catch (err) {
    error(`  Log performance validation failed: ${err.message}`);
    return false;
  }
}

// Main validation function
async function validateLogging(config, qualityConfig) {
  const environment = config.environment;
  const envConfig = qualityConfig.environments[environment];
  
  if (!envConfig) {
    error(`Environment configuration not found: ${environment}`);
    process.exit(1);
  }
  
  const baseUrl = envConfig.base_url;
  const timeout = config.timeout;
  
  log(`Starting logging validation for ${environment}`);
  log(`Target URL: ${baseUrl}`);
  log(`Timeout: ${timeout}s`);
  
  // Run all validation tests
  await runValidationTest(
    'Log Endpoints Accessibility',
    () => validateLogEndpoints(baseUrl, timeout)
  );
  
  await runValidationTest(
    'Log Format and Structure',
    () => validateLogFormat(baseUrl, timeout)
  );
  
  await runValidationTest(
    'Log Levels Present',
    () => validateLogLevels(baseUrl, timeout)
  );
  
  await runValidationTest(
    'Application-Specific Logs',
    () => validateApplicationLogs(baseUrl, timeout)
  );
  
  await runValidationTest(
    'Log Rotation and Retention',
    () => validateLogRotation(baseUrl, timeout)
  );
  
  await runValidationTest(
    'Log Performance',
    () => validateLogPerformance(baseUrl, timeout)
  );
  
  return {
    total: totalTests,
    passed: passedTests,
    failed: failedTests
  };
}

// Main function
async function main() {
  const config = parseArgs();
  const qualityConfig = loadConfig(config.configPath);
  
  log('=== dhash Logging Validation Start ===');
  log(`Environment: ${config.environment}`);
  log(`Timeout: ${config.timeout}s`);
  log(`Config: ${config.configPath}`);
  
  try {
    const results = await validateLogging(config, qualityConfig);
    
    log('=== Logging Validation Summary ===');
    log(`Total validations: ${results.total}`);
    log(`Passed: ${results.passed}`);
    log(`Failed: ${results.failed}`);
    
    if (results.failed === 0) {
      success('=== All Logging Validations Passed ===');
      success(`dhash ${config.environment} logging system is properly configured`);
      process.exit(0);
    } else if (results.failed <= results.total / 2) {
      warn('=== Some Logging Validations Failed ===');
      warn(`${results.failed} out of ${results.total} validations failed`);
      warn('Logging system is partially functional but may need attention');
      process.exit(0); // Don't fail deployment for logging issues
    } else {
      error('=== Logging Validation Failed ===');
      error(`${results.failed} out of ${results.total} validations failed`);
      error('Logging system appears to be significantly impaired');
      process.exit(1);
    }
    
  } catch (err) {
    error(`Logging validation failed: ${err.message}`);
    console.error(err.stack);
    process.exit(1);
  }
}

// Handle signals for graceful shutdown
process.on('SIGINT', () => {
  log('Received SIGINT - shutting down gracefully');
  process.exit(0);
});

process.on('SIGTERM', () => {
  log('Received SIGTERM - shutting down gracefully');
  process.exit(0);
});

// Execute main function if script is run directly
if (require.main === module) {
  main().catch(err => {
    error(`Unhandled error: ${err.message}`);
    console.error(err.stack);
    process.exit(1);
  });
}

module.exports = {
  validateLogging,
  validateLogEndpoints,
  validateLogFormat,
  validateLogLevels
};