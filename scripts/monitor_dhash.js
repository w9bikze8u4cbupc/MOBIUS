const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// dhash Monitor Script
// Usage: node monitor_dhash.js --env production [--duration 60]

class DhashMonitor {
  constructor(env, duration = 60) {
    this.env = env;
    this.duration = duration; // minutes
    this.startTime = new Date();
    this.checks = 0;
    this.failures = {
      health: 0,
      extractionFailure: 0,
      p95HashTime: 0,
      queueLength: 0
    };
    
    // Quality gate thresholds (configurable)
    this.thresholds = {
      healthFailures: 2,
      extractionFailureRate: 5, // percent
      p95HashTime: 2000, // ms
      queueLength: 1000
    };
    
    console.log(`🎯 Starting dhash monitoring for ${env} environment`);
    console.log(`⏰ Duration: ${duration} minutes`);
    console.log(`🚨 Auto-rollback enabled with quality gates`);
  }

  async start() {
    const endTime = new Date(this.startTime.getTime() + this.duration * 60 * 1000);
    
    while (new Date() < endTime) {
      this.checks++;
      const timeRemaining = Math.ceil((endTime - new Date()) / 1000 / 60);
      
      console.log(`\n📊 Check ${this.checks} - ${timeRemaining}min remaining`);
      
      try {
        await this.runHealthCheck();
        await this.checkMetrics();
        
        // Determine poll interval (30s for first 5min, then 120s)
        const elapsed = (new Date() - this.startTime) / 1000 / 60;
        const interval = elapsed < 5 ? 30 : 120;
        
        console.log(`⏳ Next check in ${interval}s`);
        await this.sleep(interval * 1000);
        
      } catch (error) {
        console.error(`❌ Monitor error: ${error.message}`);
        await this.triggerAlert('monitor_error', error.message);
      }
    }
    
    console.log(`\n🎉 Monitoring completed successfully!`);
    console.log(`📋 Total checks: ${this.checks}`);
    await this.sendNotification('success', `Monitoring completed. ${this.checks} checks passed.`);
  }

  async runHealthCheck() {
    // Simulate health check
    const isHealthy = Math.random() > 0.05; // 95% success rate
    
    if (isHealthy) {
      console.log('✅ Health: OK');
      this.failures.health = 0;
    } else {
      this.failures.health++;
      console.log(`❌ Health: FAIL (${this.failures.health}/${this.thresholds.healthFailures})`);
      
      if (this.failures.health >= this.thresholds.healthFailures) {
        await this.triggerRollback('health_failure', 
          `Health checks failed ${this.failures.health} times consecutively`);
      }
    }
  }

  async checkMetrics() {
    // Simulate metric checks
    const extractionRate = Math.random() * 10; // 0-10%
    const p95Time = 1500 + Math.random() * 1000; // 1500-2500ms
    const queueLength = Math.floor(Math.random() * 1500); // 0-1500 items
    
    console.log(`📈 Extraction failure rate: ${extractionRate.toFixed(1)}%`);
    console.log(`⏱️  P95 hash time: ${Math.round(p95Time)}ms`);
    console.log(`📊 Queue length: ${queueLength} items`);
    
    // Check thresholds
    if (extractionRate > this.thresholds.extractionFailureRate) {
      await this.triggerRollback('extraction_failure_rate', 
        `Extraction failure rate ${extractionRate.toFixed(1)}% exceeds threshold ${this.thresholds.extractionFailureRate}%`);
    }
    
    if (p95Time > this.thresholds.p95HashTime) {
      await this.triggerRollback('p95_hash_time', 
        `P95 hash time ${Math.round(p95Time)}ms exceeds threshold ${this.thresholds.p95HashTime}ms`);
    }
    
    if (queueLength > this.thresholds.queueLength) {
      await this.triggerRollback('queue_length', 
        `Queue length ${queueLength} exceeds threshold ${this.thresholds.queueLength}`);
    }
  }

