const fs = require('fs').promises;
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

// Migration system for MOBIUS dhash service
class MigrationRunner {
  constructor(options = {}) {
    this.dbPath = options.dbPath || path.join(process.cwd(), 'mobius.db');
    this.migrationsDir = options.migrationsDir || path.join(process.cwd(), 'migrations');
    this.dryRun = options.dryRun || false;
    this.logLevel = options.logLevel || 'info';
  }

  log(level, message, data = {}) {
    if (this.logLevel === 'debug' || level !== 'debug') {
      const timestamp = new Date().toISOString();
      const logEntry = {
        timestamp,
        level,
        service: 'migration-runner',
        message,
        ...data
      };
      console.log(JSON.stringify(logEntry));
    }
  }

  async ensureMigrationsTable() {
    return new Promise((resolve, reject) => {
      const db = new sqlite3.Database(this.dbPath);
      
      const createTableQuery = `
        CREATE TABLE IF NOT EXISTS migrations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          filename TEXT NOT NULL UNIQUE,
          batch INTEGER NOT NULL,
          executed_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `;

      if (this.dryRun) {
        this.log('info', 'DRY RUN - Would create migrations table', { query: createTableQuery });
        db.close();
        resolve();
        return;
      }

      db.run(createTableQuery, (err) => {
        db.close();
        if (err) {
          this.log('error', 'Failed to create migrations table', { error: err.message });
          reject(err);
        } else {
          this.log('info', 'Migrations table ensured');
          resolve();
        }
      });
    });
  }

  async getExecutedMigrations() {
    return new Promise((resolve, reject) => {
      if (this.dryRun) {
        this.log('info', 'DRY RUN - Would fetch executed migrations');
        resolve([]);
        return;
      }

      const db = new sqlite3.Database(this.dbPath);
      db.all('SELECT filename FROM migrations ORDER BY id', (err, rows) => {
        db.close();
        if (err) {
          this.log('error', 'Failed to fetch executed migrations', { error: err.message });
          reject(err);
        } else {
          resolve(rows.map(row => row.filename));
        }
      });
    });
  }

  async getPendingMigrations() {
    try {
      // Ensure migrations directory exists
      await fs.mkdir(this.migrationsDir, { recursive: true });
      
      // Get all migration files
      const files = await fs.readdir(this.migrationsDir);
      const migrationFiles = files
        .filter(file => file.endsWith('.sql') || file.endsWith('.js'))
        .sort();

      // Get executed migrations
      const executedMigrations = await this.getExecutedMigrations();

      // Find pending migrations
      const pendingMigrations = migrationFiles.filter(
        file => !executedMigrations.includes(file)
      );

      this.log('info', 'Migration status', {
        total: migrationFiles.length,
        executed: executedMigrations.length,
        pending: pendingMigrations.length,
        pendingFiles: pendingMigrations
      });

      return pendingMigrations;
    } catch (err) {
      this.log('error', 'Failed to get pending migrations', { error: err.message });
      throw err;
    }
  }

