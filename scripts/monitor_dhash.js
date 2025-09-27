#!/usr/bin/env node

/**
 * dhash Monitoring Script with Quality Gates and Auto-Rollback
 * T+60 monitoring loop with configurable gates
 * Usage: node scripts/monitor_dhash.js [--env staging|production] [--duration 60] [--config /path/to/config]
 */

const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');

// Default configuration
const DEFAULT_CONFIG = {
  environment: 'staging',
  duration: 60, // minutes
  pollCadence: {
    initial: 30, // seconds for first 5 minutes
    normal: 120  // seconds after first 5 minutes
  },
  qualityGates: {
    healthFailures: {
      threshold: 2,
      description: 'consecutive non-OK health checks'
    },
    extractionFailureRate: {
      threshold: 5.0, // percentage
      timeWindow: 10, // minutes
      description: 'extraction failure rate over time window'
    },
    p95HashTime: {
      threshold: 2000, // milliseconds
      timeWindow: 15, // minutes
      description: 'P95 hash time over time window'
    },
    lowConfidenceQueue: {
      threshold: 1000, // items
      description: 'low-confidence queue length'
    }
  },
  autoRollback: true,
  notifications: {
    enabled: true,
    channels: ['console', 'file']
  }
};

class DHAShMonitor {
  constructor(config) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.startTime = Date.now();
    this.metrics = {
      healthChecks: [],
      extractionFailures: [],
      hashTimes: [],
      queueMetrics: []
    };
    this.rollbackTriggered = false;
    
    // Setup logging
    this.logDir = path.join(process.cwd(), 'logs');
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
    
