#!/usr/bin/env node
/**
 * dhash Monitoring and Auto-Rollback Script
 * 
 * Monitors dhash service health and quality gates with automatic rollback capability
 * Usage: node scripts/monitor_dhash.js [--env ENV] [--config PATH] [--dry-run]
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { spawn, execSync } = require('child_process');

// Configuration
const PROJECT_ROOT = path.resolve(__dirname, '..');
const DEFAULT_CONFIG_PATH = path.join(PROJECT_ROOT, 'quality-gates-config.json');
const DEFAULT_LOG_DIR = path.join(PROJECT_ROOT, 'monitor_logs');

class DhashMonitor {
  constructor(options = {}) {
    this.environment = options.environment || 'production';
    this.configPath = options.configPath || DEFAULT_CONFIG_PATH;
    this.dryRun = options.dryRun || false;
    this.verbose = options.verbose || false;
    this.logDir = options.logDir || DEFAULT_LOG_DIR;
    
    // Load configuration
    this.loadConfiguration();
    
    // Initialize state
    this.monitoringState = {
      startTime: new Date(),
      checksPerformed: 0,
      alertsSent: 0,
      qualityGateFailures: new Map(),
      consecutiveHealthFailures: 0,
      rollbackTriggered: false
    };
    
    // Initialize logging
    this.initializeLogging();
    
    this.log('info', `dhash Monitor initialized for environment: ${this.environment}`);
    this.log('info', `Dry run mode: ${this.dryRun}`);
    this.log('info', `Monitoring window: ${this.config.monitoring.window_minutes} minutes`);
  }
  
  loadConfiguration() {
    try {
      const configContent = fs.readFileSync(this.configPath, 'utf8');
      const fullConfig = JSON.parse(configContent);
      
      if (!fullConfig.environments[this.environment]) {
        throw new Error(`Environment '${this.environment}' not found in configuration`);
      }
      
      this.config = {
        ...fullConfig.global_settings,
        ...fullConfig.environments[this.environment]
      };
      
      this.log('info', 'Configuration loaded successfully');
    } catch (error) {
      console.error(`Failed to load configuration: ${error.message}`);
      process.exit(1);
    }
  }
  
  initializeLogging() {
    // Ensure log directory exists
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
    
    // Create log file for this monitoring session
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    this.logFile = path.join(this.logDir, `dhash_${this.environment}_${timestamp}.log`);
    
    // Write initial log entry
    this.writeLogFile('info', 'dhash monitoring session started');
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
    this.writeLogFile(level, message, data);
  }
  
  writeLogFile(level, message, data = null) {
    const timestamp = new Date().toISOString();
    const logLine = JSON.stringify({
      timestamp,
      level: level.toUpperCase(),
      message,
      environment: this.environment,
      ...(data && { data })
    }) + '\n';
    
    try {
      fs.appendFileSync(this.logFile, logLine);
    } catch (error) {
      console.error(`Failed to write to log file: ${error.message}`);
    }
  }
  
  async makeHttpRequest(url, options = {}) {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const isHttps = urlObj.protocol === 'https:';
      const client = isHttps ? https : http;
      
      const requestOptions = {
        hostname: urlObj.hostname,
        port: urlObj.port || (isHttps ? 443 : 80),
        path: urlObj.pathname + urlObj.search,
        method: options.method || 'GET',
        headers: {
          'User-Agent': this.config.user_agent || 'dhash-monitor/1.0.0',
          ...options.headers
        },
        timeout: (this.config.timeout_seconds || 30) * 1000
      };
      
      const req = client.request(requestOptions, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: data
          });
        });
      });
      
      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });
      
      if (options.body) {
        req.write(options.body);
      }
      
      req.end();
    });
  }
  
  async checkHealth() {
    const healthGate = this.config.quality_gates.health;
    if (!healthGate || !healthGate.enabled) {
      return { status: 'skipped', reason: 'Health gate disabled' };
    }
    
    try {
      const healthUrl = `http://localhost:3000${this.config.health_check_endpoint || '/health'}`;
      
      if (this.dryRun) {
        this.log('info', `DRY-RUN: Would check health endpoint: ${healthUrl}`);
        // Simulate health check result
        return Math.random() > 0.1 ? 
          { status: 'ok', responseTime: Math.floor(Math.random() * 100) + 50 } :
          { status: 'error', error: 'Simulated health check failure' };
      }
      
      const startTime = Date.now();
      const response = await this.makeHttpRequest(healthUrl);
      const responseTime = Date.now() - startTime;
      
      if (response.statusCode === 200) {
        this.monitoringState.consecutiveHealthFailures = 0;
        return { status: 'ok', responseTime, statusCode: response.statusCode };
      } else {
        return { 
          status: 'error', 
          error: `HTTP ${response.statusCode}`,
          responseTime,
          statusCode: response.statusCode
        };
      }
    } catch (error) {
      return { status: 'error', error: error.message };
    }
  }
  
  async checkMetrics() {
    try {
      const metricsUrl = `http://localhost:3000${this.config.metrics_endpoint || '/metrics'}`;
      
      if (this.dryRun) {
        this.log('info', `DRY-RUN: Would fetch metrics from: ${metricsUrl}`);
        // Return simulated metrics
        return {
          extraction_failure_rate: Math.random() * 10,
          p95_hash_time_ms: Math.floor(Math.random() * 3000) + 500,
          low_confidence_queue_length: Math.floor(Math.random() * 1500),
          memory_usage_percentage: Math.random() * 100,
          error_rate: Math.random() * 5
        };
      }
      
      const response = await this.makeHttpRequest(metricsUrl);
      
      if (response.statusCode === 200) {
        try {
          return JSON.parse(response.body);
        } catch (error) {
          this.log('error', 'Failed to parse metrics response', { error: error.message });
          return null;
        }
      } else {
        this.log('error', `Metrics endpoint returned ${response.statusCode}`, {
          statusCode: response.statusCode,
          body: response.body.substring(0, 200)
        });
        return null;
      }
    } catch (error) {
      this.log('error', 'Failed to fetch metrics', { error: error.message });
      return null;
    }
  }
  
  evaluateQualityGate(gateName, gateConfig, metrics) {
    if (!gateConfig.enabled) {
      return { status: 'skipped', reason: 'Gate disabled' };
    }
    
    try {
      switch (gateName) {
        case 'extraction_failure_rate':
          if (metrics && typeof metrics.extraction_failure_rate === 'number') {
            const threshold = gateConfig.threshold.max_failure_percentage;
            const actual = metrics.extraction_failure_rate;
            return {
              status: actual <= threshold ? 'pass' : 'fail',
              threshold,
              actual,
              message: `Extraction failure rate: ${actual.toFixed(2)}% (threshold: ${threshold}%)`
            };
          }
          break;
          
        case 'p95_hash_time':
          if (metrics && typeof metrics.p95_hash_time_ms === 'number') {
            const threshold = gateConfig.threshold.max_time_ms;
            const actual = metrics.p95_hash_time_ms;
            return {
              status: actual <= threshold ? 'pass' : 'fail',
              threshold,
              actual,
              message: `P95 hash time: ${actual}ms (threshold: ${threshold}ms)`
            };
          }
          break;
          
        case 'low_confidence_queue':
          if (metrics && typeof metrics.low_confidence_queue_length === 'number') {
            const threshold = gateConfig.threshold.max_queue_length;
            const actual = metrics.low_confidence_queue_length;
            return {
              status: actual <= threshold ? 'pass' : 'fail',
              threshold,
              actual,
              message: `Low confidence queue: ${actual} items (threshold: ${threshold})`
            };
          }
          break;
          
        case 'memory_usage':
          if (metrics && typeof metrics.memory_usage_percentage === 'number') {
            const threshold = gateConfig.threshold.max_usage_percentage;
            const actual = metrics.memory_usage_percentage;
            return {
              status: actual <= threshold ? 'pass' : 'fail',
              threshold,
              actual,
              message: `Memory usage: ${actual.toFixed(1)}% (threshold: ${threshold}%)`
            };
          }
          break;
          
        case 'error_rate':
          if (metrics && typeof metrics.error_rate === 'number') {
            const threshold = gateConfig.threshold.max_error_percentage;
            const actual = metrics.error_rate;
            return {
              status: actual <= threshold ? 'pass' : 'fail',
              threshold,
              actual,
              message: `Error rate: ${actual.toFixed(2)}% (threshold: ${threshold}%)`
            };
          }
          break;
      }
      
      return { 
        status: 'error', 
        reason: 'No metrics available or unsupported gate type',
        gateName 
      };
    } catch (error) {
      return { 
        status: 'error', 
        reason: error.message,
        gateName 
      };
    }
  }
  
  async sendNotification(level, message, data = null) {
    const notification = {
      timestamp: new Date().toISOString(),
      environment: this.environment,
      level,
      message,
      data,
      service: 'dhash'
    };
    
    this.log('info', `Sending ${level} notification: ${message}`, data);
    
    if (this.dryRun) {
      this.log('info', 'DRY-RUN: Would send notification', notification);
      return true;
    }
    
    // Use the notification script if available
    const notifyScript = path.join(PROJECT_ROOT, 'scripts', 'notify.js');
    
    if (fs.existsSync(notifyScript)) {
      try {
        const notifyProcess = spawn('node', [
          notifyScript,
          '--level', level,
          '--message', message,
          '--environment', this.environment,
          '--data', JSON.stringify(data || {})
        ], { stdio: 'pipe' });
        
        return new Promise((resolve) => {
          notifyProcess.on('close', (code) => {
            if (code === 0) {
              this.log('info', 'Notification sent successfully');
              resolve(true);
            } else {
              this.log('error', `Notification script failed with code ${code}`);
              resolve(false);
            }
          });
          
          notifyProcess.on('error', (error) => {
            this.log('error', 'Failed to execute notification script', { error: error.message });
            resolve(false);
          });
        });
      } catch (error) {
        this.log('error', 'Failed to send notification', { error: error.message });
        return false;
      }
    } else {
      // Fallback: write to notification file
      const notificationFile = path.join(this.logDir, `notifications_${this.environment}.json`);
      try {
        const notifications = fs.existsSync(notificationFile) ? 
          JSON.parse(fs.readFileSync(notificationFile, 'utf8')) : [];
        notifications.push(notification);
        fs.writeFileSync(notificationFile, JSON.stringify(notifications, null, 2));
        this.log('info', 'Notification written to file', { file: notificationFile });
        return true;
      } catch (error) {
        this.log('error', 'Failed to write notification file', { error: error.message });
        return false;
      }
    }
  }
  
  async triggerRollback(reason, data = null) {
    if (this.monitoringState.rollbackTriggered) {
      this.log('warn', 'Rollback already triggered, skipping');
      return false;
    }
    
    this.monitoringState.rollbackTriggered = true;
    
    this.log('warn', `TRIGGERING AUTO-ROLLBACK: ${reason}`, data);
    
    // Send critical notification
    await this.sendNotification('critical', `Auto-rollback triggered: ${reason}`, {
      reason,
      environment: this.environment,
      monitoringState: this.monitoringState,
      ...data
    });
    
    if (this.dryRun) {
      this.log('info', 'DRY-RUN: Would execute rollback');
      return true;
    }
    
    // Find latest backup
    const backupsDir = path.join(PROJECT_ROOT, 'backups');
    let latestBackup = null;
    
    try {
      const backupFiles = fs.readdirSync(backupsDir)
        .filter(f => f.startsWith(`dhash_${this.environment}_`) && f.endsWith('.zip'))
        .sort()
        .reverse();
      
      if (backupFiles.length > 0) {
        latestBackup = path.join(backupsDir, backupFiles[0]);
        this.log('info', `Using backup file: ${backupFiles[0]}`);
      } else {
        this.log('error', 'No backup files found for rollback');
        return false;
      }
    } catch (error) {
      this.log('error', 'Failed to find backup files', { error: error.message });
      return false;
    }
    
    // Execute rollback script
    const rollbackScript = path.join(PROJECT_ROOT, 'scripts', 'rollback_dhash.sh');
    
    if (!fs.existsSync(rollbackScript)) {
      this.log('error', 'Rollback script not found', { script: rollbackScript });
      return false;
    }
    
    try {
      const rollbackCmd = [
        rollbackScript,
        '--backup', latestBackup,
        '--env', this.environment,
        '--force'
      ];
      
      this.log('info', 'Executing rollback script', { command: rollbackCmd.join(' ') });
      
      const result = execSync(rollbackCmd.join(' '), { 
        encoding: 'utf8',
        timeout: (this.config.auto_rollback.rollback_timeout_minutes || 10) * 60 * 1000
      });
      
      this.log('info', 'Rollback completed successfully');
      
      // Send success notification
      await this.sendNotification('info', 'Auto-rollback completed successfully', {
        backup_used: path.basename(latestBackup),
        rollback_output: result
      });
      
      return true;
    } catch (error) {
      this.log('error', 'Rollback execution failed', { error: error.message });
      
      // Send failure notification
      await this.sendNotification('critical', 'Auto-rollback FAILED', {
        backup_attempted: latestBackup ? path.basename(latestBackup) : 'none',
        error: error.message
      });
      
      return false;
    }
  }
  
  async performMonitoringCycle() {
    this.log('info', 'Starting monitoring cycle');
    this.monitoringState.checksPerformed++;
    
    const cycleResults = {
      timestamp: new Date().toISOString(),
      cycle: this.monitoringState.checksPerformed,
      health: null,
      metrics: null,
      qualityGateResults: new Map(),
      actionsTaken: []
    };
    
    // Check health
    cycleResults.health = await this.checkHealth();
    
    if (cycleResults.health.status === 'error') {
      this.monitoringState.consecutiveHealthFailures++;
      this.log('warn', `Health check failed (${this.monitoringState.consecutiveHealthFailures} consecutive)`, 
        cycleResults.health);
      
      const healthGate = this.config.quality_gates.health;
      const threshold = healthGate.threshold.consecutive_failures;
      
      if (this.monitoringState.consecutiveHealthFailures >= threshold) {
        cycleResults.actionsTaken.push('health_rollback_triggered');
        
        if (healthGate.actions.includes('auto_rollback') && this.config.auto_rollback.enabled) {
          await this.triggerRollback(
            `Health check failed ${this.monitoringState.consecutiveHealthFailures} consecutive times`,
            { threshold, actual: this.monitoringState.consecutiveHealthFailures }
          );
        }
        
        if (healthGate.actions.includes('alert')) {
          await this.sendNotification('critical', 
            `dhash health check failed ${this.monitoringState.consecutiveHealthFailures} consecutive times`,
            { threshold, actual: this.monitoringState.consecutiveHealthFailures });
          cycleResults.actionsTaken.push('health_alert_sent');
        }
      }
    } else if (cycleResults.health.status === 'ok') {
      if (this.monitoringState.consecutiveHealthFailures > 0) {
        this.log('info', 'Health check recovered');
        this.monitoringState.consecutiveHealthFailures = 0;
      }
    }
    
    // Fetch metrics and evaluate quality gates
    cycleResults.metrics = await this.checkMetrics();
    
    if (cycleResults.metrics) {
      for (const [gateName, gateConfig] of Object.entries(this.config.quality_gates)) {
        if (gateName === 'health') continue; // Already handled above
        
        const result = this.evaluateQualityGate(gateName, gateConfig, cycleResults.metrics);
        cycleResults.qualityGateResults.set(gateName, result);
        
        if (result.status === 'fail') {
          this.log('warn', `Quality gate failed: ${gateName}`, result);
          
          if (gateConfig.actions.includes('alert')) {
            await this.sendNotification('warning', 
              `Quality gate violation: ${result.message}`,
              { gate: gateName, ...result });
            cycleResults.actionsTaken.push(`${gateName}_alert_sent`);
          }
          
          if (gateConfig.actions.includes('auto_rollback') && this.config.auto_rollback.enabled) {
            await this.triggerRollback(`Quality gate failed: ${result.message}`, 
              { gate: gateName, ...result });
            cycleResults.actionsTaken.push(`${gateName}_rollback_triggered`);
          }
        }
      }
    }
    
    // Log cycle summary
    this.log('info', 'Monitoring cycle completed', {
      cycle: cycleResults.cycle,
      health_status: cycleResults.health.status,
      metrics_available: !!cycleResults.metrics,
      actions_taken: cycleResults.actionsTaken,
      rollback_triggered: this.monitoringState.rollbackTriggered
    });
    
    return cycleResults;
  }
  
  async start() {
    const windowMinutes = this.config.monitoring.window_minutes;
    const endTime = new Date(Date.now() + windowMinutes * 60 * 1000);
    
    this.log('info', `Starting ${windowMinutes}-minute monitoring window`);
    this.log('info', `Monitoring will end at: ${endTime.toISOString()}`);
    
    let cycleCount = 0;
    
    while (new Date() < endTime && !this.monitoringState.rollbackTriggered) {
      cycleCount++;
      
      try {
        await this.performMonitoringCycle();
      } catch (error) {
        this.log('error', 'Monitoring cycle failed', { error: error.message, cycle: cycleCount });
      }
      
      // Determine sleep interval
      const elapsed = (new Date() - this.monitoringState.startTime) / (60 * 1000); // minutes
      const interval = elapsed < this.config.monitoring.poll_intervals.initial_minutes ?
        this.config.monitoring.poll_intervals.initial_interval_seconds :
        this.config.monitoring.poll_intervals.normal_interval_seconds;
      
      this.log('info', `Waiting ${interval}s until next check...`);
      await new Promise(resolve => setTimeout(resolve, interval * 1000));
    }
    
    // Final summary
    const duration = (new Date() - this.monitoringState.startTime) / (60 * 1000);
    const summary = {
      duration_minutes: Math.round(duration * 100) / 100,
      cycles_completed: this.monitoringState.checksPerformed,
      alerts_sent: this.monitoringState.alertsSent,
      rollback_triggered: this.monitoringState.rollbackTriggered,
      end_reason: this.monitoringState.rollbackTriggered ? 'rollback_triggered' : 'window_completed'
    };
    
    this.log('info', 'Monitoring session completed', summary);
    
    // Send final notification
    await this.sendNotification('info', 'dhash monitoring session completed', summary);
    
    return summary;
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
      case '--dry-run':
        options.dryRun = true;
        i--; // No value for this flag
        break;
      case '--verbose':
      case '-v':
        options.verbose = true;
        i--; // No value for this flag
        break;
      case '--log-dir':
        options.logDir = value;
        break;
      case '--help':
      case '-h':
        console.log(`
dhash Monitor - Production monitoring and auto-rollback system

Usage: node scripts/monitor_dhash.js [options]

Options:
  --env, --environment ENV    Target environment (default: production)
  --config PATH              Path to quality gates configuration file
  --dry-run                  Simulate monitoring without taking actions
  --verbose, -v              Enable verbose output
  --log-dir DIR              Directory for log files
  --help, -h                 Show this help message

Examples:
  node scripts/monitor_dhash.js --env production
  node scripts/monitor_dhash.js --env staging --dry-run --verbose
  node scripts/monitor_dhash.js --config custom-gates.json
        `);
        process.exit(0);
      default:
        console.error(`Unknown option: ${flag}`);
        process.exit(1);
    }
  }
  
  try {
    const monitor = new DhashMonitor(options);
    const summary = await monitor.start();
    
    // Exit with appropriate code
    if (summary.rollback_triggered) {
      process.exit(2); // Rollback triggered
    } else if (summary.alerts_sent > 0) {
      process.exit(1); // Alerts sent but no rollback
    } else {
      process.exit(0); // All good
    }
  } catch (error) {
    console.error(`Monitor failed: ${error.message}`);
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

module.exports = { DhashMonitor };