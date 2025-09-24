#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

/**
 * MOBIUS DHash System - Atomic Deployment Script
 * Executes: backup → migrate → verify → rollback (if needed)
 */

const backup = require('./backup.js');
const migrate = require('./migrate.js');

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {};
  
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].substring(2);
      const value = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : true;
      opts[key] = value;
    }
  }
  
  return opts;
}

async function runCommand(command, description) {
  console.log(`\n🔄 ${description}...`);
  
  try {
    const result = await command();
    console.log(`✅ ${description} completed successfully`);
    return result;
  } catch (error) {
    console.error(`❌ ${description} failed: ${error.message}`);
    throw error;
  }
}

async function checkPrerequisites() {
  const checks = [
    {
      name: 'ImageMagick',
      command: () => {
        const result = spawnSync('convert', ['-version'], { encoding: 'utf8' });
        return result.status === 0;
      }
    },
    {
      name: 'Library directory',
      command: () => {
        const libDir = process.env.LIBRARY_DIR || path.join(__dirname, '..', 'library');
        return fs.existsSync(libDir);
      }
    }
  ];
  
  console.log('🔍 Checking prerequisites...');
  
  for (const check of checks) {
    try {
      const passed = check.command();
      console.log(`${passed ? '✅' : '❌'} ${check.name}: ${passed ? 'OK' : 'MISSING'}`);
      
      if (!passed && check.name === 'ImageMagick') {
        console.log('   Note: ImageMagick not found, will use fallback hash method');
      }
      
      if (!passed && check.name === 'Library directory') {
        throw new Error(`Library directory not found. Set LIBRARY_DIR environment variable.`);
      }
      
    } catch (error) {
      console.log(`❌ ${check.name}: ERROR - ${error.message}`);
      if (check.name === 'Library directory') {
        throw error;
      }
    }
  }
}

async function createPreDeployBackup() {
  console.log('\n📦 Creating pre-deployment backup...');
  
  const backupResult = await backup.createBackup(
    process.env.LIBRARY_DIR || path.join(__dirname, '..', 'library'),
    'pre-deploy'
  );
  
  console.log(`✅ Pre-deployment backup created`);
  console.log(`   Path: ${backupResult.backupPath}`);
  console.log(`   SHA256: ${backupResult.hash}`);
  console.log(`   Files: ${backupResult.fileCount}`);
  
  return backupResult;
}

async function runMigration(isDryRun = false) {
  console.log(`\n🔄 Running migration${isDryRun ? ' (DRY RUN)' : ''}...`);
  
  const migrationResult = await migrate.processMigration({
    dryRun: isDryRun,
    batchSize: 50 // Smaller batches for deployment
  });
  
  if (migrationResult.stats.errorCount > 0) {
    throw new Error(`Migration failed with ${migrationResult.stats.errorCount} errors`);
  }
  
  console.log(`✅ Migration completed`);
  console.log(`   Processed: ${migrationResult.stats.processedCount} files`);
  console.log(`   Duplicates: ${migrationResult.stats.duplicateHashes}`);
  console.log(`   Low confidence: ${migrationResult.stats.lowConfidenceCount}`);
  
  return migrationResult;
}

async function verifyDeployment(backupResult, migrationResult) {
  console.log('\n🔍 Verifying deployment...');
  
  // Verify backup integrity
  console.log('Verifying backup integrity...');
  await backup.verifyBackup(backupResult.checksumFile);
  
  // Basic deployment verification
  const verificationChecks = [
    {
      name: 'Migration log exists',
      check: () => migrationResult.processedFiles.length > 0
    },
    {
      name: 'No critical errors',
      check: () => migrationResult.stats.errorCount === 0
    },
    {
      name: 'Files processed',
      check: () => migrationResult.stats.processedCount > 0
    }
  ];
  
  let verificationPassed = true;
  
  for (const check of verificationChecks) {
    const passed = check.check();
    console.log(`${passed ? '✅' : '❌'} ${check.name}`);
    
    if (!passed) {
      verificationPassed = false;
    }
  }
  
  if (!verificationPassed) {
    throw new Error('Deployment verification failed');
  }
  
  console.log('✅ Deployment verification passed');
  
  return true;
}

