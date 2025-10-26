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

// Parse caps from arguments
const parseCaps = (capsArg) => {
  const caps = {};
  const pairs = capsArg.split(',');
  for (const pair of pairs) {
    const [key, value] = pair.split('=');
    if (key && value) {
      // Convert numeric values
      if (!isNaN(value)) {
        caps[key.trim()] = Number(value);
      } else {
        caps[key.trim()] = value;
      }
    }
  }
  return caps;
};

// Parse loudness from arguments
const parseLoudness = (loudnessArg) => {
  const loudness = {};
  const pairs = loudnessArg.split(',');
  for (const pair of pairs) {
    const [key, value] = pair.split('=');
    if (key && value) {
      // Convert numeric values
      if (!isNaN(value)) {
        loudness[key.trim()] = Number(value);
      } else if (value.toLowerCase() === 'true' || value.toLowerCase() === 'false') {
        loudness[key.trim()] = value.toLowerCase() === 'true';
      } else {
        loudness[key.trim()] = value;
      }
    }
  }
  return loudness;
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
    case '--export-srt':
      options.exportSrt = true;
      break;
    case '--output-dir':
      options.outputDir = args[++i];
      break;
    case '--timeout-ms':
      options.timeoutMs = parseInt(args[++i], 10);
      break;
    case '--job-id':
      options.jobId = args[++i];
      break;
    case '--caps':
      options.caps = parseCaps(args[++i]);
      break;
    case '--loudness':
      options.loudness = parseLoudness(args[++i]);
      break;
    default:
      // Check for dot notation arguments (e.g., --caps.maxWidth 1920)
      if (arg.startsWith('--caps.')) {
        const capName = arg.substring(7); // Remove '--caps.'
        const capValue = args[++i];
        if (!options.caps) options.caps = {};
        options.caps[capName] = isNaN(capValue) ? capValue : Number(capValue);
      } else if (arg.startsWith('--loudness.')) {
        const loudnessName = arg.substring(11); // Remove '--loudness.'
        const loudnessValue = args[++i];
        if (!options.loudness) options.loudness = {};
        if (loudnessValue.toLowerCase() === 'true' || loudnessValue.toLowerCase() === 'false') {
          options.loudness[loudnessName] = loudnessValue.toLowerCase() === 'true';
        } else {
          options.loudness[loudnessName] = isNaN(loudnessValue) ? loudnessValue : Number(loudnessValue);
        }
      } else {
        console.warn(`Unknown argument: ${arg}`);
      }
  }
}

// Apply environment variable defaults
if (!options.timeoutMs) {
  options.timeoutMs = process.env.RENDER_TIMEOUT_MS ? parseInt(process.env.RENDER_TIMEOUT_MS, 10) : 900000;
}

if (!options.caps) {
  options.caps = {};
}

// Apply default caps if not specified
if (options.caps.maxWidth === undefined) options.caps.maxWidth = 1920;
if (options.caps.maxHeight === undefined) options.caps.maxHeight = 1080;
if (options.caps.maxFps === undefined) options.caps.maxFps = 30;
if (options.caps.maxBitrateKbps === undefined) options.caps.maxBitrateKbps = 6000;

if (!options.loudness) {
  options.loudness = {};
}

// Apply default loudness settings if not specified
if (options.loudness.enabled === undefined) options.loudness.enabled = process.env.LOUDNESS_ENABLED !== 'false';
if (options.loudness.targetI === undefined) options.loudness.targetI = -16;
if (options.loudness.lra === undefined) options.loudness.lra = 11;
if (options.loudness.tp === undefined) options.loudness.tp = -1.5;

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
console.log(`Timeout (ms): ${options.timeoutMs}`);
console.log(`Caps: ${JSON.stringify(options.caps)}`);
console.log(`Loudness: ${JSON.stringify(options.loudness)}`);

// For demonstration purposes, we'll use some sample data
// In a real implementation, this would be loaded from the project
job.images = [
  path.join(__dirname, '..', 'assets', 'sample1.png'),
  path.join(__dirname, '..', 'assets', 'sample2.png'),
  path.join(__dirname, '..', 'assets', 'sample3.png')
];

job.audioFile = path.join(__dirname, '..', 'assets', 'sample.mp3');

// If burn captions option is set, add a sample subtitle file
if (options.burnCaptions || options.exportSrt) {
  job.captions = {
    items: [
      { start: 0.5, end: 1.7, text: 'Hello World' },
      { start: 2.5, end: 3.7, text: 'Second caption' }
    ]
  };
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