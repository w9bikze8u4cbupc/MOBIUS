const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Get environment variables or use defaults
const GAME = process.env.GAME || 'space-invaders';
const PLATFORM = process.env.PLATFORM || process.env.RUNNER_OS ||
  (process.platform === 'win32' ? 'windows' : 
   process.platform === 'darwin' ? 'macos' : 'linux');

console.log(`[frames] GAME=${GAME} PLATFORM=${PLATFORM}`);

// Map platform to directory slug
const slug = PLATFORM.toLowerCase() === 'windows' ? 'windows' : 
             PLATFORM.toLowerCase() === 'macos' ? 'macos' : 'linux';

// Define paths
const inputVideo = path.join('dist', GAME, slug, 'tutorial.mp4');
const framesDir = path.join('tests', 'golden', GAME, slug, 'frames');

console.log(`[frames] input=${inputVideo} framesDir=${framesDir}`);

// Check if input video exists
if (!fs.existsSync(inputVideo)) {
  console.error(`[frames] Input video not found: ${inputVideo}`);
  process.exit(1);
}

// Create frames directory
fs.mkdirSync(framesDir, { recursive: true });

// Extract frames using ffmpeg
// Using fps=1 to extract one frame per second
const ffmpegArgs = [
  '-y', // Overwrite output files
  '-i', inputVideo, // Input file
  '-vf', 'fps=1,format=rgba', // Extract 1 frame per second, RGBA format
  '-vsync', '0', // Variable sync mode
  path.join(framesDir, '%06d.png') // Output pattern
];

console.log(`[frames] Running: ffmpeg ${ffmpegArgs.join(' ')}`);

const result = spawnSync('ffmpeg', ffmpegArgs, { stdio: 'inherit' });

if (result.status !== 0) {
  console.error(`[frames] ffmpeg failed with exit code ${result.status}`);
  process.exit(1);
}

// Count extracted frames
const frameFiles = fs.readdirSync(framesDir).filter(f => f.endsWith('.png'));
console.log(`[frames] Extracted ${frameFiles.length} frames to ${framesDir}`);