    this.logFile = path.join(this.logDir, `monitor_${this.config.environment}_${this.formatTimestamp(new Date())}.log`);
    this.initLog();
  }

  formatTimestamp(date) {
    return date.toISOString().replace(/[:.]/g, '-').replace('T', '_').split('.')[0];
  }

  initLog() {
    const logHeader = [
      '=== DHASH MONITORING LOG ===',
      `Environment: ${this.config.environment}`,
      `Duration: ${this.config.duration} minutes`,
      `Auto-rollback: ${this.config.autoRollback}`,
      `Started at: ${new Date().toISOString()}`,
      `Log file: ${this.logFile}`,
      ''
    ].join('\n');

    fs.writeFileSync(this.logFile, logHeader);
    this.log('Monitor initialized');
  }

  log(message, level = 'INFO') {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level}] ${message}`;
    
    // Console output with colors
    const colors = {
      INFO: '\x1b[34m',    // Blue
      WARN: '\x1b[33m',    // Yellow
      ERROR: '\x1b[31m',   // Red
      SUCCESS: '\x1b[32m', // Green
      RESET: '\x1b[0m'     // Reset
    };
    
    console.log(`${colors[level] || colors.INFO}${logMessage}${colors.RESET}`);
    
    // File output
    fs.appendFileSync(this.logFile, logMessage + '\n');
  }

  async sleep(seconds) {
    return new Promise(resolve => setTimeout(resolve, seconds * 1000));
  }

  getElapsedMinutes() {
    return Math.floor((Date.now() - this.startTime) / (1000 * 60));
  }

  // Health check simulation
  async performHealthCheck() {
    // Simulate health check API call
    const isHealthy = Math.random() > 0.1; // 90% chance of being healthy
    const response = {
      timestamp: Date.now(),
      status: isHealthy ? 'OK' : 'FAIL',
      responseTime: Math.floor(Math.random() * 200) + 50,
      details: {
        database: isHealthy ? 'connected' : 'timeout',
        cache: isHealthy ? 'operational' : 'degraded'
      }
    };

    this.metrics.healthChecks.push(response);
    
    if (response.status === 'OK') {
      this.log(`Health check: ${response.status} (${response.responseTime}ms)`);
    } else {
      this.log(`Health check: ${response.status} - ${JSON.stringify(response.details)}`, 'WARN');
    }

    return response;
  }

  // Simulate extraction failure rate monitoring
  async checkExtractionFailures() {
    const currentTime = Date.now();
    const timeWindow = this.config.qualityGates.extractionFailureRate.timeWindow * 60 * 1000;
    
    // Simulate some failures
    const failureRate = Math.random() * 10; // 0-10% failure rate
    
    this.metrics.extractionFailures.push({
      timestamp: currentTime,
      rate: failureRate
    });

    // Clean up old metrics outside time window
    this.metrics.extractionFailures = this.metrics.extractionFailures.filter(
      metric => (currentTime - metric.timestamp) <= timeWindow
    );

    const avgFailureRate = this.metrics.extractionFailures.length > 0 
      ? this.metrics.extractionFailures.reduce((sum, m) => sum + m.rate, 0) / this.metrics.extractionFailures.length
      : 0;

    this.log(`Extraction failure rate: ${failureRate.toFixed(2)}% (avg: ${avgFailureRate.toFixed(2)}%)`);
    
    return { current: failureRate, average: avgFailureRate };
  }

  // Simulate P95 hash time monitoring
  async checkHashPerformance() {
    const currentTime = Date.now();
    const timeWindow = this.config.qualityGates.p95HashTime.timeWindow * 60 * 1000;
    
    // Simulate hash times (normally distributed around 800ms)
    const hashTime = Math.max(100, Math.floor(Math.random() * 400) + 600 + (Math.random() > 0.95 ? 1000 : 0));
    
    this.metrics.hashTimes.push({
      timestamp: currentTime,
      duration: hashTime
    });

    // Clean up old metrics
    this.metrics.hashTimes = this.metrics.hashTimes.filter(
      metric => (currentTime - metric.timestamp) <= timeWindow
    );

    // Calculate P95
    const sortedTimes = this.metrics.hashTimes.map(m => m.duration).sort((a, b) => a - b);
    const p95Index = Math.floor(sortedTimes.length * 0.95);
    const p95Time = sortedTimes.length > 0 ? sortedTimes[p95Index] || sortedTimes[sortedTimes.length - 1] : 0;

    this.log(`Hash time: ${hashTime}ms (P95: ${p95Time}ms over ${this.metrics.hashTimes.length} samples)`);
    
    return { current: hashTime, p95: p95Time };
  }

  // Simulate queue monitoring
  async checkQueueMetrics() {
    const queueLength = Math.floor(Math.random() * 1500); // 0-1500 items
    const confidenceScore = Math.random(); // 0-1
    
    const metric = {
      timestamp: Date.now(),
      queueLength,
      confidenceScore
    };

    this.metrics.queueMetrics.push(metric);
    
    this.log(`Queue length: ${queueLength} items (confidence: ${(confidenceScore * 100).toFixed(1)}%)`);
    
    return metric;
  }

  // Quality gates evaluation
  evaluateQualityGates() {
    const violations = [];
    const gates = this.config.qualityGates;

    // Check health failures
    const recentHealthChecks = this.metrics.healthChecks.slice(-gates.healthFailures.threshold);
    const consecutiveFailures = recentHealthChecks.every(check => check.status === 'FAIL') && 
                               recentHealthChecks.length >= gates.healthFailures.threshold;
    
    if (consecutiveFailures) {
      violations.push(`Health failures: ${gates.healthFailures.threshold} ${gates.healthFailures.description}`);
    }

    // Check extraction failure rate
    const currentTime = Date.now();
    const timeWindow = gates.extractionFailureRate.timeWindow * 60 * 1000;
    const recentExtractionFailures = this.metrics.extractionFailures.filter(
      metric => (currentTime - metric.timestamp) <= timeWindow
    );
    
    if (recentExtractionFailures.length > 0) {
      const avgFailureRate = recentExtractionFailures.reduce((sum, m) => sum + m.rate, 0) / recentExtractionFailures.length;
      if (avgFailureRate > gates.extractionFailureRate.threshold) {
        violations.push(`Extraction failure rate: ${avgFailureRate.toFixed(2)}% > ${gates.extractionFailureRate.threshold}% ${gates.extractionFailureRate.description}`);
      }
    }

    // Check P95 hash time
    const hashTimeWindow = gates.p95HashTime.timeWindow * 60 * 1000;
    const recentHashTimes = this.metrics.hashTimes.filter(
      metric => (currentTime - metric.timestamp) <= hashTimeWindow
    );
    
    if (recentHashTimes.length > 0) {
      const sortedTimes = recentHashTimes.map(m => m.duration).sort((a, b) => a - b);
      const p95Index = Math.floor(sortedTimes.length * 0.95);
      const p95Time = sortedTimes[p95Index] || sortedTimes[sortedTimes.length - 1];
      
      if (p95Time > gates.p95HashTime.threshold) {
        violations.push(`P95 hash time: ${p95Time}ms > ${gates.p95HashTime.threshold}ms ${gates.p95HashTime.description}`);
      }
    }

    // Check queue length
    const latestQueue = this.metrics.queueMetrics[this.metrics.queueMetrics.length - 1];
    if (latestQueue && latestQueue.queueLength > gates.lowConfidenceQueue.threshold) {
      violations.push(`Queue length: ${latestQueue.queueLength} > ${gates.lowConfidenceQueue.threshold} ${gates.lowConfidenceQueue.description}`);
    }

    return violations;
  }

  async triggerRollback(reason) {
    if (this.rollbackTriggered) {
      this.log('Rollback already triggered, skipping duplicate trigger', 'WARN');
      return;
    }

    this.rollbackTriggered = true;
    this.log(`TRIGGERING AUTO-ROLLBACK: ${reason}`, 'ERROR');

    // Notify about rollback
    await this.sendNotification(`AUTO-ROLLBACK TRIGGERED: ${reason}`, 'error');

    // Execute rollback script
    try {
      const rollbackScript = path.join(__dirname, 'rollback_dhash.sh');
      if (fs.existsSync(rollbackScript)) {
        this.log('Executing rollback script...', 'ERROR');
        
        const rollbackCmd = `${rollbackScript} --env ${this.config.environment} --reason "auto-rollback-${reason.replace(/\s+/g, '-')}"`;
        this.log(`Rollback command: ${rollbackCmd}`, 'ERROR');
        
        // In production, uncomment this to actually execute rollback
        // execSync(rollbackCmd, { stdio: 'inherit' });
        this.log('ROLLBACK SIMULATION - In production, this would execute the rollback', 'ERROR');
      } else {
        this.log(`Rollback script not found: ${rollbackScript}`, 'ERROR');
      }
    } catch (error) {
      this.log(`Rollback execution failed: ${error.message}`, 'ERROR');
    }
  }

  async sendNotification(message, type = 'info') {
    if (!this.config.notifications.enabled) {
      return;
    }

    const notification = {
      timestamp: new Date().toISOString(),
      environment: this.config.environment,
      type,
      message,
      elapsed: `${this.getElapsedMinutes()} minutes`
    };

    // Console notification (already handled by log)
    if (this.config.notifications.channels.includes('console')) {
      this.log(`NOTIFICATION: ${message}`, type.toUpperCase());
    }

    // File notification
    if (this.config.notifications.channels.includes('file')) {
      const notificationFile = path.join(this.logDir, 'notifications.json');
      let notifications = [];
      
      if (fs.existsSync(notificationFile)) {
        try {
          notifications = JSON.parse(fs.readFileSync(notificationFile, 'utf8'));
        } catch (error) {
          this.log(`Failed to read notifications file: ${error.message}`, 'WARN');
        }
      }
      
      notifications.push(notification);
      fs.writeFileSync(notificationFile, JSON.stringify(notifications, null, 2));
    }
  }

  async monitoringLoop() {
    this.log(`Starting ${this.config.duration}-minute monitoring window`);
    await this.sendNotification(`Monitoring started for ${this.config.duration} minutes`);

    const endTime = this.startTime + (this.config.duration * 60 * 1000);

    while (Date.now() < endTime && !this.rollbackTriggered) {
      const elapsed = this.getElapsedMinutes();
      const remaining = this.config.duration - elapsed;
      
      this.log(`--- Monitoring cycle (${elapsed}/${this.config.duration} minutes, ${remaining} remaining) ---`);

      // Perform all checks
      await this.performHealthCheck();
      await this.checkExtractionFailures();
      await this.checkHashPerformance();
      await this.checkQueueMetrics();

      // Evaluate quality gates
      const violations = this.evaluateQualityGates();
      
      if (violations.length > 0) {
        this.log(`Quality gate violations detected:`, 'ERROR');
        violations.forEach(violation => this.log(`  - ${violation}`, 'ERROR'));
        
        if (this.config.autoRollback) {
          await this.triggerRollback(violations[0]);
          break;
        }
      } else {
        this.log('All quality gates: PASS', 'SUCCESS');
      }

      // Determine sleep duration based on elapsed time
      const sleepDuration = elapsed < 5 
        ? this.config.pollCadence.initial 
        : this.config.pollCadence.normal;
      
      this.log(`Next check in ${sleepDuration} seconds...`);
      await this.sleep(sleepDuration);
    }

    // Monitoring completed
    if (!this.rollbackTriggered) {
      this.log('Monitoring window completed successfully', 'SUCCESS');
      await this.sendNotification('Monitoring completed - No quality gate violations detected', 'success');
    }

    // Generate final report
    await this.generateReport();
  }

  async generateReport() {
    const report = {
      environment: this.config.environment,
      duration: this.config.duration,
      actualDuration: Math.floor((Date.now() - this.startTime) / (1000 * 60)),
      rollbackTriggered: this.rollbackTriggered,
      metrics: {
        totalHealthChecks: this.metrics.healthChecks.length,
        healthCheckSuccess: this.metrics.healthChecks.filter(h => h.status === 'OK').length,
        averageHashTime: this.metrics.hashTimes.length > 0 
          ? this.metrics.hashTimes.reduce((sum, h) => sum + h.duration, 0) / this.metrics.hashTimes.length 
          : 0,
        maxQueueLength: this.metrics.queueMetrics.length > 0 
          ? Math.max(...this.metrics.queueMetrics.map(q => q.queueLength))
          : 0
      },
      completedAt: new Date().toISOString()
    };

    const reportFile = path.join(this.logDir, `monitor_report_${this.config.environment}_${this.formatTimestamp(new Date())}.json`);
    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));

    this.log('=== MONITORING REPORT ===');
    this.log(`Report saved to: ${reportFile}`);
    this.log(`Environment: ${report.environment}`);
    this.log(`Duration: ${report.actualDuration}/${report.duration} minutes`);
    this.log(`Health checks: ${report.metrics.healthCheckSuccess}/${report.metrics.totalHealthChecks} successful`);
    this.log(`Average hash time: ${report.metrics.averageHashTime.toFixed(2)}ms`);
    this.log(`Max queue length: ${report.metrics.maxQueueLength}`);
    this.log(`Rollback triggered: ${report.rollbackTriggered}`);
  }

  async start() {
    try {
      await this.monitoringLoop();
    } catch (error) {
      this.log(`Monitoring failed: ${error.message}`, 'ERROR');
      throw error;
    }
  }
}

// CLI handling
function parseArgs() {
  const args = process.argv.slice(2);
  const config = { ...DEFAULT_CONFIG };

  for (let i = 0; i < args.length; i += 2) {
    const flag = args[i];
    const value = args[i + 1];

    switch (flag) {
      case '--env':
        config.environment = value;
        break;
      case '--duration':
        config.duration = parseInt(value, 10);
        break;
      case '--config':
        if (fs.existsSync(value)) {
          try {
            const fileConfig = JSON.parse(fs.readFileSync(value, 'utf8'));
            Object.assign(config, fileConfig);
          } catch (error) {
            console.error(`Failed to load config file: ${error.message}`);
            process.exit(1);
          }
        } else {
          console.error(`Config file not found: ${value}`);
          process.exit(1);
        }
        break;
      case '--help':
        console.log(`
dhash Monitoring Script - T+60 monitoring with quality gates

Usage: node monitor_dhash.js [OPTIONS]

OPTIONS:
  --env ENV              Environment: staging|production (default: staging)
  --duration MINUTES     Monitoring duration in minutes (default: 60)
  --config FILE          Path to JSON configuration file
  --help                 Show this help message

Examples:
  node monitor_dhash.js --env production
  node monitor_dhash.js --env staging --duration 30
  node monitor_dhash.js --config quality-gates-config.json
        `);
        process.exit(0);
      default:
        if (flag.startsWith('--')) {
          console.error(`Unknown option: ${flag}`);
          process.exit(1);
        }
    }
  }

  return config;
}

// Main execution
if (require.main === module) {
  const config = parseArgs();
  const monitor = new DHAShMonitor(config);

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\nReceived SIGINT, generating final report...');
    monitor.generateReport().then(() => {
      process.exit(0);
    });
  });

  monitor.start().catch(error => {
    console.error('Monitor failed:', error);
    process.exit(1);
  });
}

module.exports = DHAShMonitor;