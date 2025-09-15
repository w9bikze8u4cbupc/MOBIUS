const { spawnSync } = require('child_process');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');

// Common helpers
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

// Helper for consistent path display in logs
const forLog = (p) => p.replace(/\\/g, '/'); // keep file ops with path.*, only prettify logs


function resolveGoldenDir(game, { perOs = false, os } = {}) {
  const base = path.join('tests', 'golden', game);
  return perOs ? path.join(base, getPlatformSlug(os)) : base;
}

async function ensureDir(p) {
  await fsp.mkdir(p, { recursive: true });
}

async function cleanDebugDir(goldenDir) {
  const debugDir = path.join(goldenDir, 'debug');
  await fsp.rm(debugDir, { recursive: true, force: true }).catch(() => {});
  await ensureDir(debugDir);
  return debugDir;
}

function getArgValue(name) {
  // Check for --name=value format
  const eq = process.argv.find(a => a.startsWith(`${name}=`));
  if (eq) return eq.split('=').slice(1).join('=');
  
  // Check for --name value format
  const idx = process.argv.indexOf(name);
  if (idx >= 0 && process.argv[idx + 1] && !process.argv[idx + 1].startsWith('--')) {
    return process.argv[idx + 1];
  }
  
  return undefined;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {};
  
  // Parse key-value pairs
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      // Check if next argument is a value (not another flag)
      if (i + 1 < args.length && !args[i + 1].startsWith('--')) {
        opts[key] = args[i + 1];
        i++; // Skip next argument as it's the value
      } else {
        // Treat as boolean flag
        opts[key] = true;
      }
    }
  }
  
  // Handle special cases
  if (process.env.GOLDEN_PER_OS === '1' || opts.perOs === true) {
    opts.perOs = true;
  }
  
  // Get junit path using improved parsing
  opts.junit = getArgValue('--junit');
  
  return opts;
}

function shOk(cmd, args) {
  const res = spawnSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (res.error) throw res.error;
  return res;
}

function sh(cmd, args) {
  const res = shOk(cmd, args);
  if (res.status !== 0) {
    throw new Error(`Command failed: ${cmd} ${args.join(' ')}\n${res.stderr || res.stdout}`);
  }
  return res;
}

function ffprobeJson(input) {
  const res = sh('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', input]);
  return JSON.parse(res.stdout.trim());
}

function hasAudio(ffp) {
  return (ffp.streams || []).some(s => s.codec_type === 'audio');
}

function extractTempFrame(input, timeSec, tmpDir, accurate = true) {
  const outPng = path.join(tmpDir, `tmp_${String(timeSec).replace('.', 'p')}s.png`);
  // accurate=true places -ss after -i for exact seek (slower, deterministic)
  const args = ['-hide_banner', '-loglevel', 'error'];
  if (accurate) {
    args.push('-i', input, '-ss', String(timeSec));
  } else {
    args.push('-ss', String(timeSec), '-i', input);
  }
  args.push('-frames:v', '1', '-y', outPng);
  const res = shOk('ffmpeg', args);
  if (res.status !== 0 || !fs.existsSync(outPng)) {
    throw new Error(`Failed to extract frame at ${timeSec}s: ${res.stderr || res.stdout}`);
  }
  return outPng;
}

function measureSSIM(currentFrame, goldenFrame) {
  // Run SSIM with scale2ref to auto-align resolution
  // Treat the baseline as "ref" and scale the current frame to it
  const args = [
    '-loglevel', 'info',
    '-i', currentFrame,
    '-i', goldenFrame,
    '-lavfi', '[0:v][1:v]scale2ref=flags=bicubic[scaled][ref];[scaled][ref]ssim=stats_file=-',
    '-f', 'null', '-'
  ];
  const res = shOk('ffmpeg', args);
  const text = (res.stderr || '') + (res.stdout || '');
  // Handle different SSIM output formats
  const m = text.match(/\[Parsed_ssim_[^\]]+\]\s*SSIM.*All:([0-9.]+)/i) || text.match(/All:([0-9.]+)/i);
  return m ? parseFloat(m[1]) : NaN;
}

function writeDiffImage(currentFrame, goldenFrame, outPng) {
  const args = [
    '-loglevel', 'error',
    '-i', currentFrame,
    '-i', goldenFrame,
    '-lavfi', '[0:v][1:v]scale2ref=flags=bicubic[scaled][ref];[scaled][ref]blend=all_mode=difference,format=rgb24',
    '-frames:v', '1',
    '-y', outPng
  ];
  try {
    spawnSync('ffmpeg', args, { stdio: 'inherit' });
  } catch (err) {
    console.error(`Failed to write diff image: ${err.message}`);
  }
}

