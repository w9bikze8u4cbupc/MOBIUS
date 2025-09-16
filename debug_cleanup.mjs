import { isOlderThan } from './scripts/cleanup-old-files.js';
import { existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

console.log('Debugging cleanup script...');

// Test the isOlderThan function
const testFile = 'package.json';
if (existsSync(testFile)) {
  const isOld = isOlderThan(testFile, 7 * 24 * 60 * 60 * 1000); // 7 days
  console.log(`File ${testFile} is older than 7 days: ${isOld}`);
  
  const stats = statSync(testFile);
  console.log(`File ${testFile} last modified: ${stats.mtime}`);
  console.log(`Current time: ${new Date()}`);
  console.log(`Age in days: ${(Date.now() - stats.mtime.getTime()) / (24 * 60 * 60 * 1000)}`);
}

// Check directories
const directories = [
  './uploads',
  './output',
  './out'
];

for (const dir of directories) {
  console.log(`\nChecking directory: ${dir}`);
  if (!existsSync(dir)) {
    console.log(`Directory ${dir} does not exist, skipping...`);
    continue;
  }
  
  try {
    const files = readdirSync(dir);
    console.log(`Found ${files.length} files in ${dir}`);
    
    for (const file of files) {
      const filePath = join(dir, file);
      
      // Skip directories for now
      if (statSync(filePath).isDirectory()) {
        continue;
      }
      
      const isOld = isOlderThan(filePath, 7 * 24 * 60 * 60 * 1000); // 7 days
      console.log(`  ${file}: ${isOld ? 'OLD' : 'NEW'}`);
    }
  } catch (error) {
    console.error(`Error checking directory ${dir}:`, error.message);
  }
}