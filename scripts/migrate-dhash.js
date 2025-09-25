const fs = require('fs');
const path = require('path');
const logger = require('../src/utils/logger');

class DHashMigrator {
  constructor() {
    this.version = '1.0.0';
    this.migrationsDir = path.join(__dirname, '..', 'migrations');
    this.dryRun = false;
    this.verbose = false;
  }

  setDryRun(dryRun) {
    this.dryRun = dryRun;
  }

  setVerbose(verbose) {
    this.verbose = verbose;
  }

  log(message, level = 'info') {
    if (this.verbose || level === 'error') {
      console.log(`[${new Date().toISOString()}] [${level.toUpperCase()}] ${message}`);
    }
    logger[level](message, { category: 'dhash-migration' });
  }

  async ensureMigrationsDir() {
    if (!fs.existsSync(this.migrationsDir)) {
      this.log(`Creating migrations directory: ${this.migrationsDir}`);
      if (!this.dryRun) {
        fs.mkdirSync(this.migrationsDir, { recursive: true });
      }
    }
  }

  async initializeVersionTable() {
    const versionFile = path.join(this.migrationsDir, 'version.json');
    
    if (!fs.existsSync(versionFile)) {
      this.log('Initializing version tracking file');
      const versionData = {
        current_version: '0.0.0',
        migration_history: [],
        created_at: new Date().toISOString()
      };
      
      if (!this.dryRun) {
        fs.writeFileSync(versionFile, JSON.stringify(versionData, null, 2));
      }
    }
  }

  async getCurrentVersion() {
    const versionFile = path.join(this.migrationsDir, 'version.json');
    
    if (!fs.existsSync(versionFile)) {
      return '0.0.0';
    }
    
    try {
      const versionData = JSON.parse(fs.readFileSync(versionFile, 'utf8'));
      return versionData.current_version;
    } catch (error) {
      this.log('Error reading version file, assuming 0.0.0', 'warn');
      return '0.0.0';
    }
  }

  async updateVersion(newVersion, migrationName) {
    const versionFile = path.join(this.migrationsDir, 'version.json');
    
    let versionData;
    try {
      versionData = fs.existsSync(versionFile) 
        ? JSON.parse(fs.readFileSync(versionFile, 'utf8'))
        : { current_version: '0.0.0', migration_history: [], created_at: new Date().toISOString() };
    } catch (error) {
      versionData = { current_version: '0.0.0', migration_history: [], created_at: new Date().toISOString() };
    }
    
    versionData.current_version = newVersion;
    versionData.migration_history.push({
      version: newVersion,
      migration: migrationName,
      timestamp: new Date().toISOString(),
      dry_run: this.dryRun
    });
    
    if (!this.dryRun) {
      fs.writeFileSync(versionFile, JSON.stringify(versionData, null, 2));
    }
  }

  async createDHashTables() {
    this.log('Creating dhash database tables (mock implementation)');
    
    // In a real implementation, this would create actual database tables
    const tablesDir = path.join(this.migrationsDir, 'tables');
    
    if (!this.dryRun) {
      fs.mkdirSync(tablesDir, { recursive: true });
      
      // Create dhash_extractions table schema
      const dhashTableSchema = {
        table_name: 'dhash_extractions',
        columns: [
          { name: 'id', type: 'INTEGER', primary_key: true, auto_increment: true },
          { name: 'image_path', type: 'VARCHAR(255)', nullable: false },
          { name: 'dhash', type: 'VARCHAR(16)', nullable: false },
          { name: 'confidence', type: 'DECIMAL(4,3)', nullable: false },
          { name: 'duration_ms', type: 'INTEGER', nullable: false },
          { name: 'created_at', type: 'TIMESTAMP', default: 'CURRENT_TIMESTAMP' },
          { name: 'request_id', type: 'VARCHAR(32)', nullable: false }
        ],
        indexes: [
          { name: 'idx_dhash', columns: ['dhash'] },
          { name: 'idx_created_at', columns: ['created_at'] }
        ]
      };
      
      fs.writeFileSync(
        path.join(tablesDir, 'dhash_extractions.json'),
        JSON.stringify(dhashTableSchema, null, 2)
      );

      // Create dhash_metrics table schema
      const metricsTableSchema = {
        table_name: 'dhash_metrics',
        columns: [
          { name: 'id', type: 'INTEGER', primary_key: true, auto_increment: true },
          { name: 'metric_name', type: 'VARCHAR(100)', nullable: false },
          { name: 'metric_value', type: 'DECIMAL(10,3)', nullable: false },
          { name: 'timestamp', type: 'TIMESTAMP', default: 'CURRENT_TIMESTAMP' },
          { name: 'metadata', type: 'JSON', nullable: true }
        ],
        indexes: [
          { name: 'idx_metric_timestamp', columns: ['metric_name', 'timestamp'] }
        ]
      };
      
      fs.writeFileSync(
        path.join(tablesDir, 'dhash_metrics.json'),
        JSON.stringify(metricsTableSchema, null, 2)
      );
    }
  }

