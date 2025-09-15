#!/usr/bin/env node
const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');

const GAME = process.env.GAME || 'sushi-go';
const PLATFORM = process.env.PLATFORM || 'macos';
const fpsStrFromContainer = () => {
  const p = path.join('dist', GAME, PLATFORM, 'container.json');
  if (!fs.existsSync(p)) throw new Error(`Missing container.json at ${p}`);
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  return String(j.fps || '30/1');
};
const parseFps = (s) => {
  if (!s) return 30;
  if (/^\d+\/\d+$/.test(s)) {
    const [n, d] = s.split('/').map(Number);
    return d ? n / d : n;
  }
  const f = Number(s);
  return Number.isFinite(f) ? f : 30;
};

function ffprobeDuration(input) {
  const cmd = `ffprobe -v error -select_streams v:0 -show_entries stream=duration -of default=noprint_wrappers=1:nokey=1 "${input}"`;
  const out = execSync(cmd, { encoding: 'utf8' }).trim();
  const dur = Number(out || 0);
  if (!Number.isFinite(dur) || dur <= 0) throw new Error(`Invalid duration from ffprobe: "${out}"`);
  return dur;
}

function ffprobeFrameTimestamps(input) {
  const cmd = `ffprobe -v error -select_streams v:0 -show_entries packet=pts_time -of default=nw=1 "${input}"`;
  const out = execSync(cmd, { encoding: 'utf8' }).trim();
  return out.split('\n').filter(line => line.trim() !== '').map(line => parseFloat(line)).filter(n => !isNaN(n));
}

function countFrames(dir) {
  // Clean output directory check - ensure it exists and is a directory
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    return 0;
  }
  
  // Count only image files, excluding hidden files and directories
  const files = fs.readdirSync(dir, { withFileTypes: true });
  return files.filter(f => {
    if (f.isDirectory()) return false;
    const name = f.name.toLowerCase();
    return name.endsWith('.png') || name.endsWith('.jpg') || name.endsWith('.jpeg');
  }).length;
}

// Clean the output directory before counting
const input = path.join('dist', GAME, PLATFORM, 'tutorial.mp4');
const framesDir = path.join('dist', GAME, PLATFORM, 'frames');

// Ensure frames directory exists and is clean
if (fs.existsSync(framesDir)) {
  // Verify it's a directory
  if (!fs.statSync(framesDir).isDirectory()) {
    console.error(`[frame-validate] ERROR: ${framesDir} exists but is not a directory`);
    process.exit(1);
  }
} else {
  console.error(`[frame-validate] ERROR: Frames directory does not exist: ${framesDir}`);
  process.exit(1);
}

const containerFpsStr = fpsStrFromContainer();
const fps = parseFps(containerFpsStr);
const duration = ffprobeDuration(input);
const expected = Math.round(duration * fps);
const actual = countFrames(framesDir);

// Allow tolerance: max(1, ceil(0.5% of expected))
const tolerance = Math.max(1, Math.ceil(expected * 0.005));

// Check timestamps monotonicity from ffprobe to catch variable frame rate quirks
let timestamps = [];
try {
  timestamps = ffprobeFrameTimestamps(input);
  // Check if timestamps are monotonic (non-decreasing)
  let isMonotonic = true;
  for (let i = 1; i < timestamps.length; i++) {
    if (timestamps[i] < timestamps[i-1]) {
      isMonotonic = false;
      break;
    }
  }
  if (!isMonotonic) {
    console.warn(`[frame-validate] WARNING: Non-monotonic timestamps detected - possible variable frame rate`);
  }
} catch (err) {
  console.warn(`[frame-validate] WARNING: Could not extract timestamps: ${err.message}`);
}

console.log(`[frame-validate] GAME=${GAME} PLATFORM=${PLATFORM} fps=${containerFpsStr} (~${fps.toFixed(3)}) duration=${duration.toFixed(3)}s expected≈${expected} frames actual=${actual} tolerance=±${tolerance}`);

const withinTolerance = Math.abs(expected - actual) <= tolerance;

// Emit JUnit report
const junitDir = path.join('reports', 'junit');
if (!fs.existsSync(junitDir)) {
  fs.mkdirSync(junitDir, { recursive: true });
}

const junitPath = path.join(junitDir, `frame_count_${GAME}_${PLATFORM}.xml`);
const failureText = withinTolerance ? '' : `<failure message="Frame count mismatch">Expected≈${expected} (±${tolerance}) but found ${actual}</failure>`;
const junit = `<?xml version="1.0" encoding="UTF-8"?>
<testsuite name="frame-count" tests="1" failures="${withinTolerance ? 0 : 1}">
  <testcase classname="frame-count" name="${GAME}-${PLATFORM}">
    ${failureText}
    <system-out>{"expected": ${expected}, "actual": ${actual}, "tolerance": ${tolerance}, "duration": ${duration.toFixed(3)}, "fps": "${containerFpsStr}"}</system-out>
  </testcase>
</testsuite>`;
fs.writeFileSync(junitPath, junit);

if (!withinTolerance) {
  console.error(`[frame-validate] MISMATCH: expected≈${expected} (±${tolerance}) but found ${actual} in ${framesDir}`);
  process.exit(1);
} else {
  console.log(`[frame-validate] OK: frames count matches expected within tolerance (±${tolerance}).`);
}