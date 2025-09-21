const { spawnSync } = require('child_process');
const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');

// Common helpers
function getPlatformSlug(osOverride) {
  // Prefer RUNNER_OS for absolute consistency with CI naming
  const fromEnv = (osOverride || process.env.RUNNER_OS || '').toLowerCase();
  if (fromEnv === 'windows') return 'windows';
  if (fromEnv === 'macos') return 'macos';
  if (fromEnv === 'linux') return 'linux';

  // Local fallback
  const p = osOverride || process.platform;
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

  return opts;
}

function sh(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...opts,
  });
  if (res.error) throw res.error;
  if (res.status !== 0) {
    const msg = `Command failed: ${cmd} ${args.join(' ')}\n${res.stderr || res.stdout}`;
    throw new Error(msg);
  }
  return res;
}

function ffprobeJson(input) {
  const res = sh('ffprobe', [
    '-v',
    'error',
    '-print_format',
    'json',
    '-show_streams',
    '-show_format',
    input,
  ]);
  return JSON.parse(res.stdout.trim());
}

function selectVideoProps(ffp) {
  const v = (ffp.streams || []).find((s) => s.codec_type === 'video');
  if (!v) return {};
  return {
    codec_name: v.codec_name,
    width: v.width,
    height: v.height,
    pix_fmt: v.pix_fmt,
    avg_frame_rate: v.avg_frame_rate, // keep as string "30/1"
    sample_aspect_ratio: v.sample_aspect_ratio || '1:1',
    display_aspect_ratio: v.display_aspect_ratio || null,
  };
}

function hasAudio(ffp) {
  return (ffp.streams || []).some((s) => s.codec_type === 'audio');
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
  const res = spawnSync(
    'ffmpeg',
    [
      '-hide_banner',
      '-nostats',
      '-i',
      input,
      '-filter_complex',
      'ebur128=peak=true',
      '-f',
      'null',
      '-',
    ],
    { encoding: 'utf8' },
  );

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
  try {
    return JSON.parse(await fsp.readFile(p, 'utf8'));
  } catch {
    return {};
  }
}

// Include FFmpeg/FFprobe versions for drift tracking
function safeVersion(cmd) {
  try {
    const res = spawnSync(cmd, ['-version'], { encoding: 'utf8' });
    if (res.error) return 'unknown';
    return res.stdout.split('\n')[0].trim();
  } catch {
    return 'unknown';
  }
}

// Get additional environment metadata
function getEnvironmentMetadata() {
  const metadata = {};

  // Node.js version
  try {
    metadata.node = process.version;
  } catch (e) {
    metadata.node = 'unknown';
  }

  // npm version
  try {
    const npmRes = spawnSync('npm', ['-v'], { encoding: 'utf8' });
    if (!npmRes.error && npmRes.stdout) {
      metadata.npm = npmRes.stdout.trim();
    } else {
      metadata.npm = 'unknown';
    }
  } catch (e) {
    metadata.npm = 'unknown';
  }

  // Git info if available
  try {
    const gitBranchRes = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      encoding: 'utf8',
    });
    if (!gitBranchRes.error && gitBranchRes.stdout) {
      metadata.gitBranch = gitBranchRes.stdout.trim();
    }

    const gitCommitRes = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' });
    if (!gitCommitRes.error && gitCommitRes.stdout) {
      metadata.gitCommit = gitCommitRes.stdout.trim();
    }
  } catch (e) {
    // Git info is optional
  }

  // OS info
  metadata.os = {
    platform: process.platform,
    arch: process.arch,
    release: require('os').release(),
  };

  return metadata;
}

// Detect runner OS
function detectRunnerOs() {
  if (process.env.RUNNER_OS) return process.env.RUNNER_OS;
  const p = process.platform;
  if (p === 'win32') return 'Windows';
  if (p === 'darwin') return 'macOS';
  return 'Linux';
}

// Get version with regex
function version(cmd, args, re) {
  try {
    const r = spawnSync(cmd, args, { encoding: 'utf8' });
    if (r.status === 0) {
      const m = (r.stdout || '').match(re);
      return m ? m[1] : 'unknown';
    }
  } catch {}
  return 'unknown';
}

