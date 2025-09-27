#!/usr/bin/env node

/**
 * Monitoring script for dhash component
 * Implements 60-minute post-deploy monitoring with configurable quality gates and auto-rollback
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// Configuration
const SCRIPT_DIR = __dirname;
const PROJECT_ROOT = path.join(SCRIPT_DIR, '..');
const DEFAULT_MONITORING_DURATION = 60 * 60 * 1000; // 60 minutes in milliseconds
const DEFAULT_CONFIG_PATH = path.join(PROJECT_ROOT, 'quality-gates-config.json');

// Default configuration
const DEFAULT_CONFIG = {
  monitoring: {
    duration_minutes: 60,
    initial_poll_interval_ms: 30000, // 30 seconds for first 5 minutes
    regular_poll_interval_ms: 120000, // 2 minutes after initial period
    initial_period_minutes: 5
  },
  quality_gates: {
    health_failures: {
      threshold: 2,
      window_minutes: 5,
      action: "auto-rollback",
      description: "Consecutive health check failures"
    },
    extraction_failure_rate: {
      threshold: 5.0,
      window_minutes: 10,
      action: "auto-rollback",
      description: "Extraction failure rate percentage over time window"
    },
    p95_hash_time: {
      threshold: 2000,
      window_minutes: 15,
      action: "auto-rollback",
      description: "95th percentile hash processing time in milliseconds"
    },
    low_confidence_queue: {
      threshold: 1000,
      action: "auto-rollback",
      description: "Number of items in low-confidence processing queue"
    }
  }
};

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    environment: 'staging',
    config: DEFAULT_CONFIG_PATH,
    dryRun: false,
    duration: DEFAULT_MONITORING_DURATION,
    logFile: null
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--env':
        options.environment = args[++i];
        break;
      case '--config':
        options.config = args[++i];
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--duration':
        options.duration = parseInt(args[++i]) * 60 * 1000; // Convert minutes to milliseconds
        break;
      case '--log-file':
        options.logFile = args[++i];
        break;
      case '-h':
      case '--help':
        console.log(`Usage: ${process.argv[1]} [OPTIONS]`);
        console.log('  --env ENVIRONMENT       Target environment (staging, production)');
        console.log('  --config FILE           Configuration file path');
        console.log('  --dry-run              Simulate monitoring without taking actions');
        console.log('  --duration MINUTES     Monitoring duration in minutes (default: 60)');
        console.log('  --log-file FILE        Log output to file instead of stdout');
        console.log('  -h, --help             Show this help message');
        process.exit(0);
      default:
        console.error(`Unknown option: ${args[i]}`);
        process.exit(1);
    }
  }

  return options;
}

// Logging functions
function log(level, message, data = null) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    level,
    message,
    environment: options.environment,
    ...(data && { data })
  };
  
  const logLine = `[${timestamp}] ${level.padEnd(5)}: ${message}${data ? ` ${JSON.stringify(data)}` : ''}`;
  
  if (options.logFile) {
    fs.appendFileSync(options.logFile, logLine + '\n');
  } else {
    console.log(logLine);
  }
}

function logInfo(message, data) { log('INFO', message, data); }
function logWarn(message, data) { log('WARN', message, data); }
function logError(message, data) { log('ERROR', message, data); }

// Load configuration
function loadConfig(configPath) {
  try {
    if (fs.existsSync(configPath)) {
      const configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      return { ...DEFAULT_CONFIG, ...configData };
    } else {
      logWarn(`Configuration file not found: ${configPath}, using defaults`);
      return DEFAULT_CONFIG;
    }
  } catch (error) {
    logError(`Failed to load configuration: ${error.message}`);
    return DEFAULT_CONFIG;
  }
}

// Health monitoring functions
class HealthChecker {
  constructor(environment, config) {
    this.environment = environment;
    this.config = config;
    this.metrics = {
      healthChecks: [],
      extractionFailures: [],
      hashTimes: [],
      queueSize: 0,
      consecutiveFailures: 0
    };
  }

  async checkHealth() {
    try {
      // Simulate health check - in real implementation, this would check actual services
      const isHealthy = Math.random() > 0.1; // 90% success rate
      const responseTime = Math.random() * 1000 + 200; // 200-1200ms response time
      
      const healthData = {
        timestamp: Date.now(),
        healthy: isHealthy,
        responseTime,
        environment: this.environment
      };
      
      this.metrics.healthChecks.push(healthData);
      
      // Keep only recent health checks (last hour)
      const cutoff = Date.now() - (60 * 60 * 1000);
      this.metrics.healthChecks = this.metrics.healthChecks.filter(h => h.timestamp > cutoff);
      
      if (isHealthy) {
        this.metrics.consecutiveFailures = 0;
      } else {
        this.metrics.consecutiveFailures++;
      }
      
      logInfo('Health check completed', healthData);
      return healthData;
    } catch (error) {
      logError('Health check failed', { error: error.message });
      this.metrics.consecutiveFailures++;
      return { timestamp: Date.now(), healthy: false, error: error.message };
    }
  }

  async checkExtractionFailures() {
    try {
      // Simulate extraction failure rate monitoring
      const failureRate = Math.random() * 8; // 0-8% failure rate
      const sampleSize = 100;
      
      const extractionData = {
        timestamp: Date.now(),
        failureRate,
        sampleSize,
        environment: this.environment
      };
      
      this.metrics.extractionFailures.push(extractionData);
      
      // Keep only recent data (based on window)
      const windowMs = this.config.quality_gates.extraction_failure_rate.window_minutes * 60 * 1000;
      const cutoff = Date.now() - windowMs;
      this.metrics.extractionFailures = this.metrics.extractionFailures.filter(e => e.timestamp > cutoff);
      
      logInfo('Extraction failure check completed', extractionData);
      return extractionData;
    } catch (error) {
      logError('Extraction failure check failed', { error: error.message });
      return { timestamp: Date.now(), failureRate: 100, error: error.message };
    }
  }

  async checkHashPerformance() {
    try {
      // Simulate hash time monitoring
      const p95HashTime = Math.random() * 3000 + 500; // 500-3500ms
      const sampleCount = 50;
      
      const perfData = {
        timestamp: Date.now(),
        p95HashTime,
        sampleCount,
        environment: this.environment
      };
      
      this.metrics.hashTimes.push(perfData);
      
      // Keep only recent data (based on window)
      const windowMs = this.config.quality_gates.p95_hash_time.window_minutes * 60 * 1000;
      const cutoff = Date.now() - windowMs;
      this.metrics.hashTimes = this.metrics.hashTimes.filter(h => h.timestamp > cutoff);
      
      logInfo('Hash performance check completed', perfData);
      return perfData;
    } catch (error) {
      logError('Hash performance check failed', { error: error.message });
      return { timestamp: Date.now(), p95HashTime: 10000, error: error.message };
    }
  }

  async checkQueueSize() {
    try {
      // Simulate queue size monitoring
      this.metrics.queueSize = Math.floor(Math.random() * 1500); // 0-1500 items
      
      const queueData = {
        timestamp: Date.now(),
        queueSize: this.metrics.queueSize,
        environment: this.environment
      };
      
      logInfo('Queue size check completed', queueData);
      return queueData;
    } catch (error) {
      logError('Queue size check failed', { error: error.message });
      return { timestamp: Date.now(), queueSize: 10000, error: error.message };
    }
  }
}

// Quality gate checker
class QualityGateChecker {
  constructor(config, healthChecker) {
    this.config = config;
    this.healthChecker = healthChecker;
    this.violations = [];
  }

  checkGates() {
    const violations = [];
    const metrics = this.healthChecker.metrics;

    // Check health failures
    const healthGate = this.config.quality_gates.health_failures;
    if (metrics.consecutiveFailures >= healthGate.threshold) {
      violations.push({
        gate: 'health_failures',
        threshold: healthGate.threshold,
        current: metrics.consecutiveFailures,
        action: healthGate.action,
        description: healthGate.description
      });
    }

    // Check extraction failure rate
    const extractionGate = this.config.quality_gates.extraction_failure_rate;
    if (metrics.extractionFailures.length > 0) {
      const recentFailures = metrics.extractionFailures;
      const avgFailureRate = recentFailures.reduce((sum, f) => sum + f.failureRate, 0) / recentFailures.length;
      
      if (avgFailureRate > extractionGate.threshold) {
        violations.push({
          gate: 'extraction_failure_rate',
          threshold: extractionGate.threshold,
          current: avgFailureRate,
          action: extractionGate.action,
          description: extractionGate.description
        });
      }
    }

    // Check P95 hash time
    const hashTimeGate = this.config.quality_gates.p95_hash_time;
    if (metrics.hashTimes.length > 0) {
      const recentHashTimes = metrics.hashTimes;
      const avgP95Time = recentHashTimes.reduce((sum, h) => sum + h.p95HashTime, 0) / recentHashTimes.length;
      
      if (avgP95Time > hashTimeGate.threshold) {
        violations.push({
          gate: 'p95_hash_time',
          threshold: hashTimeGate.threshold,
          current: avgP95Time,
          action: hashTimeGate.action,
          description: hashTimeGate.description
        });
      }
    }

    // Check queue size
    const queueGate = this.config.quality_gates.low_confidence_queue;
    if (metrics.queueSize > queueGate.threshold) {
      violations.push({
        gate: 'low_confidence_queue',
        threshold: queueGate.threshold,
        current: metrics.queueSize,
        action: queueGate.action,
        description: queueGate.description
      });
    }

    this.violations = violations;
    return violations;
  }

  async handleViolations(violations, dryRun) {
    for (const violation of violations) {
      logWarn(`Quality gate violation: ${violation.gate}`, violation);
      
      if (violation.action === 'auto-rollback') {
        logError(`Auto-rollback triggered by quality gate: ${violation.gate}`);
        
        if (dryRun) {
          logInfo('[DRY-RUN] Would trigger auto-rollback', violation);
        } else {
          await this.triggerRollback(violation);
        }
        
        return true; // Stop processing after first rollback trigger
      }
    }
    
    return false;
  }

  async triggerRollback(violation) {
    try {
      logError('Triggering automatic rollback due to quality gate violation', violation);
      
      // Send critical notification
      const notifyScript = path.join(SCRIPT_DIR, 'notify.js');
      if (fs.existsSync(notifyScript)) {
        const notifyProcess = spawn('node', [
          notifyScript,
          '--type', 'auto-rollback',
          '--env', options.environment,
          '--message', `Auto-rollback triggered: ${violation.gate} exceeded threshold`,
          '--priority', 'critical',
          '--gate', violation.gate,
          '--threshold', violation.threshold.toString(),
          '--current', violation.current.toString()
        ]);
        
        notifyProcess.on('close', (code) => {
          logInfo(`Notification process exited with code ${code}`);
        });
      }
      
      // Execute rollback
      const rollbackScript = path.join(SCRIPT_DIR, 'rollback_dhash.sh');
      if (fs.existsSync(rollbackScript)) {
        logInfo('Executing rollback script...');
        
        const rollbackProcess = spawn('bash', [
          rollbackScript,
          '--env', options.environment,
          '--force'
        ], {
          stdio: 'inherit'
        });
        
        rollbackProcess.on('close', (code) => {
          if (code === 0) {
            logInfo('Rollback completed successfully');
          } else {
            logError(`Rollback failed with code ${code}`);
          }
        });
        
        return new Promise((resolve) => {
          rollbackProcess.on('close', resolve);
        });
      } else {
        logError('Rollback script not found, cannot execute auto-rollback');
      }
    } catch (error) {
      logError('Failed to trigger rollback', { error: error.message });
    }
  }
}

// Main monitoring function
async function runMonitoring(options, config) {
  logInfo('Starting dhash monitoring', {
    environment: options.environment,
    duration: options.duration / 1000 / 60, // minutes
    dryRun: options.dryRun
  });

  const healthChecker = new HealthChecker(options.environment, config);
  const qualityGateChecker = new QualityGateChecker(config, healthChecker);
  
  const startTime = Date.now();
  const endTime = startTime + options.duration;
  const initialPeriodEnd = startTime + (config.monitoring.initial_period_minutes * 60 * 1000);
  
  let checkCount = 0;
  let violationCount = 0;

  // Monitoring loop
  while (Date.now() < endTime) {
    checkCount++;
    const currentTime = Date.now();
    const isInitialPeriod = currentTime < initialPeriodEnd;
    const pollInterval = isInitialPeriod ? 
      config.monitoring.initial_poll_interval_ms : 
      config.monitoring.regular_poll_interval_ms;

    logInfo(`Monitoring check ${checkCount}`, {
      remaining_minutes: Math.ceil((endTime - currentTime) / 1000 / 60),
      poll_interval_seconds: pollInterval / 1000,
      initial_period: isInitialPeriod
    });

    try {
      // Perform all health checks
      await Promise.all([
        healthChecker.checkHealth(),
        healthChecker.checkExtractionFailures(),
        healthChecker.checkHashPerformance(),
        healthChecker.checkQueueSize()
      ]);

      // Check quality gates
      const violations = qualityGateChecker.checkGates();
      
      if (violations.length > 0) {
        violationCount++;
        logWarn(`Quality gate violations detected (${violations.length} violations)`);
        
        const rollbackTriggered = await qualityGateChecker.handleViolations(violations, options.dryRun);
        
        if (rollbackTriggered) {
          logError('Monitoring terminated due to auto-rollback trigger');
          break;
        }
      } else {
        logInfo('All quality gates passed');
      }

    } catch (error) {
      logError('Monitoring check failed', { error: error.message, checkCount });
    }

    // Wait for next check
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  // Generate monitoring summary
  const duration = Date.now() - startTime;
  const summary = {
    total_duration_minutes: Math.ceil(duration / 1000 / 60),
    total_checks: checkCount,
    total_violations: violationCount,
    final_metrics: {
      consecutive_health_failures: healthChecker.metrics.consecutiveFailures,
      recent_health_checks: healthChecker.metrics.healthChecks.length,
      recent_extraction_data: healthChecker.metrics.extractionFailures.length,
      recent_hash_times: healthChecker.metrics.hashTimes.length,
      current_queue_size: healthChecker.metrics.queueSize
    }
  };

  logInfo('Monitoring completed', summary);
  
  // Send completion notification
  const notifyScript = path.join(SCRIPT_DIR, 'notify.js');
  if (fs.existsSync(notifyScript) && !options.dryRun) {
    spawn('node', [
      notifyScript,
      '--type', 'monitoring-complete',
      '--env', options.environment,
      '--message', `dhash monitoring completed - ${checkCount} checks, ${violationCount} violations`,
      '--summary', JSON.stringify(summary)
    ]);
  }
}

// Main execution
const options = parseArgs();
const config = loadConfig(options.config);

// Set up log file if specified
if (options.logFile) {
  const logDir = path.dirname(options.logFile);
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
}

// Handle process termination
process.on('SIGINT', () => {
  logInfo('Monitoring interrupted by user');
  process.exit(0);
});

process.on('SIGTERM', () => {
  logInfo('Monitoring terminated');
  process.exit(0);
});

// Start monitoring
runMonitoring(options, config).catch(error => {
  logError('Monitoring failed', { error: error.message, stack: error.stack });
  process.exit(1);
});