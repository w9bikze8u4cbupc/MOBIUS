#!/usr/bin/env node
/**
 * monitor_dhash.js - T+60 monitoring loop with adaptive polling
 * 
 * Provides comprehensive post-deployment monitoring with configurable quality gates
 * and automatic rollback capabilities.
 * 
 * Usage: node scripts/monitor_dhash.js --env production [--duration 3600] [--config quality-gates-config.json]
 */

const fs = require('fs');
const path = require('path');
const { spawn, exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

// Configuration defaults
const DEFAULT_CONFIG = {
  duration: 3600, // 60 minutes in seconds
  configFile: 'quality-gates-config.json',
  logFile: 'deploy_logs/monitor.log',
  metricsFile: 'deploy_logs/metrics.json',
  pidFile: 'deploy_logs/monitor.pid'
};

// Global state
let config = {};
let environment = '';
let monitoringStartTime = null;
let consecutiveHealthFailures = 0;
let alertHistory = [];
let metricsHistory = [];
let isShuttingDown = false;

// Logging utilities
function log(level, message, data = null) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    level: level.toUpperCase(),
    message,
    data,
    environment,
    uptime: monitoringStartTime ? Date.now() - monitoringStartTime : 0
  };
  
  const logLine = `[${timestamp}] [${level.toUpperCase()}] ${message}${data ? ' | ' + JSON.stringify(data) : ''}`;
  
  console.log(logLine);
  
  // Append to log file
  try {
    fs.appendFileSync(config.logFile, logLine + '\n');
  } catch (err) {
    console.error('Failed to write to log file:', err.message);
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

// Configuration management
function loadQualityGatesConfig(configPath) {
  try {
    const configData = fs.readFileSync(configPath, 'utf8');
    return JSON.parse(configData);
  } catch (err) {
    logError(`Failed to load quality gates config: ${err.message}`);
    process.exit(1);
  }
}

function getEnvironmentConfig(qualityGatesConfig, env) {
  const envConfig = qualityGatesConfig.environments[env];
  if (!envConfig) {
    logError(`Environment '${env}' not found in quality gates config`);
    process.exit(1);
  }
  return envConfig;
}

// Health check utilities
async function performHealthCheck() {
  try {
    const healthUrl = process.env[`DHASH_${environment.toUpperCase()}_URL`] || 'http://localhost:3000';
    const healthEndpoint = `${healthUrl}/health`;
    
    logInfo(`Performing health check: ${healthEndpoint}`);
    
    const { stdout, stderr } = await execAsync(`curl -sf "${healthEndpoint}" --max-time 30`);
    
    if (stderr) {
      logWarn('Health check returned warnings', { stderr });
    }
    
    let healthData = {};
    try {
      healthData = JSON.parse(stdout);
    } catch (err) {
      logWarn('Health check response is not valid JSON', { response: stdout });
      healthData = { status: 'ok', raw_response: stdout };
    }
    
    consecutiveHealthFailures = 0;
    return { success: true, data: healthData };
    
  } catch (err) {
    consecutiveHealthFailures++;
    logError(`Health check failed (consecutive failures: ${consecutiveHealthFailures})`, { 
      error: err.message,
      consecutive_failures: consecutiveHealthFailures 
    });
    
    return { success: false, error: err.message, consecutive_failures: consecutiveHealthFailures };
  }
}

// Metrics collection
async function collectSystemMetrics() {
  const metrics = {
    timestamp: new Date().toISOString(),
    memory_usage: await getMemoryUsage(),
    cpu_usage: await getCpuUsage(),
    disk_usage: await getDiskUsage(),
    process_metrics: await getProcessMetrics()
  };
  
  return metrics;
}

async function getMemoryUsage() {
  try {
    const { stdout } = await execAsync("free | awk 'NR==2{printf \"%.2f\", $3*100/$2}'");
    return parseFloat(stdout) || 0;
  } catch (err) {
    logWarn('Failed to get memory usage', { error: err.message });
    return 0;
  }
}

async function getCpuUsage() {
  try {
    const { stdout } = await execAsync("top -bn1 | grep 'Cpu(s)' | awk '{print $2}' | awk -F'%' '{print $1}'");
    return parseFloat(stdout) || 0;
  } catch (err) {
    logWarn('Failed to get CPU usage', { error: err.message });
    return 0;
  }
}

async function getDiskUsage() {
  try {
    const { stdout } = await execAsync("df -h / | awk 'NR==2{print $5}' | sed 's/%//'");
    return parseFloat(stdout) || 0;
  } catch (err) {
    logWarn('Failed to get disk usage', { error: err.message });
    return 0;
  }
}

async function getProcessMetrics() {
  try {
    // Look for dhash-related processes
    const { stdout } = await execAsync("ps aux | grep -E '[d]hash|[n]ode.*dhash' | wc -l");
    const processCount = parseInt(stdout) || 0;
    
    return {
      process_count: processCount,
      environment: environment
    };
  } catch (err) {
    logWarn('Failed to get process metrics', { error: err.message });
    return { process_count: 0 };
  }
}

async function collectDhashMetrics() {
  // Simulate dhash-specific metrics collection
  // In a real implementation, this would connect to your dhash service APIs/metrics endpoints
  
  const metrics = {
    timestamp: new Date().toISOString(),
    extraction_failure_rate: Math.random() * 2, // 0-2% simulated
    p95_hash_time: 800 + Math.random() * 400, // 800-1200ms simulated
    low_confidence_queue_size: Math.floor(Math.random() * 100), // 0-100 items simulated
    error_rate: Math.random() * 0.5, // 0-0.5% simulated
    total_requests: Math.floor(1000 + Math.random() * 500),
    successful_requests: Math.floor(995 + Math.random() * 5)
  };
  
  // Calculate actual error rate
  metrics.error_rate = ((metrics.total_requests - metrics.successful_requests) / metrics.total_requests) * 100;
  
  logInfo('Collected dhash metrics', metrics);
  return metrics;
}

// Quality gate evaluation
function evaluateQualityGates(envConfig, systemMetrics, dhashMetrics, healthResult) {
  const violations = [];
  const gates = envConfig.quality_gates;
  
  // Health failures check
  if (gates.health_failures && healthResult && !healthResult.success) {
    if (consecutiveHealthFailures >= gates.health_failures.threshold) {
      violations.push({
        gate: 'health_failures',
        current_value: consecutiveHealthFailures,
        threshold: gates.health_failures.threshold,
        action: gates.health_failures.action,
        severity: gates.health_failures.severity,
        description: gates.health_failures.description
      });
    }
  }
  
  // System metrics checks
  if (gates.memory_usage && systemMetrics.memory_usage > gates.memory_usage.threshold_percentage) {
    violations.push({
      gate: 'memory_usage',
      current_value: systemMetrics.memory_usage,
      threshold: gates.memory_usage.threshold_percentage,
      action: gates.memory_usage.action,
      severity: gates.memory_usage.severity,
      description: gates.memory_usage.description
    });
  }
  
  if (gates.cpu_usage && systemMetrics.cpu_usage > gates.cpu_usage.threshold_percentage) {
    violations.push({
      gate: 'cpu_usage',
      current_value: systemMetrics.cpu_usage,
      threshold: gates.cpu_usage.threshold_percentage,
      action: gates.cpu_usage.action,
      severity: gates.cpu_usage.severity,
      description: gates.cpu_usage.description
    });
  }
  
  if (gates.disk_usage && systemMetrics.disk_usage > gates.disk_usage.threshold_percentage) {
    violations.push({
      gate: 'disk_usage',
      current_value: systemMetrics.disk_usage,
      threshold: gates.disk_usage.threshold_percentage,
      action: gates.disk_usage.action,
      severity: gates.disk_usage.severity,
      description: gates.disk_usage.description
    });
  }
  
  // Dhash-specific metrics checks
  if (gates.extraction_failure_rate && dhashMetrics.extraction_failure_rate > gates.extraction_failure_rate.threshold_percentage) {
    violations.push({
      gate: 'extraction_failure_rate',
      current_value: dhashMetrics.extraction_failure_rate,
      threshold: gates.extraction_failure_rate.threshold_percentage,
      action: gates.extraction_failure_rate.action,
      severity: gates.extraction_failure_rate.severity,
      description: gates.extraction_failure_rate.description
    });
  }
  
  if (gates.p95_hash_time && dhashMetrics.p95_hash_time > gates.p95_hash_time.threshold_ms) {
    violations.push({
      gate: 'p95_hash_time',
      current_value: dhashMetrics.p95_hash_time,
      threshold: gates.p95_hash_time.threshold_ms,
      action: gates.p95_hash_time.action,
      severity: gates.p95_hash_time.severity,
      description: gates.p95_hash_time.description
    });
  }
  
  if (gates.low_confidence_queue_size && dhashMetrics.low_confidence_queue_size > gates.low_confidence_queue_size.threshold) {
    violations.push({
      gate: 'low_confidence_queue_size',
      current_value: dhashMetrics.low_confidence_queue_size,
      threshold: gates.low_confidence_queue_size.threshold,
      action: gates.low_confidence_queue_size.action,
      severity: gates.low_confidence_queue_size.severity,
      description: gates.low_confidence_queue_size.description
    });
  }
  
  if (gates.error_rate && dhashMetrics.error_rate > gates.error_rate.threshold_percentage) {
    violations.push({
      gate: 'error_rate',
      current_value: dhashMetrics.error_rate,
      threshold: gates.error_rate.threshold_percentage,
      action: gates.error_rate.action,
      severity: gates.error_rate.severity,
      description: gates.error_rate.description
    });
  }
  
  return violations;
}

// Alert handling
function handleViolations(violations, envConfig) {
  if (violations.length === 0) {
    return { alertsSent: false, rollbackTriggered: false };
  }
  
  logWarn(`Quality gate violations detected: ${violations.length}`, violations);
  
  // Group violations by action
  const rollbackViolations = violations.filter(v => v.action === 'auto_rollback');
  const alertViolations = violations.filter(v => v.action === 'alert');
  
  let rollbackTriggered = false;
  
  // Handle auto-rollback violations
  if (rollbackViolations.length > 0) {
    logError('Auto-rollback conditions met', rollbackViolations);
    rollbackTriggered = triggerAutoRollback(rollbackViolations);
  }
  
  // Send alerts for all violations
  sendAlerts(violations, envConfig);
  
  // Store in alert history
  alertHistory.push({
    timestamp: new Date().toISOString(),
    violations,
    rollback_triggered: rollbackTriggered
  });
  
  return { alertsSent: true, rollbackTriggered };
}

function triggerAutoRollback(violations) {
  try {
    logError('TRIGGERING AUTO-ROLLBACK', { violations, environment });
    
    // Find the most recent backup
    const backupsDir = path.join(__dirname, '..', 'backups');
    const backupPattern = `dhash_${environment}_*.zip`;
    
    const { stdout } = require('child_process').execSync(`find "${backupsDir}" -name "${backupPattern}" -type f | sort -r | head -n1`, { encoding: 'utf8' });
    const latestBackup = stdout.trim();
    
    if (!latestBackup) {
      logError('No backup found for auto-rollback');
      return false;
    }
    
    logError(`Auto-rollback initiated with backup: ${latestBackup}`);
    
    // Execute rollback script
    const rollbackScript = path.join(__dirname, 'rollback_dhash.sh');
    const rollbackProcess = spawn(rollbackScript, [
      '--backup', latestBackup,
      '--env', environment,
      '--skip-pre-snapshot' // Skip creating another snapshot during auto-rollback
    ], {
      detached: true,
      stdio: 'inherit'
    });
    
    rollbackProcess.on('exit', (code) => {
      if (code === 0) {
        logSuccess('Auto-rollback completed successfully');
      } else {
        logError(`Auto-rollback failed with exit code: ${code}`);
      }
    });
    
    rollbackProcess.unref();
    
    return true;
    
  } catch (err) {
    logError('Failed to trigger auto-rollback', { error: err.message });
    return false;
  }
}

function sendAlerts(violations, envConfig) {
  // Group violations by severity
  const severityGroups = violations.reduce((groups, violation) => {
    if (!groups[violation.severity]) {
      groups[violation.severity] = [];
    }
    groups[violation.severity].push(violation);
    return groups;
  }, {});
  
  // Send alerts based on severity and notification channels
  Object.keys(severityGroups).forEach(severity => {
    const channels = envConfig.notification_channels[severity] || ['file'];
    const violationList = severityGroups[severity];
    
    logInfo(`Sending ${severity} alerts to channels: ${channels.join(', ')}`, violationList);
    
    // Send notification via notification script
    const notifyScript = path.join(__dirname, 'notify.js');
    if (fs.existsSync(notifyScript)) {
      try {
        spawn('node', [notifyScript, 
          '--type', 'quality_gate_violation',
          '--severity', severity,
          '--env', environment,
          '--data', JSON.stringify(violationList)
        ], { detached: true, stdio: 'inherit' }).unref();
      } catch (err) {
        logError('Failed to send notification', { error: err.message });
      }
    }
  });
}

// Adaptive polling logic
function calculatePollingInterval(envConfig, elapsedMinutes) {
  const polling = envConfig.adaptive_polling;
  
  if (elapsedMinutes < polling.transition_after_minutes) {
    return polling.initial_interval_seconds * 1000;
  } else {
    return polling.regular_interval_seconds * 1000;
  }
}

// Metrics persistence
function saveMetrics(systemMetrics, dhashMetrics, healthResult, violations) {
  const metricsEntry = {
    timestamp: new Date().toISOString(),
    uptime_minutes: Math.floor((Date.now() - monitoringStartTime) / 60000),
    system_metrics: systemMetrics,
    dhash_metrics: dhashMetrics,
    health_result: healthResult,
    violations,
    consecutive_health_failures: consecutiveHealthFailures
  };
  
  metricsHistory.push(metricsEntry);
  
  // Keep only last 1000 entries to prevent memory issues
  if (metricsHistory.length > 1000) {
    metricsHistory = metricsHistory.slice(-1000);
  }
  
  // Save to file
  try {
    fs.writeFileSync(config.metricsFile, JSON.stringify({
      monitoring_session: {
        start_time: new Date(monitoringStartTime).toISOString(),
        environment,
        duration_minutes: Math.floor((Date.now() - monitoringStartTime) / 60000)
      },
      current_metrics: metricsEntry,
      metrics_history: metricsHistory.slice(-100), // Last 100 entries
      alert_history: alertHistory
    }, null, 2));
  } catch (err) {
    logError('Failed to save metrics to file', { error: err.message });
  }
}

// Main monitoring loop
async function monitoringLoop() {
  const qualityGatesConfig = loadQualityGatesConfig(config.configFile);
  const envConfig = getEnvironmentConfig(qualityGatesConfig, environment);
  
  const endTime = monitoringStartTime + (config.duration * 1000);
  
  logSuccess(`Starting monitoring for ${environment} environment`);
  logInfo(`Monitoring duration: ${config.duration / 60} minutes`);
  logInfo('Quality gates configuration loaded', envConfig.quality_gates);
  
  while (Date.now() < endTime && !isShuttingDown) {
    const elapsedMinutes = Math.floor((Date.now() - monitoringStartTime) / 60000);
    
    try {
      logInfo(`Monitoring cycle ${elapsedMinutes} minutes elapsed`);
      
      // Collect all metrics
      const [systemMetrics, dhashMetrics, healthResult] = await Promise.all([
        collectSystemMetrics(),
        collectDhashMetrics(),
        performHealthCheck()
      ]);
      
      // Evaluate quality gates
      const violations = evaluateQualityGates(envConfig, systemMetrics, dhashMetrics, healthResult);
      
      // Handle any violations
      const { alertsSent, rollbackTriggered } = handleViolations(violations, envConfig);
      
      // Save metrics
      saveMetrics(systemMetrics, dhashMetrics, healthResult, violations);
      
      // Log status
      if (violations.length === 0) {
        logSuccess(`All quality gates passed (${elapsedMinutes}/${config.duration / 60} minutes)`);
      } else {
        logWarn(`${violations.length} quality gate(s) violated`, { alerts_sent: alertsSent, rollback_triggered: rollbackTriggered });
      }
      
      // If rollback was triggered, exit monitoring
      if (rollbackTriggered) {
        logInfo('Exiting monitoring due to auto-rollback trigger');
        break;
      }
      
    } catch (err) {
      logError('Error during monitoring cycle', { error: err.message });
    }
    
    // Calculate next polling interval
    const pollingInterval = calculatePollingInterval(envConfig, elapsedMinutes);
    logInfo(`Next check in ${pollingInterval / 1000} seconds`);
    
    // Wait for next cycle
    await new Promise(resolve => setTimeout(resolve, pollingInterval));
  }
  
  if (isShuttingDown) {
    logInfo('Monitoring stopped by shutdown signal');
  } else {
    logSuccess(`Monitoring completed successfully after ${config.duration / 60} minutes`);
  }
}

// Process management
function setupGracefulShutdown() {
  const cleanup = () => {
    if (isShuttingDown) return;
    
    isShuttingDown = true;
    logInfo('Received shutdown signal, stopping monitoring gracefully...');
    
    // Remove PID file
    try {
      if (fs.existsSync(config.pidFile)) {
        fs.unlinkSync(config.pidFile);
      }
    } catch (err) {
      logWarn('Failed to remove PID file', { error: err.message });
    }
    
    logInfo('Monitoring shutdown complete');
    process.exit(0);
  };
  
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
  process.on('SIGUSR1', cleanup);
}

// Command line argument parsing
function parseArguments() {
  const args = process.argv.slice(2);
  const options = { ...DEFAULT_CONFIG };
  
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i];
    const value = args[i + 1];
    
    switch (key) {
      case '--env':
        environment = value;
        break;
      case '--duration':
        options.duration = parseInt(value) || options.duration;
        break;
      case '--config':
        options.configFile = value;
        break;
      case '--log-file':
        options.logFile = value;
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
  
  if (!environment) {
    console.error('Environment is required. Use --env ENVIRONMENT');
    showUsage();
    process.exit(1);
  }
  
  return options;
}

function showUsage() {
  console.log(`
Usage: node monitor_dhash.js --env ENVIRONMENT [OPTIONS]

Monitor dhash deployment with adaptive polling and quality gates.

Required Arguments:
  --env ENVIRONMENT     Target environment (production, staging, development)

Optional Arguments:
  --duration SECONDS    Monitoring duration in seconds (default: 3600)
  --config FILE         Quality gates config file (default: quality-gates-config.json)
  --log-file FILE       Log file path (default: deploy_logs/monitor.log)
  --help               Show this help message

Examples:
  node monitor_dhash.js --env production
  node monitor_dhash.js --env staging --duration 1800
  node monitor_dhash.js --env development --config custom-gates.json

Quality Gates:
  • Health check failures
  • Extraction failure rate
  • P95 hash processing time
  • Queue size monitoring
  • System resource usage
  • Auto-rollback on critical violations

`);
}

// Main execution
async function main() {
  config = parseArguments();
  monitoringStartTime = Date.now();
  
  // Ensure log directories exist
  const logDir = path.dirname(config.logFile);
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  
  // Write PID file for process management
  try {
    fs.writeFileSync(config.pidFile, process.pid.toString());
  } catch (err) {
    logWarn('Failed to write PID file', { error: err.message });
  }
  
  // Setup graceful shutdown
  setupGracefulShutdown();
  
  // Start monitoring
  try {
    await monitoringLoop();
    process.exit(0);
  } catch (err) {
    logError('Monitoring failed', { error: err.message });
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
  main,
  performHealthCheck,
  collectSystemMetrics,
  collectDhashMetrics,
  evaluateQualityGates,
  handleViolations
};