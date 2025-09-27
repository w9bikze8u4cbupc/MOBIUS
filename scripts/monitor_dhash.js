#!/usr/bin/env node

/**
 * dhash Monitoring Script with Auto-Rollback
 * Usage: node scripts/monitor_dhash.js [--env production|staging|canary] [--dry-run] [--duration-minutes 60]
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// Default configuration
const DEFAULT_CONFIG = {
  dryRun: false,
  environment: 'staging',
  durationMinutes: 60,
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
  console.log(`${colors.blue}[${timestamp}] MONITOR:${colors.reset} ${message}`);
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
      case '--dry-run':
        config.dryRun = true;
        break;
      case '--duration-minutes':
        config.durationMinutes = parseInt(args[++i], 10);
        break;
      case '--config':
        config.configPath = args[++i];
        break;
      case '-h':
      case '--help':
        console.log('Usage: node scripts/monitor_dhash.js [options]');
        console.log('');
        console.log('Options:');
        console.log('  --env ENV               Target environment (production, staging, canary)');
        console.log('  --dry-run              Simulate monitoring without triggering rollbacks');
        console.log('  --duration-minutes N   Monitoring duration in minutes (default: 60)');
        console.log('  --config PATH          Path to quality gates config file');
        console.log('  -h, --help             Show this help message');
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
      timeout: (options.timeout || 10) * 1000,
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

// Health check function
async function performHealthCheck(baseUrl, healthConfig) {
  const healthUrl = `${baseUrl}${healthConfig.endpoint}`;
  
  try {
    const response = await makeRequest(healthUrl, {
      timeout: healthConfig.timeout_seconds
    });
    
    if (response.statusCode === healthConfig.expected_status) {
      return { status: 'OK', response };
    } else {
      return { 
        status: 'FAIL', 
        reason: `Unexpected status code: ${response.statusCode}`,
        response 
      };
    }
  } catch (err) {
    return { 
      status: 'FAIL', 
      reason: `Health check failed: ${err.message}`,
      error: err 
    };
  }
}

// Metrics collection functions
async function collectMetrics(baseUrl, metricsEndpoints) {
  const metrics = {};
  
  for (const [metricName, endpoint] of Object.entries(metricsEndpoints)) {
    try {
      const response = await makeRequest(`${baseUrl}${endpoint}`);
      
      if (response.statusCode === 200) {
        metrics[metricName] = JSON.parse(response.body);
      } else {
        warn(`Failed to collect ${metricName} metrics: HTTP ${response.statusCode}`);
        metrics[metricName] = null;
      }
    } catch (err) {
      warn(`Failed to collect ${metricName} metrics: ${err.message}`);
      metrics[metricName] = null;
    }
  }
  
  return metrics;
}

// Quality gate evaluation
function evaluateQualityGates(metrics, healthHistory, autoRollbackTriggers) {
  const violations = [];
  
  // Health check failures
  if (autoRollbackTriggers.health_check_failures.enabled) {
    const recentFailures = healthHistory.slice(-autoRollbackTriggers.health_check_failures.threshold);
    const consecutiveFailures = recentFailures.every(check => check.status === 'FAIL');
    
    if (consecutiveFailures && recentFailures.length >= autoRollbackTriggers.health_check_failures.threshold) {
      violations.push({
        trigger: 'health_check_failures',
        description: autoRollbackTriggers.health_check_failures.description,
        current: recentFailures.length,
        threshold: autoRollbackTriggers.health_check_failures.threshold
      });
    }
  }
  
  // Extraction failures rate
  if (autoRollbackTriggers.extraction_failures_rate.enabled && metrics.extraction_failures) {
    const failureRate = metrics.extraction_failures.failure_rate_percent || 0;
    const threshold = autoRollbackTriggers.extraction_failures_rate.threshold_percent;
    
    if (failureRate > threshold) {
      violations.push({
        trigger: 'extraction_failures_rate',
        description: autoRollbackTriggers.extraction_failures_rate.description,
        current: failureRate,
        threshold: threshold
      });
    }
  }
  
  // P95 hash time
  if (autoRollbackTriggers.p95_hash_time.enabled && metrics.hash_performance) {
    const p95Time = metrics.hash_performance.p95_time_ms || 0;
    const threshold = autoRollbackTriggers.p95_hash_time.threshold_ms;
    
    if (p95Time > threshold) {
      violations.push({
        trigger: 'p95_hash_time',
        description: autoRollbackTriggers.p95_hash_time.description,
        current: p95Time,
        threshold: threshold
      });
    }
  }
  
  // Low confidence queue length
  if (autoRollbackTriggers.low_confidence_queue_length.enabled && metrics.queue_status) {
    const queueLength = metrics.queue_status.low_confidence_queue_length || 0;
    const threshold = autoRollbackTriggers.low_confidence_queue_length.threshold;
    
    if (queueLength > threshold) {
      violations.push({
        trigger: 'low_confidence_queue_length',
        description: autoRollbackTriggers.low_confidence_queue_length.description,
        current: queueLength,
        threshold: threshold
      });
    }
  }
  
  return violations;
}

// Trigger rollback
async function triggerRollback(environment, violations, dryRun) {
  const rollbackScript = path.join(__dirname, 'rollback_dhash.sh');
  
  log(`Quality gate violations detected: ${violations.length}`);
  violations.forEach(v => {
    error(`  - ${v.trigger}: ${v.current} > ${v.threshold} (${v.description})`);
  });
  
  if (dryRun) {
    log('[DRY-RUN] Would trigger rollback due to quality gate violations');
    log(`[DRY-RUN] Would execute: ${rollbackScript} --env ${environment} --reason "auto-rollback"`);
    return { success: true, dryRun: true };
  }
  
  log(`Triggering automatic rollback for environment: ${environment}`);
  
  // Execute rollback script
  const { spawn } = require('child_process');
  
  return new Promise((resolve) => {
    const rollback = spawn(rollbackScript, ['--env', environment, '--reason', 'auto-rollback'], {
      stdio: ['inherit', 'inherit', 'inherit']
    });
    
    rollback.on('close', (code) => {
      if (code === 0) {
        success('Automatic rollback completed successfully');
        resolve({ success: true, code });
      } else {
        error(`Automatic rollback failed with exit code: ${code}`);
        resolve({ success: false, code });
      }
    });
    
    rollback.on('error', (err) => {
      error(`Failed to execute rollback: ${err.message}`);
      resolve({ success: false, error: err });
    });
  });
}

// Send notification
async function sendNotification(type, environment, message, severity = 'info') {
  const notifyScript = path.join(__dirname, 'notify.js');
  
  if (!fs.existsSync(notifyScript)) {
    warn('Notification script not found - skipping notification');
    return;
  }
  
  try {
    const { spawn } = require('child_process');
    
    const notify = spawn('node', [
      notifyScript,
      '--type', type,
      '--env', environment,
      '--message', message,
      '--severity', severity
    ], {
      stdio: ['inherit', 'inherit', 'inherit']
    });
    
    notify.on('close', (code) => {
      if (code === 0) {
        log('Notification sent successfully');
      } else {
        warn(`Notification failed with exit code: ${code}`);
      }
    });
  } catch (err) {
    warn(`Failed to send notification: ${err.message}`);
  }
}

// Main monitoring loop
async function monitoringLoop(config, qualityConfig) {
  const environment = config.environment;
  const envConfig = qualityConfig.environments[environment];
  
  if (!envConfig) {
    error(`Environment configuration not found: ${environment}`);
    process.exit(1);
  }
  
  const baseUrl = envConfig.base_url;
  const durationMs = config.durationMinutes * 60 * 1000;
  const startTime = Date.now();
  const endTime = startTime + durationMs;
  
  log(`Starting ${config.durationMinutes}-minute monitoring for ${environment}`);
  log(`Target URL: ${baseUrl}`);
  log(`Monitoring until: ${new Date(endTime).toISOString()}`);
  
  // Send start notification
  await sendNotification(
    'monitoring',
    environment,
    `Started ${config.durationMinutes}-minute monitoring for dhash deployment in ${environment}`
  );
  
  const healthHistory = [];
  let checkCount = 0;
  let violationCount = 0;
  let consecutiveOkChecks = 0;
  
  // Determine poll intervals
  const { poll_intervals } = qualityConfig;
  const highFrequencyEndTime = startTime + (poll_intervals.initial_high_frequency_minutes * 60 * 1000);
  
  while (Date.now() < endTime) {
    checkCount++;
    const currentTime = Date.now();
    const isHighFrequency = currentTime < highFrequencyEndTime;
    const pollInterval = isHighFrequency ? 
      poll_intervals.initial_poll_seconds : 
      poll_intervals.normal_poll_seconds;
    
    log(`Check ${checkCount} - ${isHighFrequency ? 'High' : 'Normal'} frequency polling`);
    
    // Perform health check
    const healthResult = await performHealthCheck(baseUrl, qualityConfig.health_check_config);
    healthHistory.push({ ...healthResult, timestamp: Date.now() });
    
    // Keep health history manageable
    if (healthHistory.length > 100) {
      healthHistory.splice(0, 50);
    }
    
    if (healthResult.status === 'OK') {
      consecutiveOkChecks++;
      log(`Health check OK (${consecutiveOkChecks} consecutive)`);
    } else {
      consecutiveOkChecks = 0;
      warn(`Health check FAILED: ${healthResult.reason}`);
    }
    
    // Collect metrics
    const metrics = await collectMetrics(baseUrl, qualityConfig.metrics_endpoints);
    
    // Log metrics summary
    if (metrics.extraction_failures) {
      log(`Extraction failure rate: ${metrics.extraction_failures.failure_rate_percent || 0}%`);
    }
    if (metrics.hash_performance) {
      log(`P95 hash time: ${metrics.hash_performance.p95_time_ms || 0}ms`);
    }
    if (metrics.queue_status) {
      log(`Low confidence queue: ${metrics.queue_status.low_confidence_queue_length || 0} items`);
    }
    
    // Evaluate quality gates
    const violations = evaluateQualityGates(metrics, healthHistory, qualityConfig.auto_rollback_triggers);
    
    if (violations.length > 0) {
      violationCount++;
      error(`Quality gate violations detected: ${violations.length}`);
      
      // Trigger rollback
      const rollbackResult = await triggerRollback(environment, violations, config.dryRun);
      
      if (rollbackResult.success) {
        await sendNotification(
          'rollback',
          environment,
          `Automatic rollback triggered due to quality gate violations: ${violations.map(v => v.trigger).join(', ')}`,
          'critical'
        );
        
        log('Monitoring terminated due to automatic rollback');
        process.exit(0);
      } else {
        error('Automatic rollback failed - manual intervention required');
        await sendNotification(
          'rollback',
          environment,
          'Automatic rollback FAILED - manual intervention required',
          'critical'
        );
        
        process.exit(1);
      }
    }
    
    // Check if service is stable (for early completion)
    const requiredConsecutiveOk = qualityConfig.health_check_config.required_consecutive_ok_for_stability;
    if (consecutiveOkChecks >= requiredConsecutiveOk && currentTime > (startTime + 5 * 60 * 1000)) {
      // Service has been stable for required consecutive checks and at least 5 minutes have passed
      const remainingMinutes = Math.ceil((endTime - currentTime) / 60000);
      
      if (remainingMinutes > 10) {
        log(`Service stable with ${consecutiveOkChecks} consecutive OK checks`);
        log(`Continuing monitoring for ${remainingMinutes} more minutes...`);
      }
    }
    
    // Wait for next check
    const sleepMs = pollInterval * 1000;
    log(`Waiting ${pollInterval}s until next check...`);
    await new Promise(resolve => setTimeout(resolve, sleepMs));
  }
  
  // Monitoring completed successfully
  const totalMinutes = Math.round((Date.now() - startTime) / 60000);
  success(`Monitoring completed successfully after ${totalMinutes} minutes`);
  success(`Total checks: ${checkCount}, Violations: ${violationCount}`);
  
  await sendNotification(
    'monitoring',
    environment,
    `dhash monitoring completed successfully. ${checkCount} checks performed, ${violationCount} violations detected (no rollback needed).`
  );
  
  log('dhash deployment monitoring completed - no rollback required');
}

// Main function
async function main() {
  const config = parseArgs();
  const qualityConfig = loadConfig(config.configPath);
  
  log('=== dhash Monitoring Start ===');
  log(`Environment: ${config.environment}`);
  log(`Duration: ${config.durationMinutes} minutes`);
  log(`Dry-run: ${config.dryRun}`);
  log(`Config: ${config.configPath}`);
  
  // Validate environment configuration
  if (!qualityConfig.environments[config.environment]) {
    error(`Environment not found in config: ${config.environment}`);
    process.exit(1);
  }
  
  // Create monitor logs directory
  const monitorLogsDir = path.join(__dirname, '..', 'monitor_logs');
  if (!fs.existsSync(monitorLogsDir)) {
    fs.mkdirSync(monitorLogsDir, { recursive: true });
  }
  
  try {
    await monitoringLoop(config, qualityConfig);
  } catch (err) {
    error(`Monitoring failed: ${err.message}`);
    console.error(err.stack);
    
    await sendNotification(
      'monitoring',
      config.environment,
      `dhash monitoring FAILED: ${err.message}`,
      'critical'
    );
    
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
  performHealthCheck,
  collectMetrics,
  evaluateQualityGates,
  triggerRollback
};