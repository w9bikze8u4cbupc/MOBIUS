#!/usr/bin/env node

// Fail-safe promotion semantics in CI
const DRY = process.env.DRY_RUN === '1' || process.argv.includes('--dry-run');
const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';
const ALLOW_REGRESSION = process.env.ALLOW_REGRESSION === '1' || process.argv.includes('--allow-regression');
const ALLOW_REGRESSION_REASON = process.env.ALLOW_REGRESSION_REASON || null;
const requireBaselineOnMain = process.env.PERF_REQUIRE_BASELINE_ON_MAIN === '1';

const branch = (process.env.GITHUB_REF_NAME || '').toLowerCase();
const isMain = /^(main|master)$/.test(branch);
const lastCommit = process.env.GIT_LAST_COMMIT_MESSAGE || '';
const hasTrailer = /\[(baseline|perf-baseline)\]/i.test(lastCommit);
const reason = process.env.ALLOW_REGRESSION_REASON;

if (!isMain) {
  console.error('[promote] Blocked: only main branch may promote baselines.');
  process.exit(1);
}
if (!hasTrailer) {
  console.error('[promote] Blocked: commit must include [baseline] or [perf-baseline] trailer.');
  process.exit(1);
}

const fs = require('fs');
const path = require('path');
const assertPerfBaselineShape = require('./lib/assertPerfBaselineShape.cjs');
const probeVideo = require('./lib/probeVideo.cjs');
const computePerfKey = require('./lib/computePerfKey.cjs');

const PERF_BASELINE_SCHEMA_VERSION = assertPerfBaselineShape.SCHEMA_VERSION;

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
if (DRY_RUN || DRY) {
  console.log('[promote] DRY RUN: No changes will be made');
}

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

// If dry-run, just list planned operations
if (DRY_RUN || DRY) {
  console.log('[promote] --dry-run: Listing planned file operations only; no changes written.');
  debugFiles.forEach(file => {
    const src = path.join(debugDir, file);
    const dest = path.join(framesDir, file.replace('actual_', ''));
    console.log(`  ${src} → ${dest}`);
  });
  process.exit(0);
}

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
      
      // Update perf baseline if perf reports exist
      updatePerfBaseline();
      
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
  
  // Update perf baseline if perf reports exist
  updatePerfBaseline();
  
  process.exit(0);
}

function updateBaseline(key, newMinFps, metadata) {
  const existing = baselineEntries.find(e => `${e.game}|${e.platform}` === key);
  if (existing) {
    if (newMinFps < existing.min_fps && !ALLOW_REGRESSION) {
      throw new Error(`Refusing to lower baseline for ${key} (${newMinFps.toFixed(2)} < ${existing.min_fps.toFixed(2)}). Use --allow-regression with a reason.`);
    }
    
    // If allowing regression, require a reason
    if (newMinFps < existing.min_fps && ALLOW_REGRESSION) {
      let reason = ALLOW_REGRESSION_REASON;
      
      // Check for commit trailer reason if not provided via env var
      if (!reason && process.env.GIT_COMMIT_TRAILERS) {
        const match = process.env.GIT_COMMIT_TRAILERS.match(/perf-regression-reason:\s*(.+)/i);
        if (match) {
          reason = match[1].trim();
        }
      }
      
      // If still no reason, check for body line
      if (!reason) {
        try {
          const msg = require('child_process').execSync('git log -1 --pretty=%B', { encoding: 'utf8' });
          const lines = msg.split('\n');
          for (const line of lines) {
            const match = line.match(/perf-regression-reason:\s*(.+)/i);
            if (match) {
              reason = match[1].trim();
              break;
            }
          }
        } catch (err) {
          // Ignore git command errors
        }
      }
      
      if (!reason) {
        throw new Error(`Refusing to lower baseline for ${key} without a reason. Provide ALLOW_REGRESSION_REASON or include "perf-regression-reason: ..." in commit message.`);
      }
      
      // Add reason to metadata
      metadata.regression_reason = reason;
    }
    
    existing.min_fps = Math.min(existing.min_fps, newMinFps);
    Object.assign(existing, metadata);
  } else {
    if (requireBaselineOnMain) {
      throw new Error(`Missing baseline for ${key} on main branch. All new games/platforms must have a baseline.`);
    }
    baselineEntries.push({ game: key.split('|')[0], platform: key.split('|')[1], min_fps: newMinFps, ...metadata });
  }
}

