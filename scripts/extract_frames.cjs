const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Helper for consistent path display in logs
const forLog = (p) => p.replace(/\\/g, '/'); // keep file ops with path.*, only prettify logs

function getPlatformSlug() {
  const pEnv = (process.env.PLATFORM || '').toLowerCase();
  if (pEnv === 'macos' || pEnv === 'linux' || pEnv === 'windows') return pEnv;

  const runner = (process.env.RUNNER_OS || '').toLowerCase(); // "Windows" | "macOS" | "Linux"
  if (runner.includes('mac')) return 'macos';
  if (runner.includes('win')) return 'windows';
  if (runner.includes('linux')) return 'linux';

  const plat = process.platform; // 'win32' | 'darwin' | 'linux'
  if (plat === 'darwin') return 'macos';
  if (plat === 'win32') return 'windows';
  if (plat === 'linux') return 'linux';
  return 'linux';
}

// Optional: log for quick triage
console.log(`[platform] PLATFORM=${process.env.PLATFORM || ''} RUNNER_OS=${process.env.RUNNER_OS || ''} resolved=${getPlatformSlug()}`);

// Get environment variables or use defaults
const GAME = process.env.GAME || 'space-invaders';
const PLATFORM = getPlatformSlug();

console.log(`[frames] GAME=${GAME} PLATFORM=${PLATFORM}`);

// Map platform to directory slug
const slug = PLATFORM.toLowerCase() === 'windows' ? 'windows' : 
             PLATFORM.toLowerCase() === 'macos' ? 'macos' : 'linux';

// Define paths - put frames in dist directory for validation
const inputVideo = path.join('dist', GAME, slug, 'tutorial.mp4');
const framesDir = path.join('dist', GAME, slug, 'frames');

console.log(`[frames] input=${inputVideo} framesDir=${framesDir}`);

// Check if input video exists
if (!fs.existsSync(inputVideo)) {
  console.error(`[frames] Input video not found: ${inputVideo}`);
  process.exit(1);
}

// Create frames directory
fs.mkdirSync(framesDir, { recursive: true });

// Extract frames using ffmpeg
// Using fps=1 to extract one frame per second by default, but allow override
const fps = process.argv.includes('--fps') ? process.argv[process.argv.indexOf('--fps') + 1] : '1';
const sar = process.argv.includes('--sar') ? process.argv[process.argv.indexOf('--sar') + 1] : '1:1';

const ffmpegArgs = [
  '-y', // Overwrite output files
  '-i', inputVideo, // Input file
  '-vf', `fps=${fps},format=rgba,setsar=${sar}`, // Extract frames at specified fps, RGBA format, set SAR
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