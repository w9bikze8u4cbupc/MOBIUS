#!/usr/bin/env node

/**
 * MOBIUS Database Migration Script
 * Usage: node scripts/migrate-dhash.js [--dry-run] [--env staging|production]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import logger from '../src/utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = path.join(__dirname, '..');

// Default configuration
const defaultConfig = {
  environment: 'development',
  dryRun: false,
  verbose: false
};

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const config = { ...defaultConfig };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--dry-run':
        config.dryRun = true;
        break;
      case '--env':
        config.environment = args[++i];
        break;
      case '--verbose':
        config.verbose = true;
        break;
      case '--help':
        console.log('Usage: node scripts/migrate-dhash.js [OPTIONS]');
        console.log('');
        console.log('Options:');
        console.log('  --dry-run       Simulate migration without making changes');
        console.log('  --env ENV       Environment: development, staging, or production');
        console.log('  --verbose       Enable verbose output');
        console.log('  --help          Show this help message');
        console.log('');
        console.log('Examples:');
        console.log('  node scripts/migrate-dhash.js --dry-run');
        console.log('  node scripts/migrate-dhash.js --env production');
        process.exit(0);
        break;
      default:
        console.error(`Unknown option: ${args[i]}`);
        process.exit(1);
    }
  }

  if (!['development', 'staging', 'production'].includes(config.environment)) {
    console.error('Error: Environment must be development, staging, or production');
    process.exit(1);
  }

  return config;
}

// Database configuration based on environment
function getDbConfig(environment) {
  const baseConfig = {
    development: {
      database: 'mobius-dev.db',
      uploads: 'src/api/uploads',
      logs: 'logs'
    },
    staging: {
      database: 'mobius-staging.db', 
      uploads: 'src/api/uploads-staging',
      logs: 'logs-staging'
    },
    production: {
      database: 'mobius.db',
      uploads: 'src/api/uploads',
      logs: 'logs'
    }
  };
  
  return baseConfig[environment];
}

// Migration steps definition
const migrations = [
  {
    id: '001_create_uploads_structure',
    description: 'Create uploads directory structure',
    execute: async (config, dbConfig) => {
      const uploadsDir = path.join(projectRoot, dbConfig.uploads);
      const subdirs = ['images', 'pages', 'components', 'tmp'];
      
      for (const subdir of subdirs) {
        const dirPath = path.join(uploadsDir, subdir);
        if (config.dryRun) {
          console.log(`  Would create directory: ${dirPath}`);
        } else {
          if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
            logger.info('Created directory', { path: dirPath });
          }
        }
      }
    }
  },
  {
    id: '002_create_logs_structure',
    description: 'Create logs directory structure',
    execute: async (config, dbConfig) => {
      const logsDir = path.join(projectRoot, dbConfig.logs);
      
      if (config.dryRun) {
        console.log(`  Would create logs directory: ${logsDir}`);
      } else {
        if (!fs.existsSync(logsDir)) {
          fs.mkdirSync(logsDir, { recursive: true });
          logger.info('Created logs directory', { path: logsDir });
        }
      }
    }
  },
  {
    id: '003_create_backups_structure',
    description: 'Create backups directory structure',
    execute: async (config, _dbConfig) => {
      const backupsDir = path.join(projectRoot, 'backups');
      
      if (config.dryRun) {
        console.log(`  Would create backups directory: ${backupsDir}`);
      } else {
        if (!fs.existsSync(backupsDir)) {
          fs.mkdirSync(backupsDir, { recursive: true });
          logger.info('Created backups directory', { path: backupsDir });
        }
      }
    }
  },
  {
    id: '004_initialize_database',
    description: 'Initialize SQLite database if it doesn\'t exist',
    execute: async (config, _dbConfig) => {
      const dbPath = path.join(projectRoot, _dbConfig.database);
      
      if (config.dryRun) {
        console.log(`  Would check/create database: ${dbPath}`);
        return;
      }

      // Check if db.js exists, if not, skip database initialization
      const dbJsPath = path.join(projectRoot, 'src/api/db.js');
      if (!fs.existsSync(dbJsPath)) {
        logger.info('Database module not found, skipping initialization', { 
          path: dbJsPath 
        });
        console.log('  Database module not found, skipping initialization');
        return;
      }

      // Import db module to trigger database creation
      try {
        // Import db to trigger initialization, unused but necessary
        // eslint-disable-next-line no-unused-vars
        const { default: _db } = await import('../src/api/db.js');
        // db is imported to trigger initialization, value not used
        logger.info('Database initialized', { path: dbPath });
      } catch (error) {
        logger.error('Database initialization failed', { error: error.message });
        throw error;
      }
    }
  },
  {
    id: '005_verify_permissions',
    description: 'Verify file system permissions',
    execute: async (config, dbConfig) => {
      const pathsToCheck = [
        dbConfig.uploads,
        dbConfig.logs,
        'backups'
      ];

      for (const dirPath of pathsToCheck) {
        const fullPath = path.join(projectRoot, dirPath);
        
        if (config.dryRun) {
          console.log(`  Would verify permissions for: ${fullPath}`);
          continue;
        }

        try {
          // Test write permissions by creating a temporary file
          const testFile = path.join(fullPath, '.write-test');
          fs.writeFileSync(testFile, 'test');
          fs.unlinkSync(testFile);
          logger.debug('Permissions verified', { path: fullPath });
        } catch (error) {
          logger.error('Permission check failed', { path: fullPath, error: error.message });
          throw new Error(`Cannot write to ${fullPath}: ${error.message}`);
        }
      }
    }
  },
  {
    id: '006_cleanup_old_files',
    description: 'Clean up old temporary files',
    execute: async (config, dbConfig) => {
      const tempDir = path.join(projectRoot, dbConfig.uploads, 'tmp');
      
      if (config.dryRun) {
        console.log(`  Would clean up temporary files in: ${tempDir}`);
        return;
      }

      if (fs.existsSync(tempDir)) {
        try {
          const files = fs.readdirSync(tempDir);
          const cutoffTime = Date.now() - (24 * 60 * 60 * 1000); // 24 hours ago
          
          for (const file of files) {
            const filePath = path.join(tempDir, file);
            const stats = fs.statSync(filePath);
            
            if (stats.mtime.getTime() < cutoffTime) {
              fs.unlinkSync(filePath);
              logger.debug('Removed old temp file', { file: filePath });
            }
          }
        } catch (error) {
          logger.warn('Cleanup failed', { error: error.message });
        }
      }
    }
  }
];

// Execute migrations
async function runMigrations(config) {
  const dbConfig = getDbConfig(config.environment);
  
  console.log('🗄️  MOBIUS Database Migration');
  console.log(`   Environment: ${config.environment}`);
  console.log(`   Dry run: ${config.dryRun}`);
  if (config.dryRun) {
    console.log('   🧪 DRY RUN MODE - No changes will be made');
  }
  console.log('');

  logger.info('Migration started', { 
    environment: config.environment, 
    dryRun: config.dryRun,
    totalMigrations: migrations.length
  });

  let successCount = 0;
  let failureCount = 0;

  for (const migration of migrations) {
    console.log(`📋 ${migration.id}: ${migration.description}`);
    
    try {
      await migration.execute(config, dbConfig);
      successCount++;
      
      if (config.verbose) {
        console.log(`✅ Completed: ${migration.id}`);
      }
      
      logger.info('Migration completed', { 
        migrationId: migration.id,
        description: migration.description 
      });
      
    } catch (error) {
      failureCount++;
      console.error(`❌ Failed: ${migration.id} - ${error.message}`);
      
      logger.error('Migration failed', { 
        migrationId: migration.id,
        description: migration.description,
        error: error.message,
        stack: error.stack
      });

      // Stop on first failure
      break;
    }
  }

  console.log('');
  console.log('📊 Migration Summary:');
  console.log(`   ✅ Successful: ${successCount}`);
  console.log(`   ❌ Failed: ${failureCount}`);
  console.log(`   📝 Total: ${migrations.length}`);

  if (failureCount > 0) {
    console.log('');
    console.log('❌ Migrations failed. Check logs for details.');
    logger.error('Migration process failed', { successCount, failureCount });
    process.exit(1);
  } else {
    console.log('');
    console.log('🎉 All migrations completed successfully!');
    logger.info('Migration process completed', { successCount, failureCount });
  }

  // Environment-specific post-migration notes
  if (config.environment === 'production' && !config.dryRun) {
    console.log('');
    console.log('🚨 PRODUCTION MIGRATION COMPLETE');
    console.log('   Verify application functionality immediately');
    console.log('   Monitor logs for any issues');
    console.log('   Keep backup ready for quick rollback if needed');
  }
}

// Main execution
async function main() {
  try {
    const config = parseArgs();
    await runMigrations(config);
  } catch (error) {
    console.error('Migration script failed:', error.message);
    logger.error('Migration script failed', { 
      error: error.message, 
      stack: error.stack 
    });
    process.exit(1);
  }
}

// Handle script being run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}