  async triggerRollback(reason, details) {
    console.log(`\n🚨 TRIGGERING AUTOMATIC ROLLBACK`);
    console.log(`📋 Reason: ${reason}`);
    console.log(`📝 Details: ${details}`);
    
    await this.sendNotification('rollback_triggered', `Auto-rollback: ${reason} - ${details}`);
    
    try {
      // Find latest backup
      const backupDir = path.join(process.cwd(), 'backups');
      const backups = fs.readdirSync(backupDir)
        .filter(f => f.endsWith('.zip'))
        .sort()
        .reverse();
      
      if (backups.length === 0) {
        throw new Error('No backup files found');
      }
      
      const latestBackup = path.join(backupDir, backups[0]);
      console.log(`📦 Using backup: ${latestBackup}`);
      
      // Execute rollback
      const rollbackScript = path.join(process.cwd(), 'scripts', 'rollback_dhash.sh');
      console.log('🔄 Executing rollback...');
      
      const rollback = spawn(rollbackScript, [
        '--backup', latestBackup,
        '--env', this.env,
        '--force'
      ], { stdio: 'inherit' });
      
      rollback.on('close', async (code) => {
        if (code === 0) {
          console.log('✅ Rollback completed successfully');
          await this.sendNotification('rollback_success', 'Automatic rollback completed successfully');
        } else {
          console.log('❌ Rollback failed');
          await this.sendNotification('rollback_failed', `Rollback failed with code ${code}`);
        }
        process.exit(code);
      });
      
    } catch (error) {
      console.error(`❌ Rollback execution failed: ${error.message}`);
      await this.sendNotification('rollback_error', `Rollback failed: ${error.message}`);
      process.exit(1);
    }
  }

  async triggerAlert(type, message) {
    console.log(`⚠️  Alert: ${type} - ${message}`);
    await this.sendNotification('alert', `${type}: ${message}`);
  }

  async sendNotification(type, message) {
    // Use the notification script if available
    const notifyScript = path.join(process.cwd(), 'scripts', 'deploy', 'deploy-notify.js');
    
    if (fs.existsSync(notifyScript)) {
      const notify = spawn('node', [notifyScript, type, '--env', this.env, '--message', message], 
        { stdio: 'inherit' });
      
      notify.on('close', (code) => {
        if (code !== 0) {
          console.log(`⚠️  Notification failed with code ${code}`);
        }
      });
    } else {
      // Fallback: write to file
      const notificationDir = path.join(process.cwd(), 'notifications_out');
      if (!fs.existsSync(notificationDir)) {
        fs.mkdirSync(notificationDir, { recursive: true });
      }
      
      const notification = {
        timestamp: new Date().toISOString(),
        type,
        message,
        environment: this.env
      };
      
      const filename = `notification_${Date.now()}.json`;
      fs.writeFileSync(path.join(notificationDir, filename), JSON.stringify(notification, null, 2));
      console.log(`📝 Notification written to: notifications_out/${filename}`);
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = { env: '', duration: 60 };
  
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--env':
        options.env = args[++i];
        break;
      case '--duration':
        options.duration = parseInt(args[++i]);
        break;
      default:
        console.error(`Unknown option: ${args[i]}`);
        process.exit(1);
    }
  }
  
  if (!options.env) {
    console.error('Error: --env is required');
    console.error('Usage: node monitor_dhash.js --env production [--duration 60]');
    process.exit(1);
  }
  
  return options;
}

// Main execution
if (require.main === module) {
  const options = parseArgs();
  const monitor = new DhashMonitor(options.env, options.duration);
  
  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n🛑 Monitor interrupted by user');
    await monitor.sendNotification('monitor_stopped', 'Monitoring stopped by user intervention');
    process.exit(0);
  });
  
  monitor.start().catch(error => {
    console.error('❌ Monitor failed:', error);
    process.exit(1);
  });
}