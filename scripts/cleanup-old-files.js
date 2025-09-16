#!/usr/bin/env node

import fs from 'fs';
import path from 'path';

// Default retention period (7 days)
const DEFAULT_RETENTION_DAYS = 7;

// Get retention period from environment variable or use default
const retentionDays = process.env.RETENTION_DAYS ? parseInt(process.env.RETENTION_DAYS) : DEFAULT_RETENTION_DAYS;
const retentionMs = retentionDays * 24 * 60 * 60 * 1000;

// Directories to clean up
const directories = [
  './uploads',
  './output',
  './out'
];

function isOlderThan(file, retentionMs) {
  try {
    const stats = fs.statSync(file);
    const now = Date.now();
    return (now - stats.mtime.getTime()) > retentionMs;
  } catch (error) {
    return false;
  }
}

function cleanupDirectory(dir, retentionMs) {
  if (!fs.existsSync(dir)) {
    console.log(`Directory ${dir} does not exist, skipping...`);
    return;
  }
  
  console.log(`Cleaning up directory: ${dir}`);
  
  try {
    const files = fs.readdirSync(dir);
    let deletedCount = 0;
    
    for (const file of files) {
      const filePath = path.join(dir, file);
      
      // Skip directories for now (we could make this recursive if needed)
      if (fs.statSync(filePath).isDirectory()) {
        continue;
      }
      
      if (isOlderThan(filePath, retentionMs)) {
        try {
          fs.unlinkSync(filePath);
          console.log(`Deleted: ${filePath}`);
          deletedCount++;
        } catch (error) {
          console.error(`Failed to delete ${filePath}:`, error.message);
        }
      }
    }
    
    console.log(`Deleted ${deletedCount} files from ${dir}`);
  } catch (error) {
    console.error(`Error cleaning up directory ${dir}:`, error.message);
  }
}

// If called directly, run cleanup
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(`Cleaning up files older than ${retentionDays} days...`);
  
  for (const dir of directories) {
    cleanupDirectory(dir, retentionMs);
  }
  
  console.log('Cleanup completed.');
}

export { cleanupDirectory, isOlderThan };
