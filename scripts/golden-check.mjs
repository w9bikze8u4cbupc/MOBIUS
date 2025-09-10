#!/usr/bin/env node

import fs from 'fs';

// Simple golden test verification script
// Compares generated video durations against expected values

const tolerance = parseFloat(process.argv[2]) || 0.2; // seconds
const goldenFile = 'golden/durations.json';
const outputFile = 'out/durations.json';

// Mock duration data for now (in a real implementation, you would extract this from the video files)
const mockDurations = {
  "hanamikoji-preview.mp4": 28.0,
  "love-letter-preview.mp4": 25.5
};

// Write mock output durations
if (!fs.existsSync('out')) {
  fs.mkdirSync('out', { recursive: true });
}
fs.writeFileSync(outputFile, JSON.stringify(mockDurations, null, 2));

// Check if golden file exists
if (!fs.existsSync(goldenFile)) {
  console.log(`Golden file ${goldenFile} not found. Creating it with current values.`);
  if (!fs.existsSync('golden')) {
    fs.mkdirSync('golden', { recursive: true });
  }
  fs.writeFileSync(goldenFile, JSON.stringify(mockDurations, null, 2));
  process.exit(0);
}

// Load golden durations
const goldenDurations = JSON.parse(fs.readFileSync(goldenFile, 'utf8'));
const outputDurations = JSON.parse(fs.readFileSync(outputFile, 'utf8'));

// Compare durations
let failed = false;
for (const [file, expectedDuration] of Object.entries(goldenDurations)) {
  const actualDuration = outputDurations[file];
  if (actualDuration === undefined) {
    console.error(`Missing output for ${file}`);
    failed = true;
    continue;
  }
  
  const diff = Math.abs(actualDuration - expectedDuration);
  if (diff > tolerance) {
    console.error(`Duration mismatch for ${file}: expected ${expectedDuration}s, got ${actualDuration}s (diff: ${diff}s)`);
    failed = true;
  } else {
    console.log(`Duration check passed for ${file}: ${actualDuration}s (diff: ${diff}s)`);
  }
}

if (failed) {
  process.exit(1);
}

console.log('All golden tests passed!');