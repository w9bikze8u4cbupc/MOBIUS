#!/usr/bin/env node

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

/**
 * MOBIUS DHash System - Backup Management
 * Creates timestamped SHA256-verified backups with retention policy
 */

const BACKUP_DIR = process.env.BACKUP_DIR || path.join(__dirname, '..', 'backups');
const LIBRARY_DIR = process.env.LIBRARY_DIR || path.join(__dirname, '..', 'library');
const RETENTION_DAYS = parseInt(process.env.RETENTION_DAYS || '30');

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

async function ensureDir(dirPath) {
  await fsp.mkdir(dirPath, { recursive: true });
}

function calculateSHA256(filePath) {
  const hash = crypto.createHash('sha256');
  const data = fs.readFileSync(filePath);
  hash.update(data);
  return hash.digest('hex');
}

async function calculateDirectorySHA256(dirPath) {
  const files = [];
  
  async function walkDir(currentPath) {
    const entries = await fsp.readdir(currentPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        await walkDir(fullPath);
      } else if (entry.isFile()) {
        const relativePath = path.relative(dirPath, fullPath);
        const hash = calculateSHA256(fullPath);
        files.push({ path: relativePath, hash });
      }
    }
  }
  
  await walkDir(dirPath);
  
  // Sort files by path for consistent hashing
  files.sort((a, b) => a.path.localeCompare(b.path));
  
  // Create combined hash
  const combinedHash = crypto.createHash('sha256');
  for (const file of files) {
    combinedHash.update(`${file.path}:${file.hash}\n`);
  }
  
  return {
    hash: combinedHash.digest('hex'),
    files: files.length,
    manifest: files
  };
}

async function createBackup(sourceDir, backupName) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(BACKUP_DIR, `${backupName}-${timestamp}`);
  
  console.log(`Creating backup: ${backupPath}`);
  
  await ensureDir(BACKUP_DIR);
  
  // Create backup using cp -r for simplicity (could use tar for compression)
  const result = spawnSync('cp', ['-r', sourceDir, backupPath], { stdio: 'inherit' });
  
  if (result.status !== 0) {
    throw new Error(`Backup creation failed with exit code ${result.status}`);
  }
  
  // Calculate SHA256 hash of the backup
  console.log('Calculating SHA256 checksum...');
  const checksumData = await calculateDirectorySHA256(backupPath);
  
  // Save checksum file
  const checksumFile = `${backupPath}.sha256`;
  const checksumContent = {
    backup_name: backupName,
    timestamp,
    source_directory: sourceDir,
    backup_directory: backupPath,
    sha256_hash: checksumData.hash,
    file_count: checksumData.files,
    created_at: new Date().toISOString(),
    manifest: checksumData.manifest
  };
  
  await fsp.writeFile(checksumFile, JSON.stringify(checksumContent, null, 2));
  
  console.log(`✓ Backup created: ${backupPath}`);
  console.log(`✓ SHA256 checksum: ${checksumData.hash}`);
  console.log(`✓ Checksum file: ${checksumFile}`);
  console.log(`✓ Files backed up: ${checksumData.files}`);
  
  return {
    backupPath,
    checksumFile,
    hash: checksumData.hash,
    fileCount: checksumData.files
  };
}

async function verifyBackup(checksumFile) {
  console.log(`Verifying backup: ${checksumFile}`);
  
  if (!fs.existsSync(checksumFile)) {
    throw new Error(`Checksum file not found: ${checksumFile}`);
  }
  
  const checksumData = JSON.parse(await fsp.readFile(checksumFile, 'utf8'));
  const backupPath = checksumData.backup_directory;
  
  if (!fs.existsSync(backupPath)) {
    throw new Error(`Backup directory not found: ${backupPath}`);
  }
  
  console.log('Recalculating SHA256 checksum...');
  const currentChecksum = await calculateDirectorySHA256(backupPath);
  
  if (currentChecksum.hash !== checksumData.sha256_hash) {
    throw new Error(`Checksum verification failed!\nExpected: ${checksumData.sha256_hash}\nActual: ${currentChecksum.hash}`);
  }
  
  if (currentChecksum.files !== checksumData.file_count) {
    throw new Error(`File count mismatch!\nExpected: ${checksumData.file_count}\nActual: ${currentChecksum.files}`);
  }
  
  console.log(`✓ Backup verification successful`);
  console.log(`✓ SHA256 hash: ${currentChecksum.hash}`);
  console.log(`✓ File count: ${currentChecksum.files}`);
  
  return true;
}

