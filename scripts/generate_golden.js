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
  const base = path.join('tests', 'golden', game.toLowerCase().replace(/\s+/g, '-'));
  return perOs ? path.join(base, getPlatformSlug(os)) : base;
}

async function ensureDir(p) {
  await fsp.mkdir(p, { recursive: true });
}

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {};
  for (let i = 0; i < args.length; i += 2) {
    const k = args[i].replace(/^--/, '');
    const v = args[i + 1];
    opts[k] = v;
  }
  // Handle boolean flags
  if (process.env.GOLDEN_PER_OS === '1' || opts.perOs === '' || opts.perOs === 'true') {
    opts.perOs = true;
  }
  return opts;
}

function sh(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts });
  if (res.error) throw res.error;
  if (res.status !== 0) {
    const msg = `Command failed: ${cmd} ${args.join(' ')}\n${res.stderr || res.stdout}`;
    throw new Error(msg);
  }
  return res;
}

function ffprobeJson(input) {
  const res = sh('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', input]);
  return JSON.parse(res.stdout.trim());
}

function selectVideoProps(ffp) {
  const v = (ffp.streams || []).find(s => s.codec_type === 'video');
  if (!v) return {};
  return {
    codec_name: v.codec_name,
    width: v.width,
    height: v.height,
    pix_fmt: v.pix_fmt,
    avg_frame_rate: v.avg_frame_rate,        // keep as string "30/1"
    sample_aspect_ratio: v.sample_aspect_ratio || '1:1',
    display_aspect_ratio: v.display_aspect_ratio || null,
  };
}

function hasAudio(ffp) {
  return (ffp.streams || []).some(s => s.codec_type === 'audio');
}

function extractFrame(input, outPng, timeSec, accurate = true) {
  // accurate=true places -ss after -i for exact seek (slower, deterministic)
  const args = ['-hide_banner', '-loglevel', 'error'];
  if (accurate) {
    args.push('-i', input, '-ss', String(timeSec));
  } else {
    args.push('-ss', String(timeSec), '-i', input);
  }
  args.push('-frames:v', '1', '-y', outPng);
  
  const res = spawnSync('ffmpeg', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (res.error) throw res.error;
  if (res.status !== 0) {
    const msg = `Command failed: ffmpeg ${args.join(' ')}\n${res.stderr || res.stdout}`;
    throw new Error(msg);
  }
  if (!fs.existsSync(outPng)) {
    throw new Error(`Failed to extract frame at ${timeSec}s: output file not created`);
  }
}

function parseEbur128(stderrText) {
  // Typical lines:
  // [Parsed_ebur128_0] Integrated loudness: -23.0 LUFS
  // [Parsed_ebur128_0] Loudness range: 10.5 LU
  // [Parsed_ebur128_0] True peak: -1.2 dBTP
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
    // If ffmpeg fails (e.g., no audio), just return empty
    return {};
  }
  return parseEbur128((res.stderr || '') + (res.stdout || ''));
}

async function saveJson(file, data) {
  await fsp.writeFile(file, JSON.stringify(data, null, 2));
}

// Utility to read safely
async function readExistingJson(p) {
  try { return JSON.parse(await fsp.readFile(p, 'utf8')); } catch { return {}; }
}

// Include FFmpeg/FFprobe versions for drift tracking
function safeVersion(cmd) {
  try { return spawnSync(cmd, ['-version'], { encoding: 'utf8' }).stdout.split('\n')[0].trim(); }
  catch { return 'unknown'; }
}

(async function main() {
  try {
    const opts = parseArgs();
    const game = opts.game || 'game';
    const input = opts.in;
    const outDir = opts.out || resolveGoldenDir(game, opts);
    const framesArg = (opts.frames || '5,10,20').split(',').map(s => parseFloat(s.trim())).filter(n => !Number.isNaN(n));

    if (!input || !fs.existsSync(input)) {
      console.error(`Input not found: ${input}`);
      process.exit(1);
    }

  // Use platform-specific directory if requested
  const resolvedOutDir = outDir;
  
  await ensureDir(resolvedOutDir);
  await ensureDir(path.join(resolvedOutDir, 'frames'));

  const ffp = ffprobeJson(input);
  const vprops = selectVideoProps(ffp);
  const container = {
    game,
    input: path.relative(process.cwd(), input),
    video: vprops,
    format: ffp.format || {},
    tools: {
      ffmpeg: safeVersion('ffmpeg'),
      ffprobe: safeVersion('ffprobe')
    },
    generated_at: new Date().toISOString()
  };
  await saveJson(path.join(resolvedOutDir, 'container.json'), container);

  for (const t of framesArg) {
    const outPng = path.join(resolvedOutDir, 'frames', `frame_${String(t).replace('.', 'p')}s.png`);
    extractFrame(input, outPng, t, true); // Use accurate seeking
  }

  if (hasAudio(ffp)) {
    const audioStats = measureAudioEbur128(input);
    await saveJson(path.join(resolvedOutDir, 'audio_stats.json'), {
      game,
      ...audioStats,
      generated_at: new Date().toISOString()
    });
  } else {
    // Create a marker that there's no audio
    await saveJson(path.join(resolvedOutDir, 'audio_stats.json'), {
      game,
      note: 'No audio stream present in preview',
      generated_at: new Date().toISOString()
    });
  }

  console.log(`Golden artifacts written to: ${resolvedOutDir}`);
  } catch (error) {
    console.error('Unexpected error generating golden artifacts:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
})();