function updatePerfBaseline() {
  // Call the promotePerfBaselines function
  promotePerfBaselines();
}

function promotePerfBaselines() {
  const perfDir = path.join('reports', 'perf');
  const baselinePath = path.join('baselines', 'perf.json');
  let baselineEntries = [];
  let originalBaselineEntries = [];
  
  // Check if perf reports exist
  if (!fs.existsSync(perfDir)) {
    console.log('[promote] No perf reports found, skipping perf baseline update');
    return;
  }
  
  try {
    // Load and validate existing baseline
    if (fs.existsSync(baselinePath)) {
      const existingBaseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
      assertPerfBaselineShape(existingBaseline);
      baselineEntries = existingBaseline.entries;
      originalBaselineEntries = existingBaseline.entries;
    }
  } catch (err) {
    console.error('Error loading or validating perf baseline:', err.message);
    process.exit(1);
  }
  
  // Process each perf report
  const perfFiles = fs.readdirSync(perfDir).filter(f => f.endsWith('.json'));
  for (const f of perfFiles) {
    try {
      const reportPath = path.join(perfDir, f);
      const reports = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
      
      for (const report of reports) {
        // Use probeVideo to get standardized resolution/codec info
        const videoPath = path.join('media', report.game, 'video.mp4');
        let videoInfo = { resolution: 'unknown', codec: 'unknown' };
        try {
          if (fs.existsSync(videoPath)) {
            videoInfo = probeVideo(videoPath);
          }
        } catch (err) {
          console.warn(`Could not probe video for ${report.game}: ${err.message}`);
        }
        
        // Normalize keys
        const normalizedResolution = videoInfo.width && videoInfo.height ? 
          `${videoInfo.width}x${videoInfo.height}` : videoInfo.resolution;
        const normalizedCodec = (videoInfo.codec || 'unknown').toLowerCase();
        const normalizedMeasuredFps = Math.round(report.fps * 100) / 100; // Round to 2 decimal places
        
        // Compute perf key
        const perfKey = computePerfKey({
          game: report.game,
          platform: report.platform,
          resolution: normalizedResolution,
          codec: normalizedCodec
        });
        
        const key = `${report.game}|${report.platform}`;
        const newMinFps = normalizedMeasuredFps;
        
        const metadata = {
          resolution: normalizedResolution,
          codec: normalizedCodec,
          width: videoInfo.width,
          height: videoInfo.height,
          video_fps: videoInfo.fps,
          threads: process.env.FFMPEG_THREADS || 'unknown'
        };
        
        // Add hardware/context stamps
        try {
          const os = require('os');
          metadata.hardware = {
            cpu_model: os.cpus()[0]?.model || 'unknown',
            cpu_count: os.cpus().length,
            total_memory: os.totalmem(),
            platform: process.platform,
            arch: process.arch,
            ffmpeg_threads: process.env.FFMPEG_THREADS || 'default',
            github_runner: process.env.GITHUB_RUNNER_NAME || 'local'
          };
        } catch (err) {
          // Ignore hardware info if not available
        }
        
        updateBaseline(key, newMinFps, metadata);
      }
      
      console.log(`[promote] Updated perf baseline for ${f}`);
    } catch (err) {
      console.warn(`[promote] Warning: Could not process perf report ${f}: ${err.message}`);
    }
  }
  
  // At the end, validate the updated baseline before writing
  try {
    const newBaseline = { schema: 1, entries: baselineEntries };
    assertPerfBaselineShape(newBaseline);
    
    // Check if perf baselines were modified and require commit trailer
    if (JSON.stringify(baselineEntries) !== JSON.stringify(originalBaselineEntries || [])) {
      const hasPerfBaselineTrailer = process.env.GIT_COMMIT_TRAILERS && 
        process.env.GIT_COMMIT_TRAILERS.includes('[perf-baseline]');
      
      if (!hasPerfBaselineTrailer) {
        console.warn('Warning: Perf baseline was modified but no [perf-baseline] commit trailer found.');
        console.warn('Consider adding [perf-baseline] to your commit message.');
      }
    }
    
    fs.writeFileSync(baselinePath, JSON.stringify(newBaseline, null, 2));
    console.log('Perf baseline updated successfully.');
  } catch (err) {
    console.error('Error validating updated perf baseline:', err.message);
    process.exit(1);
  }
}
