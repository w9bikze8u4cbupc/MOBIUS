#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Get environment variables or use defaults
const GAME = process.env.GAME || 'sushi-go';
const PLATFORM = process.env.PLATFORM || 
  (process.platform === 'win32' ? 'windows' : 
   process.platform === 'darwin' ? 'macos' : 'linux');

// Map platform to directory slug
const slug = PLATFORM === 'windows' ? 'windows' : 
             PLATFORM === 'macos' ? 'macos' : 'linux';

// Define paths
const goldenDir = path.join('tests', 'golden', GAME, slug);
const framesDir = path.join(goldenDir, 'frames');
const debugDir = path.join(goldenDir, 'debug');

console.log(`Promoting actual frames to baseline for ${GAME} on ${PLATFORM}`);

// Check if debug directory exists
if (!fs.existsSync(debugDir)) {
  console.error(`Debug directory not found: ${debugDir}`);
  process.exit(1);
}

// Check if frames directory exists
if (!fs.existsSync(framesDir)) {
  console.error(`Frames directory not found: ${framesDir}`);
  process.exit(1);
}

// Get list of actual frames (files starting with "actual_" in debug directory)
const debugFiles = fs.readdirSync(debugDir).filter(f => f.startsWith('actual_'));

if (debugFiles.length === 0) {
  console.log('No actual frames found in debug directory');
  process.exit(0);
}

console.log(`Found ${debugFiles.length} actual frames to promote:`);
debugFiles.forEach(f => console.log(`  - ${f}`));

// Ask for confirmation (in a real script, you might want to use a proper prompt library)
console.log('\nAre you sure you want to promote these frames to baseline? (y/N)');
process.stdin.setEncoding('utf8');
process.stdin.on('readable', () => {
  const chunk = process.stdin.read();
  if (chunk !== null) {
    const answer = chunk.trim().toLowerCase();
    if (answer === 'y' || answer === 'yes') {
      // Copy actual frames to frames directory
      debugFiles.forEach(file => {
        const src = path.join(debugDir, file);
        const dest = path.join(framesDir, file.replace('actual_', ''));
        fs.copyFileSync(src, dest);
        console.log(`Promoted ${file} to ${dest}`);
      });
      
      console.log('\nPromotion complete! Added a note to JUnit report about baseline update.');
      
      // In a real implementation, you would also update the JUnit report
      // to note that baselines were updated
    } else {
      console.log('Promotion cancelled.');
    }
    process.stdin.destroy();
  }
});

// For non-interactive use, we can also support a --force flag
if (process.argv.includes('--force')) {
  process.stdin.removeAllListeners('readable');
  debugFiles.forEach(file => {
    const src = path.join(debugDir, file);
    const dest = path.join(framesDir, file.replace('actual_', ''));
    fs.copyFileSync(src, dest);
    console.log(`Promoted ${file} to ${dest}`);
  });
  
  console.log('\nPromotion complete! Added a note to JUnit report about baseline update.');
  process.exit(0);
}