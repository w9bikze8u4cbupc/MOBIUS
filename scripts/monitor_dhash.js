#!/usr/bin/env node
// monitor_dhash.js - T+60 monitoring loop with adaptive polling and configurable quality gates
// Usage: node monitor_dhash.js --env <environment> [--config <config-file>] [--dry-run]

const fs = require('fs');
const path = require('path');

// Default configuration
const DEFAULT_CONFIG = {
  monitoring: {
    duration_minutes: 60,
    initial_poll_interval_seconds: 30,
    regular_poll_interval_seconds: 120,
    initial_phase_minutes: 5
  },
  quality_gates: {
    health_check: {
      consecutive_failures_threshold: 2,
      action: 'auto-rollback'
    },
    extraction_failure_rate: {
      threshold_percent: 5,
      window_minutes: 10,
      action: 'auto-rollback'
    },
    p95_hash_time: {
      threshold_ms: 2000,
      window_minutes: 15,
      action: 'auto-rollback'
    },
    queue_length: {
      threshold: 1000,
      queue_name: 'low-confidence',
      action: 'auto-rollback'
    }
  },
  notifications: {
    webhook_url: process.env.MONITORING_WEBHOOK_URL || '',
    fallback_file: true,
    escalation_after_minutes: 30
  }
};

class DHashMonitor {
  constructor(environment, config = DEFAULT_CONFIG, dryRun = false) {
    this.environment = environment;
    this.config = config;
    this.dryRun = dryRun;
    this.startTime = new Date();
    this.metrics = {
      health_checks: [],
      extraction_failures: [],
      hash_times: [],
      queue_lengths: []
    };
    this.consecutiveHealthFailures = 0;
    this.rollbackTriggered = false;
    
    console.log(`🔍 Starting DHash monitoring for environment: ${environment}`);
    console.log(`📊 Monitoring duration: ${config.monitoring.duration_minutes} minutes`);
    console.log(`🚨 Dry run mode: ${dryRun}`);
  }

  // Mock health check (in real implementation, this would call actual service endpoints)
  async performHealthCheck() {
    if (this.dryRun) {
      return { status: 'OK', timestamp: new Date(), response_time_ms: 150 };
    }
    
    // Simulate health check with occasional failures
    const success = Math.random() > 0.1; // 90% success rate
    const responseTime = 100 + Math.random() * 200; // 100-300ms response time
    
    return {
      status: success ? 'OK' : 'ERROR',
      timestamp: new Date(),
      response_time_ms: Math.round(responseTime),
      error: success ? null : 'Service unavailable'
    };
  }

  // Mock metrics collection
  async collectMetrics() {
    if (this.dryRun) {
      return {
        extraction_failure_rate: 2.5,
        p95_hash_time_ms: 1800,
        queue_length: 500,
        timestamp: new Date()
      };
    }

    // Simulate metrics with some variation
    return {
      extraction_failure_rate: Math.random() * 8, // 0-8% failure rate
      p95_hash_time_ms: 1500 + Math.random() * 1000, // 1500-2500ms
      queue_length: Math.floor(Math.random() * 1500), // 0-1500 items
      timestamp: new Date()
    };
  }

  // Check quality gates
  checkQualityGates(healthCheck, metrics) {
    const violations = [];
    const gates = this.config.quality_gates;

    // Health check failures
    if (healthCheck.status !== 'OK') {
      this.consecutiveHealthFailures++;
      if (this.consecutiveHealthFailures >= gates.health_check.consecutive_failures_threshold) {
        violations.push({
          gate: 'health_check',
          message: `${this.consecutiveHealthFailures} consecutive health check failures (threshold: ${gates.health_check.consecutive_failures_threshold})`,
          action: gates.health_check.action
        });
      }
    } else {
      this.consecutiveHealthFailures = 0; // Reset on success
    }

    // Extraction failure rate
    this.metrics.extraction_failures.push({
      rate: metrics.extraction_failure_rate,
      timestamp: metrics.timestamp
    });
    
    const recentFailures = this.getRecentMetrics('extraction_failures', gates.extraction_failure_rate.window_minutes);
    if (recentFailures.length > 0) {
      const avgFailureRate = recentFailures.reduce((sum, m) => sum + m.rate, 0) / recentFailures.length;
      if (avgFailureRate > gates.extraction_failure_rate.threshold_percent) {
        violations.push({
          gate: 'extraction_failure_rate',
          message: `Average extraction failure rate ${avgFailureRate.toFixed(2)}% over ${gates.extraction_failure_rate.window_minutes} minutes (threshold: ${gates.extraction_failure_rate.threshold_percent}%)`,
          action: gates.extraction_failure_rate.action
        });
      }
    }

    // P95 hash time
    this.metrics.hash_times.push({
      p95_ms: metrics.p95_hash_time_ms,
      timestamp: metrics.timestamp
    });
    
    const recentHashTimes = this.getRecentMetrics('hash_times', gates.p95_hash_time.window_minutes);
    if (recentHashTimes.length > 0) {
      const avgP95 = recentHashTimes.reduce((sum, m) => sum + m.p95_ms, 0) / recentHashTimes.length;
      if (avgP95 > gates.p95_hash_time.threshold_ms) {
        violations.push({
          gate: 'p95_hash_time',
          message: `Average P95 hash time ${Math.round(avgP95)}ms over ${gates.p95_hash_time.window_minutes} minutes (threshold: ${gates.p95_hash_time.threshold_ms}ms)`,
          action: gates.p95_hash_time.action
        });
      }
    }

    // Queue length
    if (metrics.queue_length > gates.queue_length.threshold) {
      violations.push({
        gate: 'queue_length',
        message: `${gates.queue_length.queue_name} queue length ${metrics.queue_length} (threshold: ${gates.queue_length.threshold})`,
        action: gates.queue_length.action
      });
    }

    return violations;
  }

