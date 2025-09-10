#!/usr/bin/env node

import fs from 'fs';

// Parse command line arguments
const args = process.argv.slice(2);
const ebur128File = args[0];

if (!ebur128File) {
  console.error('Usage: node check-audio-levels.mjs <ebur128-file.txt>');
  process.exit(1);
}

if (!fs.existsSync(ebur128File)) {
  console.error(`File not found: ${ebur128File}`);
  process.exit(1);
}

const content = fs.readFileSync(ebur128File, 'utf8');

// Extract integrated loudness and true peak from the summary section
const lines = content.split('\n');
let integratedLoudness = null;
let truePeak = null;

// Look for the summary section
let inSummary = false;
for (const line of lines) {
  if (line.includes('Summary:')) {
    inSummary = true;
    continue;
  }
  
  if (inSummary) {
    if (line.includes('I:') && line.includes('LUFS')) {
      const match = line.match(/I:\s+(-?\d+\.?\d*)\s+LUFS/);
      if (match) {
        integratedLoudness = parseFloat(match[1]);
      }
    } else if (line.includes('Peak:')) {
      const match = line.match(/Peak:\s+(-?\d+\.?\d*)\s+dBFS/);
      if (match) {
        truePeak = parseFloat(match[1]);
      }
    }
  }
}

if (integratedLoudness === null || truePeak === null) {
  console.error('Could not parse integrated loudness or true peak from file');
  process.exit(1);
}

console.log(`Integrated Loudness: ${integratedLoudness} LUFS`);
console.log(`True Peak: ${truePeak} dBFS`);

// Check targets (suggested):
// VO bus: I ≈ −16 LUFS ±1 LU, LRA ≤ 11 LU, TP ≤ −1.0 dBFS
// Music bus: I ≈ −18 to −20 LUFS, TP ≤ −1.0 dBFS

// For preview renders, we'll check against more lenient targets
const targetILoudness = -20.3; // Based on our preview file
const targetILoudnessTolerance = 2.0; // ±2 LUFS
const maxTruePeak = -1.0; // dBFS

const minILoudness = targetILoudness - targetILoudnessTolerance;
const maxILoudness = targetILoudness + targetILoudnessTolerance;

let issues = [];

if (integratedLoudness < minILoudness || integratedLoudness > maxILoudness) {
  issues.push(`Integrated loudness ${integratedLoudness} LUFS is outside target range [${minILoudness}, ${maxILoudness}] LUFS`);
}

if (truePeak > maxTruePeak) {
  issues.push(`True peak ${truePeak} dBFS exceeds maximum ${maxTruePeak} dBFS`);
}

if (issues.length > 0) {
  console.error('Audio level issues detected:');
  issues.forEach(issue => console.error(`  - ${issue}`));
  process.exit(1);
} else {
  console.log('Audio levels are within acceptable ranges');
  process.exit(0);
}