async function listBackups() {
  if (!fs.existsSync(BACKUP_DIR)) {
    console.log('No backups directory found.');
    return [];
  }
  
  const entries = await fsp.readdir(BACKUP_DIR);
  const backups = [];
  
  for (const entry of entries) {
    if (entry.endsWith('.sha256')) {
      try {
        const checksumPath = path.join(BACKUP_DIR, entry);
        const checksumData = JSON.parse(await fsp.readFile(checksumPath, 'utf8'));
        backups.push({
          name: checksumData.backup_name,
          timestamp: checksumData.timestamp,
          path: checksumData.backup_directory,
          checksumFile: checksumPath,
          hash: checksumData.sha256_hash,
          fileCount: checksumData.file_count,
          createdAt: new Date(checksumData.created_at)
        });
      } catch (error) {
        console.warn(`Failed to parse checksum file ${entry}: ${error.message}`);
      }
    }
  }
  
  // Sort by creation time (newest first)
  backups.sort((a, b) => b.createdAt - a.createdAt);
  
  return backups;
}

async function cleanOldBackups() {
  console.log(`Cleaning backups older than ${RETENTION_DAYS} days...`);
  
  const backups = await listBackups();
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - RETENTION_DAYS);
  
  let cleaned = 0;
  
  for (const backup of backups) {
    if (backup.createdAt < cutoffDate) {
      console.log(`Removing old backup: ${backup.name} (${backup.timestamp})`);
      
      // Remove backup directory
      if (fs.existsSync(backup.path)) {
        await fsp.rm(backup.path, { recursive: true });
      }
      
      // Remove checksum file
      if (fs.existsSync(backup.checksumFile)) {
        await fsp.unlink(backup.checksumFile);
      }
      
      cleaned++;
    }
  }
  
  console.log(`✓ Cleaned ${cleaned} old backups`);
  return cleaned;
}

async function getLatestBackup() {
  const backups = await listBackups();
  return backups.length > 0 ? backups[0] : null;
}

// Main execution
async function main() {
  const opts = parseArgs();
  
  try {
    if (opts.help) {
      console.log(`
MOBIUS DHash System - Backup Management

Usage: node backup.js [options]

Options:
  --create [name]     Create a new backup (default name: library)
  --verify [file]     Verify backup using checksum file
  --list             List all available backups
  --clean            Clean backups older than retention period
  --latest           Show latest backup info
  --help             Show this help message

Environment Variables:
  BACKUP_DIR         Backup storage directory (default: ../backups)
  LIBRARY_DIR        Source library directory (default: ../library)
  RETENTION_DAYS     Backup retention in days (default: 30)
`);
      return;
    }
    
    if (opts.create !== undefined) {
      const backupName = typeof opts.create === 'string' ? opts.create : 'library';
      const sourceDir = LIBRARY_DIR;
      
      if (!fs.existsSync(sourceDir)) {
        throw new Error(`Source directory not found: ${sourceDir}`);
      }
      
      const result = await createBackup(sourceDir, backupName);
      console.log(`\nBackup Summary:`);
      console.log(`- Path: ${result.backupPath}`);
      console.log(`- Checksum: ${result.checksumFile}`);
      console.log(`- SHA256: ${result.hash}`);
      console.log(`- Files: ${result.fileCount}`);
      
    } else if (opts.verify) {
      const checksumFile = typeof opts.verify === 'string' 
        ? opts.verify 
        : (await getLatestBackup())?.checksumFile;
      
      if (!checksumFile) {
        throw new Error('No checksum file specified and no backups found');
      }
      
      await verifyBackup(checksumFile);
      
    } else if (opts.list) {
      const backups = await listBackups();
      
      if (backups.length === 0) {
        console.log('No backups found.');
      } else {
        console.log(`Found ${backups.length} backup(s):\n`);
        
        for (const backup of backups) {
          console.log(`Name: ${backup.name}`);
          console.log(`Timestamp: ${backup.timestamp}`);
          console.log(`Created: ${backup.createdAt.toISOString()}`);
          console.log(`Files: ${backup.fileCount}`);
          console.log(`SHA256: ${backup.hash}`);
          console.log(`Path: ${backup.path}`);
          console.log('---');
        }
      }
      
    } else if (opts.clean) {
      await cleanOldBackups();
      
    } else if (opts.latest) {
      const latest = await getLatestBackup();
      
      if (!latest) {
        console.log('No backups found.');
      } else {
        console.log(`Latest Backup:`);
        console.log(`- Name: ${latest.name}`);
        console.log(`- Timestamp: ${latest.timestamp}`);
        console.log(`- Created: ${latest.createdAt.toISOString()}`);
        console.log(`- Files: ${latest.fileCount}`);
        console.log(`- SHA256: ${latest.hash}`);
        console.log(`- Path: ${latest.path}`);
      }
      
    } else {
      console.log('No action specified. Use --help for usage information.');
    }
    
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  createBackup,
  verifyBackup,
  listBackups,
  cleanOldBackups,
  getLatestBackup,
  calculateDirectorySHA256
};