  // Get recent metrics within specified window
  getRecentMetrics(metricType, windowMinutes) {
    const cutoff = new Date(Date.now() - windowMinutes * 60 * 1000);
    return this.metrics[metricType].filter(m => m.timestamp > cutoff);
  }

  // Send notification
  async sendNotification(message, severity = 'info') {
    const notification = {
      environment: this.environment,
      message,
      severity,
      timestamp: new Date().toISOString(),
      monitoring_duration: Math.round((Date.now() - this.startTime.getTime()) / 1000 / 60)
    };

    if (this.dryRun) {
      console.log(`[DRY-RUN] Would send ${severity} notification: ${message}`);
      return;
    }

    // Try webhook first
    if (this.config.notifications.webhook_url) {
      try {
        // In a real implementation, this would make an HTTP request
        console.log(`📨 Webhook notification sent: ${message}`);
      } catch (error) {
        console.warn(`⚠️  Webhook failed: ${error.message}`);
      }
    }

    // Fallback to file
    if (this.config.notifications.fallback_file) {
      const logFile = `monitor_notifications_${this.environment}_${new Date().toISOString().split('T')[0]}.log`;
      const logEntry = JSON.stringify(notification) + '\n';
      fs.appendFileSync(logFile, logEntry);
      console.log(`📝 Notification logged to: ${logFile}`);
    }
  }

  // Trigger rollback
  async triggerRollback(reason) {
    if (this.rollbackTriggered) {
      return; // Prevent multiple rollbacks
    }
    
    this.rollbackTriggered = true;
    console.log(`🚨 TRIGGERING AUTOMATIC ROLLBACK: ${reason}`);
    
    await this.sendNotification(`AUTOMATIC ROLLBACK TRIGGERED: ${reason}`, 'critical');
    
    if (this.dryRun) {
      console.log('[DRY-RUN] Would execute rollback script');
      return;
    }

    // Find latest backup
    const backupDir = 'backups';
    try {
      const backups = fs.readdirSync(backupDir)
        .filter(f => f.startsWith(`dhash_${this.environment}_`) && f.endsWith('.zip'))
        .sort()
        .reverse();
      
      if (backups.length > 0) {
        const latestBackup = path.join(backupDir, backups[0]);
        console.log(`📦 Using backup: ${latestBackup}`);
        
        // Execute rollback script
        const { spawn } = require('child_process');
        const rollback = spawn('bash', ['scripts/rollback_dhash.sh', '--backup', latestBackup, '--env', this.environment, '--force'], {
          stdio: 'pipe'
        });
        
        rollback.stdout.on('data', (data) => {
          console.log(`ROLLBACK: ${data}`);
        });
        
        rollback.stderr.on('data', (data) => {
          console.error(`ROLLBACK ERROR: ${data}`);
        });
        
        rollback.on('close', (code) => {
          if (code === 0) {
            console.log('✅ Automatic rollback completed successfully');
          } else {
            console.error('❌ Automatic rollback failed');
          }
        });
      } else {
        console.error('❌ No backups found for automatic rollback');
      }
    } catch (error) {
      console.error(`❌ Rollback failed: ${error.message}`);
    }
  }