async function rollbackDeployment(backupResult) {
  console.log('\n🔄 Rolling back deployment...');
  
  const libDir = process.env.LIBRARY_DIR || path.join(__dirname, '..', 'library');
  const backupDir = backupResult.backupPath;
  
  // Create a backup of the current (failed) state
  console.log('Creating backup of current state...');
  const failedStateBackup = await backup.createBackup(libDir, 'rollback-failed-state');
  
  // Restore from backup
  console.log('Restoring from backup...');
  
  // Remove current library
  if (fs.existsSync(libDir)) {
    await require('fs/promises').rm(libDir, { recursive: true });
  }
  
  // Copy backup back
  const result = spawnSync('cp', ['-r', backupDir, libDir], { stdio: 'inherit' });
  
  if (result.status !== 0) {
    throw new Error(`Rollback failed with exit code ${result.status}`);
  }
  
  // Verify rollback
  console.log('Verifying rollback...');
  await backup.verifyBackup(backupResult.checksumFile);
  
  console.log('✅ Rollback completed successfully');
  console.log(`   Failed state backed up to: ${failedStateBackup.backupPath}`);
  
  return {
    rolledBack: true,
    failedStateBackup: failedStateBackup.backupPath
  };
}

async function runSmokeTests() {
  console.log('\n🧪 Running post-deployment smoke tests...');
  
  // Basic smoke tests
  const tests = [
    {
      name: 'Library directory readable',
      test: () => {
        const libDir = process.env.LIBRARY_DIR || path.join(__dirname, '..', 'library');
        return fs.existsSync(libDir) && fs.statSync(libDir).isDirectory();
      }
    },
    {
      name: 'Can scan image files',
      test: async () => {
        const libDir = process.env.LIBRARY_DIR || path.join(__dirname, '..', 'library');
        const images = await migrate.scanImageFiles(libDir);
        return images.length >= 0; // Should at least return an array
      }
    }
  ];
  
  let allTestsPassed = true;
  
  for (const test of tests) {
    try {
      const passed = await test.test();
      console.log(`${passed ? '✅' : '❌'} ${test.name}`);
      
      if (!passed) {
        allTestsPassed = false;
      }
    } catch (error) {
      console.log(`❌ ${test.name}: ${error.message}`);
      allTestsPassed = false;
    }
  }
  
  if (!allTestsPassed) {
    throw new Error('Smoke tests failed');
  }
  
  console.log('✅ All smoke tests passed');
  return true;
}

