#!/usr/bin/env node

import { spawnSync } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';

console.log('Running CI validation...');

// Run tests
console.log('\n1. Running unit tests...');
const testResult = spawnSync('npm', ['test'], { stdio: 'inherit', shell: true });
if (testResult.status !== 0) {
  console.error('Unit tests failed');
  process.exit(1);
}

// Run TTS validation
console.log('\n2. Running TTS validation...');
const ttsResult = spawnSync('node', ['test/tts_validation.js'], { stdio: 'inherit', shell: true });
if (ttsResult.status !== 0) {
  console.error('TTS validation failed');
  process.exit(1);
}

// Check that work directory exists with expected artifacts
console.log('\n3. Checking work directory...');
const workDir = path.join(process.cwd(), 'work');
if (!existsSync(workDir)) {
  console.error('Work directory not found');
  process.exit(1);
}

// Check that dist directory exists with rendered videos
console.log('\n4. Checking dist directory...');
const distDir = path.join(process.cwd(), 'dist');
if (!existsSync(distDir)) {
  console.error('Dist directory not found');
  process.exit(1);
}

// Check that tutorial.en.audio.mp4 exists
const renderedVideo = path.join(distDir, 'tutorial.en.audio.mp4');
if (!existsSync(renderedVideo)) {
  console.error('Rendered video not found');
  process.exit(1);
}

console.log('\n✓ All CI validations PASSED!');
console.log('✓ Unit tests passed');
console.log('✓ TTS validation passed');
console.log('✓ Work directory exists');
console.log('✓ Dist directory exists');
console.log('✓ Rendered video exists');