  async executeSqlMigration(filename, content) {
    return new Promise((resolve, reject) => {
      if (this.dryRun) {
        this.log('info', 'DRY RUN - Would execute SQL migration', { 
          filename, 
          content: content.substring(0, 200) + (content.length > 200 ? '...' : '')
        });
        resolve();
        return;
      }

      const db = new sqlite3.Database(this.dbPath);
      
      db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        
        // Execute migration SQL
        db.run(content, (err) => {
          if (err) {
            db.run('ROLLBACK');
            db.close();
            this.log('error', 'Migration failed', { filename, error: err.message });
            reject(err);
            return;
          }
          
          // Record migration as executed
          const insertQuery = 'INSERT INTO migrations (filename, batch) VALUES (?, ?)';
          const batch = Date.now(); // Use timestamp as batch number
          
          db.run(insertQuery, [filename, batch], (insertErr) => {
            if (insertErr) {
              db.run('ROLLBACK');
              db.close();
              this.log('error', 'Failed to record migration', { filename, error: insertErr.message });
              reject(insertErr);
              return;
            }
            
            db.run('COMMIT', (commitErr) => {
              db.close();
              if (commitErr) {
                this.log('error', 'Failed to commit migration', { filename, error: commitErr.message });
                reject(commitErr);
              } else {
                this.log('info', 'Migration executed successfully', { filename });
                resolve();
              }
            });
          });
        });
      });
    });
  }

  async executeJsMigration(filename, content) {
    try {
      if (this.dryRun) {
        this.log('info', 'DRY RUN - Would execute JS migration', { filename });
        return;
      }

      // Create a temporary file for the JS migration
      const tempFile = path.join('/tmp', `migration_${Date.now()}.js`);
      await fs.writeFile(tempFile, content);
      
      // Execute the migration
      delete require.cache[tempFile];
      const migration = require(tempFile);
      
      if (typeof migration.up !== 'function') {
        throw new Error('Migration must export an "up" function');
      }

      await migration.up();
      
      // Record migration as executed
      await this.recordMigration(filename);
      
      // Clean up temp file
      await fs.unlink(tempFile);
      
      this.log('info', 'JS migration executed successfully', { filename });
    } catch (err) {
      this.log('error', 'JS migration failed', { filename, error: err.message });
      throw err;
    }
  }

  async recordMigration(filename) {
    return new Promise((resolve, reject) => {
      const db = new sqlite3.Database(this.dbPath);
      const batch = Date.now();
      
      db.run('INSERT INTO migrations (filename, batch) VALUES (?, ?)', [filename, batch], (err) => {
        db.close();
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  async runMigrations() {
    try {
      this.log('info', 'Starting migration process', { 
        dryRun: this.dryRun,
        dbPath: this.dbPath,
        migrationsDir: this.migrationsDir
      });

      // Ensure migrations table exists
      await this.ensureMigrationsTable();

      // Get pending migrations
      const pendingMigrations = await this.getPendingMigrations();

      if (pendingMigrations.length === 0) {
        this.log('info', 'No pending migrations found');
        return;
      }

      this.log('info', 'Found pending migrations', { 
        count: pendingMigrations.length,
        files: pendingMigrations 
      });

      // Execute each pending migration
      for (const filename of pendingMigrations) {
        const filePath = path.join(this.migrationsDir, filename);
        const content = await fs.readFile(filePath, 'utf8');

        this.log('info', 'Executing migration', { filename });

        if (filename.endsWith('.sql')) {
          await this.executeSqlMigration(filename, content);
        } else if (filename.endsWith('.js')) {
          await this.executeJsMigration(filename, content);
        } else {
          this.log('warn', 'Unsupported migration file type', { filename });
          continue;
        }
      }

      this.log('info', 'All migrations completed successfully', {
        executed: pendingMigrations.length
      });

    } catch (err) {
      this.log('error', 'Migration process failed', { error: err.message });
      throw err;
    }
  }

  async rollbackLastBatch() {
    if (this.dryRun) {
      this.log('info', 'DRY RUN - Would rollback last migration batch');
      return;
    }

    this.log('warn', 'Rollback functionality not yet implemented');
    this.log('warn', 'For safety, manual rollback is recommended');
    throw new Error('Rollback not implemented');
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const options = {
    dryRun: false,
    logLevel: 'info'
  };

  // Parse command line arguments
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
    case '--dry-run':
      options.dryRun = true;
      break;
    case '--db-path':
      options.dbPath = args[++i];
      break;
    case '--migrations-dir':
      options.migrationsDir = args[++i];
      break;
    case '--log-level':
      options.logLevel = args[++i];
      break;
    case '--help':
      console.log(`
Usage: node migrate-dhash.js [OPTIONS]

OPTIONS:
  --dry-run              Show what would be migrated without executing
  --db-path PATH         Database file path (default: mobius.db)
  --migrations-dir PATH  Migrations directory (default: migrations)
  --log-level LEVEL      Log level: debug|info|warn|error (default: info)
  --help                 Show this help message

EXAMPLES:
  node scripts/migrate-dhash.js --dry-run
  node scripts/migrate-dhash.js --dry-run > migrate-dryrun.log
  node scripts/migrate-dhash.js --db-path /path/to/db.sqlite

Migration files should be placed in the migrations directory and named with
a timestamp prefix for proper ordering (e.g., 001_initial_schema.sql).
        `);
      process.exit(0);
      break;
    default:
      console.error(`Unknown argument: ${args[i]}`);
      process.exit(1);
    }
  }

  try {
    const runner = new MigrationRunner(options);
    await runner.runMigrations();
    
    if (options.dryRun) {
      console.log('\nDRY RUN completed. No changes were made to the database.');
    } else {
      console.log('\nMigrations completed successfully.');
    }
  } catch (err) {
    console.error('\nMigration failed:', err.message);
    process.exit(1);
  }
}

// Create sample migrations directory and files if they don't exist
async function createSampleMigrations() {
  const migrationsDir = path.join(process.cwd(), 'migrations');
  
  try {
    await fs.mkdir(migrationsDir, { recursive: true });
    
    // Create a sample migration if directory is empty
    const files = await fs.readdir(migrationsDir);
    if (files.length === 0) {
      const sampleMigration = `
-- Sample migration for MOBIUS dhash service
-- This migration adds an index to the projects table for better performance

CREATE INDEX IF NOT EXISTS idx_projects_created_at ON projects(created_at);

-- Add a migration log table for tracking dhash operations
CREATE TABLE IF NOT EXISTS dhash_operations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  operation_type TEXT NOT NULL,
  input_hash TEXT,
  output_hash TEXT,
  duration_ms INTEGER,
  success BOOLEAN DEFAULT 1,
  confidence REAL,
  metadata TEXT, -- JSON metadata
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_dhash_operations_created_at ON dhash_operations(created_at);
CREATE INDEX IF NOT EXISTS idx_dhash_operations_success ON dhash_operations(success);
      `.trim();

      await fs.writeFile(
        path.join(migrationsDir, '001_initial_dhash_schema.sql'),
        sampleMigration
      );
      
      console.log('Created sample migration: migrations/001_initial_dhash_schema.sql');
    }
  } catch (err) {
    // Ignore errors in sample creation
  }
}

// Run if called directly
if (require.main === module) {
  createSampleMigrations().then(() => main());
}

module.exports = { MigrationRunner };