function parseEbur128(stderrText) {
  const out = {};
  const il = stderrText.match(/Integrated loudness:\s*([-\d.]+)\s*LUFS/i);
  const lra = stderrText.match(/Loudness range:\s*([-\d.]+)\s*LU/i);
  const tp = stderrText.match(/True peak:\s*([-\d.]+)\s*dBTP/i);
  if (il) out.integrated_lufs = parseFloat(il[1]);
  if (lra) out.loudness_range_lu = parseFloat(lra[1]);
  if (tp) out.true_peak_db = parseFloat(tp[1]);
  return out;
}

function measureAudioEbur128(input) {
  const res = spawnSync('ffmpeg', [
    '-hide_banner',
    '-nostats',
    '-i', input,
    '-filter_complex', 'ebur128=peak=true',
    '-f', 'null', '-'
  ], { encoding: 'utf8' });

  if (res.error || res.status !== 0) {
    return {};
  }
  return parseEbur128((res.stderr || '') + (res.stdout || ''));
}

function loadJson(p) {
  if (!fs.existsSync(p)) throw new Error(`Missing expected file: ${p}`);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function relErr(a, b) {
  return Math.abs(a - b);
}

// JUnit writer
async function writeJUnitReport(results, junitPath) {
  if (!junitPath) return;
  await ensureDir(path.dirname(junitPath));

  // results: { suiteName, cases: [{name, status: 'passed'|'failed', message?}] }
  const tests = results.cases.length;
  const failures = results.cases.filter(c => c.status === 'failed').length;

  const casesXml = results.cases.map(c => {
    if (c.status === 'failed') {
      return `<testcase name="${escapeXml(c.name)}"><failure message="${escapeXml(c.message || 'Failed')}"/></testcase>`;
    }
    return `<testcase name="${escapeXml(c.name)}"/>`;
  }).join('');

  const xml =
`<?xml version="1.0" encoding="UTF-8"?>
<testsuites>
  <testsuite name="${escapeXml(results.suiteName)}" tests="${tests}" failures="${failures}">
    ${casesXml}
  </testsuite>
</testsuites>`;

  await fsp.writeFile(junitPath, xml, 'utf8');
}

function escapeXml(s) {
  return String(s).replace(/&/g, '&amp;')
                  .replace(/</g, '&lt;')
                  .replace(/>/g, '&gt;')
                  .replace(/"/g, '&quot;')
                  .replace(/'/g, '&apos;');
}

// Normalize frame rate for comparison with epsilon
function normalizeFrameRate(rate) {
  if (!rate) return rate;
  
  // Handle "30/1" format
  if (String(rate).includes('/')) {
    const [num, den] = String(rate).split('/').map(Number);
    if (!isNaN(num) && !isNaN(den) && den !== 0) {
      // Check if this is approximately 30 (like 30000/1001)
      const value = num / den;
      if (Math.abs(value - 30) < 0.01) {
        return "30";
      }
      // For 1/1, return "1"
      if (Math.abs(value - 1) < 0.01) {
        return "1";
      }
      return String(value); // Return as decimal
    }
  }
  
  return String(rate);
}

// FPS equality helper with epsilon
function fpsEq(a, b, eps = 1e-3) { 
  return Math.abs(a - b) < eps; 
}

async function main() {
  console.log('Starting golden check...');
  const opts = parseArgs();
  // Use environment variables or command line arguments
  const input = opts.in || opts.input || process.env.INPUT_FILE || `dist/${process.env.GAME || 'game'}/${getPlatformSlug()}/tutorial.mp4`;
  const game = opts.game || process.env.GAME || 'game';
  const frames = (opts.frames || '5,10,20').split(',').map(s => parseFloat(s.trim()));
  // Use SSIM_MIN environment variable or default to 0.95 (from unified spec)
  const ssimThresh = parseFloat(process.env.SSIM_MIN || opts.ssim || '0.95');
  const lufsTol = parseFloat(opts.lufs_tol || '1.0');
  const tpTol = parseFloat(opts.tp_tol || '1.0');
  const junitOut = opts.junit; // Optional JUnit output path

  // Validate SSIM_MIN input shape
  const ssimEnv = process.env.SSIM_MIN;
  if (ssimEnv && !/^\d+(\.\d+)?$/.test(ssimEnv)) {
    throw new Error(`Invalid SSIM_MIN=${ssimEnv}. Use numeric like 0.95`);
  }

  console.log('Input:', input);
  console.log('Game:', game);
  console.log('SSIM Threshold:', ssimThresh);

  if (!input || !fs.existsSync(input)) {
    console.error(`Input not found: ${input}`);
    process.exit(1);
  }

  // Enforce SSIM_MIN in CI (prevents accidental lowering)
  const min = Number(process.env.SSIM_MIN || '0.95');
  if (process.env.CI && min < 0.95) {
    throw new Error(`SSIM_MIN=${min} is below required CI threshold of 0.95`);
  }

  // Auto-detect --perOs if OS subdir exists
  const baseGoldenDir = path.join('tests', 'golden', game);
  const platformSlug = getPlatformSlug();
  const platformGoldenDir = path.join(baseGoldenDir, platformSlug);
  const autoPerOs = fs.existsSync(platformGoldenDir);
  
  // Use auto-detected perOs setting unless explicitly overridden
  const usePerOs = opts.perOs !== undefined ? opts.perOs : autoPerOs;
  
  // Resolve platform-specific golden directory
  const resolvedGoldenDir = resolveGoldenDir(game, { perOs: usePerOs });

  // Log resolved paths
  console.log(`[golden-check] GAME=${game} PLATFORM=${platformSlug} perOs=${usePerOs} goldenDir=${forLog(resolvedGoldenDir)} framesDir=${forLog(path.join(resolvedGoldenDir, 'frames'))}`);

  // Baseline presence guard - fail with clear message if baseline directory is missing
  if (!fs.existsSync(resolvedGoldenDir)) {
    console.error(`Golden baseline directory not found: ${resolvedGoldenDir}`);
    console.error(`Baseline missing: run node scripts/generate_golden.js --game "${game}" --perOs and commit tests/golden/${game}/**`);
    process.exit(1);
  }

  // Define the golden frames directory
  const goldenFramesDir = path.join(resolvedGoldenDir, 'frames');

  // Golden presence guard (prevents silent pass with missing frames)
  const countFrames = (dir) => fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => /\.(png|jpe?g)$/i.test(f)).length : 0;
  const nGolden = countFrames(goldenFramesDir);
  if (nGolden === 0) {
    throw new Error(`[golden-check] No golden frames found at ${forLog(goldenFramesDir)}. If this is a new platform, run the safe promotion script to seed baselines.`);
  }

  // Clean up old debug images
  const debugDir = await cleanDebugDir(resolvedGoldenDir);
  
  const goldenContainer = loadJson(path.join(resolvedGoldenDir, 'container.json'));
  
  // Validate container.json structure
  if (!goldenContainer.media) {
    throw new Error(`Missing 'media' section in container.json. Please ensure container.json includes media metadata.`);
  }
  
  if (!goldenContainer.media.video || !Array.isArray(goldenContainer.media.video) || goldenContainer.media.video.length === 0) {
    throw new Error(`Missing or empty 'media.video' array in container.json. Please ensure container.json includes video metadata.`);
  }
  
  const goldenAudio = loadJson(path.join(resolvedGoldenDir, 'audio_stats.json'));
  const ffp = ffprobeJson(input);
  const tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'golden-check-'));
  const failures = [];
  const frameCases = []; // For JUnit reporting

  // Check if frames directory exists
  if (!fs.existsSync(goldenFramesDir)) {
    throw new Error(`Missing frames directory: ${goldenFramesDir}. Please ensure frames are extracted before running golden check.`);
  }

  const gv = (goldenContainer.media && goldenContainer.media.video && goldenContainer.media.video[0]) || {};
  const vv = (ffp.streams || []).find(s => s.codec_type === 'video');
  if (!vv) {
    failures.push({ name: 'container', message: 'No video stream found in input.' });
    frameCases.push({ name: 'container', status: 'failed', message: 'No video stream found in input.' });
  } else {
    // Normalize frame rates before comparison
    const expectedFps = normalizeFrameRate(gv.fps !== undefined ? gv.fps.toString() : undefined);
    const actualFps = normalizeFrameRate(vv.avg_frame_rate);
    
    const checks = [
      ['pix_fmt', gv.pix_fmt, vv.pix_fmt],
      ['avg_frame_rate', expectedFps, actualFps],
      ['sample_aspect_ratio', gv.sample_aspect_ratio || '1:1', vv.sample_aspect_ratio || '1:1']
    ];
    for (const [label, expected, got] of checks) {
      if (String(expected) !== String(got)) {
        const msg = `Container mismatch: ${label} expected=${expected}, got=${got}`;
        failures.push({ name: `container_${label}`, message: msg });
        frameCases.push({ name: `container_${label}`, status: 'failed', message: msg });
      } else {
        frameCases.push({ name: `container_${label}`, status: 'passed' });
      }
    }
  }

  // Frame SSIM checks
  for (const t of frames) {
    const goldenPng = path.join(goldenFramesDir, `frame_${String(t).replace('.', 'p')}s.png`);
    if (!fs.existsSync(goldenPng)) {
      const msg = `Missing golden frame: ${goldenPng}`;
      failures.push({ name: `frame_${t}s`, message: msg });
      frameCases.push({ name: `frame_${t}s`, status: 'failed', message: msg });
      continue;
    }
    const newPng = extractTempFrame(input, t, tmpDir, true); // Use accurate seeking
    const ssim = measureSSIM(newPng, goldenPng);
    if (!Number.isFinite(ssim)) {
      // Try to create a diff image for debugging with improved naming
      const diffOut = path.join(debugDir, `${game}_${getPlatformSlug()}_${String(t).replace('.', 'p')}s_diff.png`);
      writeDiffImage(goldenPng, newPng, diffOut);
      
      const msg = `SSIM could not be computed for ${t}s. Diff image saved to ${diffOut}`;
      failures.push({ name: `frame_${t}s`, message: msg });
      frameCases.push({ name: `frame_${t}s`, status: 'failed', message: msg });
    } else if (ssim < ssimThresh) {
      // Create a diff image for debugging with improved naming
      const diffOut = path.join(debugDir, `${game}_${getPlatformSlug()}_${String(t).replace('.', 'p')}s_diff.png`);
      writeDiffImage(goldenPng, newPng, diffOut);
      
      const msg = `Frame at ${t}s SSIM ${ssim.toFixed(6)} < threshold ${ssimThresh}. Diff image saved to ${diffOut}`;
      failures.push({ name: `frame_${t}s`, message: msg });
      frameCases.push({ name: `frame_${t}s`, status: 'failed', message: msg });
    } else {
      frameCases.push({ name: `frame_${t}s`, status: 'passed' });
    }
  }

  // Audio checks (skip if no audio in preview or golden indicates none)
  const inputHasAudio = hasAudio(ffp);
  const goldenHasAudio = goldenAudio && goldenAudio.integrated_lufs !== undefined;
  if (goldenHasAudio && inputHasAudio) {
    const nowAudio = measureAudioEbur128(input);
    if (nowAudio.integrated_lufs === undefined) {
      const msg = 'Could not measure current audio loudness.';
      failures.push({ name: 'audio_loudness', message: msg });
      frameCases.push({ name: 'audio_loudness', status: 'failed', message: msg });
    } else {
      if (relErr(nowAudio.integrated_lufs, goldenAudio.integrated_lufs) > lufsTol) {
        const msg = `Integrated LUFS mismatch: expected ~${goldenAudio.integrated_lufs}, got ${nowAudio.integrated_lufs} (tol ±${lufsTol})`;
        failures.push({ name: 'audio_lufs', message: msg });
        frameCases.push({ name: 'audio_lufs', status: 'failed', message: msg });
      } else {
        frameCases.push({ name: 'audio_lufs', status: 'passed' });
      }
      if (Number.isFinite(goldenAudio.true_peak_db) && Number.isFinite(nowAudio.true_peak_db)) {
        if (relErr(nowAudio.true_peak_db, goldenAudio.true_peak_db) > tpTol) {
          const msg = `True peak mismatch: expected ~${goldenAudio.true_peak_db} dBTP, got ${nowAudio.true_peak_db} dBTP (tol ±${tpTol})`;
          failures.push({ name: 'audio_peak', message: msg });
          frameCases.push({ name: 'audio_peak', status: 'failed', message: msg });
        } else {
          frameCases.push({ name: 'audio_peak', status: 'passed' });
        }
      }
    }
  } else {
    // If the golden has no audio, allow current to have none as well; if input now has audio and golden didn't, you may optionally warn.
    console.log('Audio: no audio stream detected – skipping loudness checks');
  }

  // Write JUnit report
  const suiteName = `golden:${game}${opts.perOs ? `:${getPlatformSlug()}` : ''}`;
  await writeJUnitReport({
    suiteName,
    cases: frameCases
  }, junitOut);

  if (failures.length) {
    console.error('Golden check FAILED:\n- ' + failures.map(f => f.message || f).join('\n- '));
    process.exit(2);
  } else {
    console.log('Golden check PASSED.');
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
