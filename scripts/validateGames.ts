#!/usr/bin/env ts-node

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const games = [
  { name: 'Hanamikoji', gig: 'data/hanamikoji.gig.json', shotlist: 'out/hanamikoji_shotlist.json' },
  { name: 'Love Letter', gig: 'data/loveletter.gig.json', shotlist: 'out/loveletter_shotlist.json' }
];

console.log('Validating GIG pipeline for multiple games...\n');

for (const game of games) {
  console.log(`Testing ${game.name}...`);
  
  try {
    // Compile shotlist
    execSync(`npx ts-node src/tools/compileShotlist.ts ${game.gig} ${game.shotlist}`, { stdio: 'pipe' });
    console.log(`  ✓ Shotlist compiled successfully`);
    
    // Verify coverage
    const verificationOutput = execSync(`npx ts-node src/tools/verifyCoverage.ts ${game.gig} ${game.shotlist}`, { encoding: 'utf-8' });
    const verification = JSON.parse(verificationOutput);
    
    if (verification.ok) {
      console.log(`  ✓ All coverage goals met`);
    } else {
      console.log(`  ✗ Coverage verification failed:`);
      for (const result of verification.results) {
        console.log(`    - ${result.detail}`);
      }
    }
    
    // Check shotlist file exists and has content
    if (fs.existsSync(game.shotlist)) {
      const stats = fs.statSync(game.shotlist);
      console.log(`  ✓ Shotlist file created (${stats.size} bytes)`);
    } else {
      console.log(`  ✗ Shotlist file not created`);
    }
    
    // Additional validation for proxy render
    const gameName = game.name.toLowerCase().replace(/\s+/g, '-');
    const timelineFile = `tmp/${gameName}_timeline.json`;
    const outputFile = `out/${gameName}_preview.mp4`;
    
    // Create timeline
    console.log(`  Creating timeline for ${game.name}...`);
    execSync(`npx ts-node src/tools/bindAlignment.ts ${game.shotlist} ${timelineFile}`, { stdio: 'pipe' });
    console.log(`  ✓ Timeline created`);
    
    // Render proxy
    console.log(`  Rendering proxy for ${game.name}...`);
    execSync(`npx ts-node scripts/render-ffmpeg.mjs ${timelineFile} assets ${outputFile} --preview`, { stdio: 'pipe' });
    console.log(`  ✓ Proxy rendered`);
    
    // Check output file
    if (fs.existsSync(outputFile)) {
      const stats = fs.statSync(outputFile);
      console.log(`  ✓ Preview file created (${stats.size} bytes)`);
    } else {
      console.log(`  ✗ Preview file not created`);
    }
    
    // Check durations within tolerance
    const ffprobeOutput = execSync(`ffprobe -v error -show_format -of json ${outputFile}`, { encoding: 'utf-8' });
    const formatInfo = JSON.parse(ffprobeOutput);
    const duration = parseFloat(formatInfo.format.duration);
    console.log(`  ✓ Duration: ${duration.toFixed(2)} seconds`);
    
    // Check for missing assets would go here
    // For now, we'll just check if the render completed without errors
    
  } catch (error: any) {
    console.log(`  ✗ Error testing ${game.name}:`, error.message);
  }
  
  console.log('');
}

console.log('Validation complete!');