// Build container.json with the structure expected by the validator
function buildContainerJson() {
  const RUNNER_OS = detectRunnerOs();
  return {
    tools: {
      ffmpeg: { version: version('ffmpeg', ['-version'], /ffmpeg version (\S+)/) },
      ffprobe: { version: version('ffprobe', ['-version'], /ffprobe version (\S+)/) },
    },
    env: {
      node: { version: (process.version || '').replace(/^v/, '') || 'unknown' },
      npm: { version: version('npm', ['-v'], /(\d+\.\d+\.\d+)/) },
      git: {
        version: version('git', ['--version'], /git version (\S+)/),
        branch: version('git', ['rev-parse', '--abbrev-ref', 'HEAD'], /(.*)/),
        commit: version('git', ['rev-parse', 'HEAD'], /(.*)/),
      },
      os: {
        name: RUNNER_OS,
        platform: os.platform(),
        release: os.release(),
        arch: os.arch(),
      },
    },
  };
}

// Write container.json to the correct location
function writeContainerJson(
  gameSlug,
  container,
  goldenRoot = process.env.GOLDEN_ROOT || path.join('tests', 'golden'),
) {
  const RUNNER_OS = detectRunnerOs();
  const slug = RUNNER_OS === 'Windows' ? 'windows' : RUNNER_OS === 'macOS' ? 'macos' : 'linux';
  const dir = path.join(goldenRoot, gameSlug, slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'container.json'), JSON.stringify(container, null, 2));
}

(async function main() {
  const opts = parseArgs();
  const game = opts.game || 'game';
  const input = opts.in || opts.input;
  const outDir = opts.out || resolveGoldenDir(game, { perOs: opts.perOs });
  const framesArg = (opts.frames || '5,10,20')
    .split(',')
    .map((s) => parseFloat(s.trim()))
    .filter((n) => !Number.isNaN(n));

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

  // Get environment metadata
  const envMetadata = getEnvironmentMetadata();

  // Add CI environment metadata
  const ciMeta = {
    ci: !!process.env.CI,
    runner_os: process.env.RUNNER_OS || null, // "Linux" | "Windows" | "macOS" in GHA
    github_sha: process.env.GITHUB_SHA || null,
    github_ref: process.env.GITHUB_REF || null,
    github_run_id: process.env.GITHUB_RUN_ID || null,
    github_run_number: process.env.GITHUB_RUN_NUMBER || null,
    github_run_attempt: process.env.GITHUB_RUN_ATTEMPT || null,
  };

  const container = {
    game,
    input: path.relative(process.cwd(), input),
    video: vprops,
    format: ffp.format || {},
    tools: {
      ffmpeg: safeVersion('ffmpeg'),
      ffprobe: safeVersion('ffprobe'),
    },
    environment: envMetadata,
    ci: ciMeta,
    generated_at: new Date().toISOString(),
  };

  const containerPath = path.join(resolvedOutDir, 'container.json');
  await saveJson(containerPath, container);

  // Also write the validator-compliant container.json
  const validatorContainer = buildContainerJson();
  writeContainerJson(game, validatorContainer);

  for (const t of framesArg) {
    const outPng = path.join(resolvedOutDir, 'frames', `frame_${String(t).replace('.', 'p')}s.png`);
    extractFrame(input, outPng, t, true); // Use accurate seeking
  }

  if (hasAudio(ffp)) {
    const audioStats = measureAudioEbur128(input);
    await saveJson(path.join(resolvedOutDir, 'audio_stats.json'), {
      game,
      ...audioStats,
      generated_at: new Date().toISOString(),
    });
  } else {
    // Create a marker that there's no audio
    await saveJson(path.join(resolvedOutDir, 'audio_stats.json'), {
      game,
      note: 'No audio stream present in preview',
      generated_at: new Date().toISOString(),
    });
  }

  console.log(`Golden artifacts written to: ${resolvedOutDir}`);
})();
