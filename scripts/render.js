#!/usr/bin/env node

/**
 * CLI wrapper for the video rendering pipeline
 * Usage: node scripts/render.js --project-id X --mode preview
 */

import { render } from '../src/render/index.js';
import path from 'path';
import { fileURLToPath } from 'url';

// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Parse command line arguments
const args = process.argv.slice(2);
const options = {};
const job = {
  images: [],
  audioFile: '',
  outputDir: path.join(__dirname, '..', 'out')
};

// Simple argument parser
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  
  switch (arg) {
    case '--project-id':
      options.projectId = args[++i];
      break;
    case '--mode':
      options.mode = args[++i];
      break;
    case '--preview-seconds':
      options.previewSeconds = parseInt(args[++i], 10);
      break;
    case '--dry-run':
      options.dryRun = true;
      break;
    case '--burn-captions':
      options.burnCaptions = true;
      break;
    case '--output-dir':
      options.outputDir = args[++i];
      break;
    case '--timeout-ms':
      options.timeoutMs = parseInt(args[++i], 10);
      break;
    default:
      console.warn(`Unknown argument: ${arg}`);
  }
}

// Set default preview seconds based on mode
if (options.mode === 'preview' && !options.previewSeconds) {
  options.previewSeconds = 5; // Default to 5 second preview
} else if (options.mode === 'full-preview' && !options.previewSeconds) {
  options.previewSeconds = 30; // Default to 30 second preview
}

// Set output directory
job.outputDir = options.outputDir || path.join(__dirname, '..', 'out');

// Validate required arguments
if (!options.projectId) {
  console.error('Error: --project-id is required');
  process.exit(1);
}

console.log('Starting video rendering pipeline...');
console.log(`Project ID: ${options.projectId}`);
console.log(`Mode: ${options.mode || 'full'}`);
console.log(`Preview seconds: ${options.previewSeconds || 'N/A'}`);
console.log(`Output directory: ${job.outputDir}`);

// For demonstration purposes, we'll use some sample data
// In a real implementation, this would be loaded from the project
job.images = [
  path.join(__dirname, '..', 'assets', 'sample1.png'),
  path.join(__dirname, '..', 'assets', 'sample2.png'),
  path.join(__dirname, '..', 'assets', 'sample3.png')
];

job.audioFile = path.join(__dirname, '..', 'assets', 'sample.mp3');

// If burn captions option is set, add a sample subtitle file
if (options.burnCaptions) {
  job.subtitleFile = path.join(__dirname, '..', 'assets', 'sample.srt');
}

// Execute render
render(job, options)
  .then((result) => {
    console.log('Render completed successfully!');
    console.log(`Output video: ${result.outputPath}`);
    console.log(`Thumbnail: ${result.thumbnailPath}`);
    if (result.captionPath) {
      console.log(`Captions: ${result.captionPath}`);
    }
    console.log(`Duration: ${result.metadata.duration} seconds`);
    console.log(`FPS: ${result.metadata.fps}`);
  })
  .catch((error) => {
    console.error('Render failed:', error.message);
    process.exit(1);
  });