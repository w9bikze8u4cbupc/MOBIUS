const { spawnSync } = require('child_process');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');

// Common helpers
function getPlatformSlug(osOverride) {
  const p = (osOverride || process.platform);
  if (p === 'win32') return 'windows';
  if (p === 'darwin') return 'macos';
  if (p === 'linux') return 'linux';
  return p.replace(/\W+/g, '_');
}

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

(async function main() {
  try {
    const opts = parseArgs();
    const input = opts.in || opts.input;
    const game = opts.game || 'game';
    const frames = (opts.frames || '5,10,20').split(',').map(s => parseFloat(s.trim()));
    const ssimThresh = parseFloat(opts.ssim || '0.995');
    const lufsTol = parseFloat(opts.lufs_tol || '1.0');
    const tpTol = parseFloat(opts.tp_tol || '1.0');
    const junitOut = opts.junit; // Optional JUnit output path

    if (!input || !fs.existsSync(input)) {
      console.error(`Input not found: ${input}`);
      process.exit(1);
    }

  // Resolve platform-specific golden directory
  const resolvedGoldenDir = resolveGoldenDir(game, opts);
  console.log(`Using golden directory: ${resolvedGoldenDir}`);

  if (!fs.existsSync(resolvedGoldenDir)) {
    console.error(`Golden dir not found: ${resolvedGoldenDir}`);
    process.exit(1);
  }

  // Clean up old debug images
  const debugDir = await cleanDebugDir(resolvedGoldenDir);

  const goldenContainer = loadJson(path.join(resolvedGoldenDir, 'container.json'));
  const goldenAudio = loadJson(path.join(resolvedGoldenDir, 'audio_stats.json'));
  const goldenFramesDir = path.join(resolvedGoldenDir, 'frames');

  const ffp = ffprobeJson(input);
  const tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'golden-check-'));
  const failures = [];
  const frameCases = []; // For JUnit reporting

  // Container checks
  const gv = (goldenContainer.video || {});
  const vv = (ffp.streams || []).find(s => s.codec_type === 'video');
  if (!vv) {
    failures.push({ name: 'container', message: 'No video stream found in input.' });
    frameCases.push({ name: 'container', status: 'failed', message: 'No video stream found in input.' });
  } else {
    const checks = [
      ['pix_fmt', gv.pix_fmt, vv.pix_fmt],
      ['avg_frame_rate', gv.avg_frame_rate, vv.avg_frame_rate],
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
      // Try to create a diff image for debugging
      const diffOut = path.join(debugDir, `diff_${String(t).replace('.', 'p')}s.png`);
      writeDiffImage(goldenPng, newPng, diffOut);
      
      const msg = `SSIM could not be computed for ${t}s. Diff image saved to ${diffOut}`;
      failures.push({ name: `frame_${t}s`, message: msg });
      frameCases.push({ name: `frame_${t}s`, status: 'failed', message: msg });
    } else if (ssim < ssimThresh) {
      // Create a diff image for debugging
      const diffOut = path.join(debugDir, `diff_${String(t).replace('.', 'p')}s.png`);
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
  } catch (error) {
    console.error('Unexpected error in golden check:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(3);
  }
})();