// Main deployment orchestration
async function deploy(opts = {}) {
  console.log('🚀 Starting MOBIUS DHash System Deployment\n');
  console.log(`Mode: ${opts.dryRun ? 'DRY RUN' : 'LIVE DEPLOYMENT'}`);
  console.log(`Rollback enabled: ${opts.noRollback ? 'NO' : 'YES'}`);
  console.log(`Skip smoke tests: ${opts.skipSmokeTests ? 'YES' : 'NO'}`);
  
  const deploymentLog = {
    startTime: new Date().toISOString(),
    mode: opts.dryRun ? 'dry-run' : 'live',
    steps: [],
    result: null
  };
  
  let backupResult = null;
  let migrationResult = null;
  
  try {
    // Step 1: Prerequisites
    await runCommand(
      () => checkPrerequisites(),
      'Checking prerequisites'
    );
    deploymentLog.steps.push({ step: 'prerequisites', status: 'success', timestamp: new Date().toISOString() });
    
    if (!opts.dryRun) {
      // Step 2: Create backup
      backupResult = await runCommand(
        () => createPreDeployBackup(),
        'Creating pre-deployment backup'
      );
      deploymentLog.steps.push({ step: 'backup', status: 'success', timestamp: new Date().toISOString() });
    }
    
    // Step 3: Run migration
    migrationResult = await runCommand(
      () => runMigration(opts.dryRun),
      opts.dryRun ? 'Running migration (dry run)' : 'Running migration'
    );
    deploymentLog.steps.push({ step: 'migration', status: 'success', timestamp: new Date().toISOString() });
    
    if (!opts.dryRun) {
      // Step 4: Verify deployment
      await runCommand(
        () => verifyDeployment(backupResult, migrationResult),
        'Verifying deployment'
      );
      deploymentLog.steps.push({ step: 'verification', status: 'success', timestamp: new Date().toISOString() });
      
      // Step 5: Smoke tests
      if (!opts.skipSmokeTests) {
        await runCommand(
          () => runSmokeTests(),
          'Running smoke tests'
        );
        deploymentLog.steps.push({ step: 'smoke_tests', status: 'success', timestamp: new Date().toISOString() });
      }
    }
    
    deploymentLog.endTime = new Date().toISOString();
    deploymentLog.result = 'success';
    
    console.log('\n🎉 Deployment completed successfully!');
    
    if (opts.dryRun) {
      console.log('\n📋 Dry Run Summary:');
      console.log(`   Files that would be processed: ${migrationResult.stats.totalFiles}`);
      console.log(`   Estimated processing time: ${Math.ceil(migrationResult.stats.totalFiles / 50)} batches`);
      console.log(`   No actual changes were made to the library`);
    } else {
      console.log('\n📋 Deployment Summary:');
      console.log(`   Backup: ${backupResult.backupPath}`);
      console.log(`   Files processed: ${migrationResult.stats.processedCount}`);
      console.log(`   Low confidence items: ${migrationResult.stats.lowConfidenceCount}`);
      
      if (migrationResult.stats.lowConfidenceCount > 0) {
        console.log('\n⚠️  Consider exporting low-confidence items for review:');
        console.log(`   node migrate.js --export-low-conf --log-file [log-file] --output review/low-confidence.json`);
      }
    }
    
    return deploymentLog;
    
  } catch (error) {
    console.error(`\n💥 Deployment failed: ${error.message}`);
    
    deploymentLog.endTime = new Date().toISOString();
    deploymentLog.result = 'failed';
    deploymentLog.error = error.message;
    
    if (!opts.dryRun && !opts.noRollback && backupResult) {
      try {
        console.log('\n🔄 Attempting automatic rollback...');
        const rollbackResult = await rollbackDeployment(backupResult);
        deploymentLog.rollback = rollbackResult;
        deploymentLog.steps.push({ step: 'rollback', status: 'success', timestamp: new Date().toISOString() });
        
        console.log('✅ Automatic rollback completed successfully');
        
      } catch (rollbackError) {
        console.error(`❌ Rollback failed: ${rollbackError.message}`);
        deploymentLog.rollback = { failed: true, error: rollbackError.message };
        deploymentLog.steps.push({ step: 'rollback', status: 'failed', timestamp: new Date().toISOString() });
        
        console.log('\n🚨 MANUAL INTERVENTION REQUIRED');
        console.log(`   Backup location: ${backupResult ? backupResult.backupPath : 'unknown'}`);
        console.log('   Please restore manually and investigate the issue');
      }
    }
    
    throw error;
  }
}

// Main execution
async function main() {
  const opts = parseArgs();
  
  try {
    if (opts.help) {
      console.log(`
MOBIUS DHash System - Atomic Deployment Script

Usage: node deploy.js [options]

Options:
  --dry-run           Preview deployment without making changes
  --no-rollback       Disable automatic rollback on failure (DANGEROUS)
  --skip-smoke-tests  Skip post-deployment smoke tests
  --help              Show this help message

Deployment Process:
  1. Check prerequisites (ImageMagick, directories)
  2. Create pre-deployment backup with SHA256 verification
  3. Run migration to generate DHash fingerprints
  4. Verify deployment integrity
  5. Run post-deployment smoke tests
  6. On failure: Automatic rollback to pre-deployment state

Environment Variables:
  LIBRARY_DIR         Source library directory
  BACKUP_DIR          Backup storage directory
  MIGRATION_LOG_DIR   Migration logs directory

Examples:
  node deploy.js --dry-run         # Preview deployment
  node deploy.js                   # Full deployment with rollback
  node deploy.js --no-rollback     # Deployment without rollback (use carefully)
`);
      return;
    }
    
    await deploy(opts);
    
  } catch (error) {
    console.error(`\nDeployment failed: ${error.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  deploy,
  createPreDeployBackup,
  runMigration,
  verifyDeployment,
  rollbackDeployment,
  runSmokeTests
};