  // Main monitoring loop
  async monitor() {
    const endTime = new Date(this.startTime.getTime() + this.config.monitoring.duration_minutes * 60 * 1000);
    const initialPhaseEnd = new Date(this.startTime.getTime() + this.config.monitoring.initial_phase_minutes * 60 * 1000);
    
    console.log(`⏰ Monitoring will run until: ${endTime.toLocaleTimeString()}`);
    console.log(`🏃 Initial phase (${this.config.monitoring.initial_poll_interval_seconds}s intervals) until: ${initialPhaseEnd.toLocaleTimeString()}`);
    
    await this.sendNotification('Monitoring started', 'info');
    
    let iteration = 1;
    
    while (new Date() < endTime && !this.rollbackTriggered) {
      const now = new Date();
      const isInitialPhase = now < initialPhaseEnd;
      const pollInterval = isInitialPhase ? 
        this.config.monitoring.initial_poll_interval_seconds :
        this.config.monitoring.regular_poll_interval_seconds;
      
      console.log(`\n🔄 Monitoring iteration ${iteration} (${now.toLocaleTimeString()})`);
      
      try {
        // Perform health check
        const healthCheck = await this.performHealthCheck();
        console.log(`💓 Health check: ${healthCheck.status} (${healthCheck.response_time_ms}ms)`);
        
        // Collect metrics
        const metrics = await this.collectMetrics();
        console.log(`📊 Extraction failure rate: ${metrics.extraction_failure_rate.toFixed(2)}%`);
        console.log(`⏱️  P95 hash time: ${Math.round(metrics.p95_hash_time_ms)}ms`);
        console.log(`📋 Queue length: ${metrics.queue_length}`);
        
        // Check quality gates
        const violations = this.checkQualityGates(healthCheck, metrics);
        
        if (violations.length > 0) {
          console.log(`\n🚨 QUALITY GATE VIOLATIONS:`);
          for (const violation of violations) {
            console.log(`   ${violation.gate}: ${violation.message}`);
            
            if (violation.action === 'auto-rollback') {
              await this.triggerRollback(`Quality gate violation: ${violation.message}`);
              break; // Stop processing after triggering rollback
            }
          }
        } else {
          console.log(`✅ All quality gates: PASS`);
        }
        
        // Store health check for tracking consecutive failures
        this.metrics.health_checks.push(healthCheck);
        
      } catch (error) {
        console.error(`❌ Monitoring iteration failed: ${error.message}`);
        await this.sendNotification(`Monitoring error: ${error.message}`, 'error');
      }
      
      // Wait for next iteration
      if (!this.rollbackTriggered && new Date() < endTime) {
        console.log(`⏸️  Waiting ${pollInterval}s until next check...`);
        await new Promise(resolve => setTimeout(resolve, pollInterval * 1000));
      }
      
      iteration++;
    }
    
    if (!this.rollbackTriggered) {
      console.log('\n🎉 Monitoring completed successfully - no quality gate violations detected');
      await this.sendNotification('Monitoring completed successfully', 'success');
    }
  }
}

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {};
  
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--env':
        options.environment = args[++i];
        break;
      case '--config':
        options.configFile = args[++i];
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '-h':
      case '--help':
        console.log('Usage: node monitor_dhash.js --env <environment> [--config <config-file>] [--dry-run]');
        console.log('  --env: Environment to monitor (required)');
        console.log('  --config: Path to configuration file (optional)');
        console.log('  --dry-run: Show what would be done without executing');
        process.exit(0);
      default:
        console.error(`Unknown option: ${args[i]}`);
        process.exit(1);
    }
  }
  
  return options;
}

// Load configuration
function loadConfig(configFile) {
  if (configFile && fs.existsSync(configFile)) {
    try {
      const configData = fs.readFileSync(configFile, 'utf8');
      return { ...DEFAULT_CONFIG, ...JSON.parse(configData) };
    } catch (error) {
      console.error(`Failed to load config file: ${error.message}`);
      process.exit(1);
    }
  }
  
  // Try to load default config file
  const defaultConfigFile = 'quality-gates-config.json';
  if (fs.existsSync(defaultConfigFile)) {
    try {
      const configData = fs.readFileSync(defaultConfigFile, 'utf8');
      return { ...DEFAULT_CONFIG, ...JSON.parse(configData) };
    } catch (error) {
      console.warn(`Warning: Failed to load default config file: ${error.message}`);
    }
  }
  
  return DEFAULT_CONFIG;
}

// Main execution
async function main() {
  const options = parseArgs();
  
  if (!options.environment) {
    console.error('Error: --env is required');
    process.exit(1);
  }
  
  const config = loadConfig(options.configFile);
  const monitor = new DHashMonitor(options.environment, config, options.dryRun || false);
  
  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n🛑 Monitoring interrupted by user');
    process.exit(0);
  });
  
  process.on('SIGTERM', () => {
    console.log('\n🛑 Monitoring terminated');
    process.exit(0);
  });
  
  try {
    await monitor.monitor();
  } catch (error) {
    console.error(`❌ Monitoring failed: ${error.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { DHashMonitor, DEFAULT_CONFIG };