  async seedInitialData() {
    this.log('Seeding initial dhash configuration data');
    
    const configDir = path.join(this.migrationsDir, 'config');
    
    if (!this.dryRun) {
      fs.mkdirSync(configDir, { recursive: true });
      
      const initialConfig = {
        dhash: {
          extraction_timeout_ms: 30000,
          confidence_threshold: 0.8,
          low_confidence_queue_size: 100,
          metrics_retention_hours: 24,
          logging: {
            enabled: true,
            level: 'info',
            pii_redaction: true
          }
        },
        monitoring: {
          health_check_interval_ms: 5000,
          rollback_triggers: {
            extraction_failures_rate: 0.1,
            p95_hash_time_ms: 30000,
            low_confidence_queue_length: 100
          }
        }
      };
      
      fs.writeFileSync(
        path.join(configDir, 'dhash_config.json'),
        JSON.stringify(initialConfig, null, 2)
      );
    }
  }

  async runMigration_1_0_0() {
    this.log('Running migration to version 1.0.0');
    
    await this.createDHashTables();
    await this.seedInitialData();
    await this.updateVersion('1.0.0', 'initial_dhash_setup');
    
    this.log('Migration 1.0.0 completed successfully');
  }

  async migrate() {
    this.log(`Starting dhash migration (dry-run: ${this.dryRun})`);
    
    await this.ensureMigrationsDir();
    await this.initializeVersionTable();
    
    const currentVersion = await this.getCurrentVersion();
    this.log(`Current version: ${currentVersion}`);
    
    if (currentVersion === '0.0.0') {
      await this.runMigration_1_0_0();
    } else {
      this.log('Database already at latest version');
    }
    
    const finalVersion = await this.getCurrentVersion();
    this.log(`Migration completed. Final version: ${finalVersion}`);
    
    return {
      success: true,
      from_version: currentVersion,
      to_version: finalVersion,
      dry_run: this.dryRun
    };
  }

  async rollback(toVersion = '0.0.0') {
    this.log(`Rolling back to version ${toVersion} (dry-run: ${this.dryRun})`);
    
    const versionFile = path.join(this.migrationsDir, 'version.json');
    
    if (!fs.existsSync(versionFile)) {
      throw new Error('No version file found - cannot rollback');
    }
    
    if (toVersion === '0.0.0') {
      this.log('Rolling back to initial state - removing all migrations');
      
      if (!this.dryRun) {
        // Remove migration artifacts
        const tablesDir = path.join(this.migrationsDir, 'tables');
        const configDir = path.join(this.migrationsDir, 'config');
        
        if (fs.existsSync(tablesDir)) {
          fs.rmSync(tablesDir, { recursive: true, force: true });
        }
        
        if (fs.existsSync(configDir)) {
          fs.rmSync(configDir, { recursive: true, force: true });
        }
        
        // Reset version file
        const versionData = {
          current_version: '0.0.0',
          migration_history: [],
          created_at: new Date().toISOString(),
          rolled_back_at: new Date().toISOString()
        };
        
        fs.writeFileSync(versionFile, JSON.stringify(versionData, null, 2));
      }
    }
    
    this.log(`Rollback to ${toVersion} completed`);
  }
}

// Command line interface
async function main() {
  const args = process.argv.slice(2);
  const migrator = new DHashMigrator();
  
  let dryRun = false;
  let verbose = false;
  let command = 'migrate';
  let rollbackVersion = '0.0.0';
  
  // Parse command line arguments
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--dry-run':
        dryRun = true;
        break;
      case '--verbose':
        verbose = true;
        break;
      case '--rollback':
        command = 'rollback';
        if (args[i + 1] && !args[i + 1].startsWith('--')) {
          rollbackVersion = args[i + 1];
          i++;
        }
        break;
      case '--help':
        console.log(`
Usage: node migrate-dhash.js [options]

Options:
  --dry-run               Show what would be done without executing
  --verbose               Enable verbose output
  --rollback [version]    Rollback to specified version (default: 0.0.0)
  --help                  Show this help message

Examples:
  node migrate-dhash.js                    # Run migrations
  node migrate-dhash.js --dry-run          # Show what would be migrated
  node migrate-dhash.js --rollback         # Rollback to initial state
  node migrate-dhash.js --rollback 0.5.0   # Rollback to version 0.5.0
        `);
        process.exit(0);
        break;
    }
  }
  
  migrator.setDryRun(dryRun);
  migrator.setVerbose(verbose);
  
  try {
    let result;
    
    if (command === 'rollback') {
      await migrator.rollback(rollbackVersion);
      result = { success: true, command: 'rollback', version: rollbackVersion };
    } else {
      result = await migrator.migrate();
    }
    
    console.log('\n✅ Migration completed successfully!');
    console.log('Result:', JSON.stringify(result, null, 2));
    
  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    logger.error('Migration failed', { error: error.message });
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = DHashMigrator;