#!/usr/bin/env node

/**
 * run-real-input-preview.mjs — Offline CLI for running a real-input fixture
 * through the full tutorial preview pipeline.
 *
 * Modes:
 *   Registered fixture:
 *     node scripts/run-real-input-preview.mjs --fixture <slug> --out <output-dir>
 *
 *   Ad-hoc local source:
 *     node scripts/run-real-input-preview.mjs --metadata <path> --rulebook-extract <path> --expected <path> --out <output-dir>
 *
 * Pipeline:
 *   source validation → normalize → generate → render → ffprobe → validate → coverage report
 *
 * Exit codes:
 *   0 = success (all steps pass)
 *   1 = pipeline or validation failure
 *   2 = invalid arguments or missing fixture/files
 */

import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { resolve, join, dirname, basename, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const require = createRequire(import.meta.url);
const { loadRegistry, findFixtureBySlug, resolveFixturePaths, validateFixtureFiles } = require('../tests/helpers/realInputFixtureRegistry.cjs');
const { validateRealInputArtifact } = require('./validate-real-input-preview-artifact.cjs');
const { validateSourceContract } = require('./validate-real-input-source-contract.cjs');
const { createReport, buildFixtureEntry, writeReport } = require('../tests/helpers/realInputSmokeCoverageReport.cjs');

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);

function getArg(name) {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1 || idx + 1 >= args.length) return null;
  return args[idx + 1];
}

const fixtureSlug = getArg('fixture');
const metadataPath = getArg('metadata');
const rulebookExtractPath = getArg('rulebook-extract');
const expectedPath = getArg('expected');
const outDir = getArg('out');

// ---------------------------------------------------------------------------
// Mode detection and validation
// ---------------------------------------------------------------------------
const isRegisteredMode = !!fixtureSlug;
const isAdHocMode = !!(metadataPath || rulebookExtractPath || expectedPath);

if (isRegisteredMode && isAdHocMode) {
  console.error('[preview-cli] ERROR: Cannot mix --fixture with --metadata/--rulebook-extract/--expected.');
  console.error('[preview-cli] Use either registered mode (--fixture) or ad-hoc mode (--metadata + --rulebook-extract + --expected).');
  process.exit(2);
}

if (!isRegisteredMode && !isAdHocMode) {
  console.error('Usage:');
  console.error('');
  console.error('  Registered fixture mode:');
  console.error('    node scripts/run-real-input-preview.mjs --fixture <slug> --out <output-dir>');
  console.error('');
  console.error('  Ad-hoc local source mode:');
  console.error('    node scripts/run-real-input-preview.mjs --metadata <path> --rulebook-extract <path> --expected <path> --out <output-dir>');
  console.error('');
  console.error('Options:');
  console.error('  --fixture          Slug of a registered real-input fixture (e.g., sakura-market)');
  console.error('  --metadata         Path to metadata JSON (ad-hoc mode)');
  console.error('  --rulebook-extract Path to rulebook-extract JSON (ad-hoc mode)');
  console.error('  --expected         Path to expected contract JSON (ad-hoc mode)');
  console.error('  --out              Output directory for preview artifacts');
  process.exit(2);
}

if (!outDir) {
  console.error('[preview-cli] ERROR: --out <output-dir> is required.');
  process.exit(2);
}

if (isAdHocMode) {
  if (!metadataPath) {
    console.error('[preview-cli] ERROR: --metadata is required in ad-hoc mode.');
    process.exit(2);
  }
  if (!rulebookExtractPath) {
    console.error('[preview-cli] ERROR: --rulebook-extract is required in ad-hoc mode.');
    process.exit(2);
  }
  if (!expectedPath) {
    console.error('[preview-cli] ERROR: --expected is required in ad-hoc mode.');
    process.exit(2);
  }
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------
const PROJECT_ROOT = resolve(__dirname, '..');
const REGISTRY_DIR = resolve(PROJECT_ROOT, 'tests/fixtures/tutorial-real-input');
const REGISTRY_PATH = join(REGISTRY_DIR, 'fixtures.json');
const NORMALIZER_SCRIPT = resolve(PROJECT_ROOT, 'scripts/normalize-real-input-fixture.cjs');
const GENERATE_SCRIPT = resolve(PROJECT_ROOT, 'scripts/generate-tutorial-preview.mjs');
const RENDER_SCRIPT = resolve(PROJECT_ROOT, 'scripts/render-storyboard-ffmpeg.mjs');

const resolvedOut = resolve(outDir);

// ---------------------------------------------------------------------------
// Resolve source paths based on mode
// ---------------------------------------------------------------------------
let sourcePaths; // { metadata, extract, expected }
let slug;
let gameName;
let profile;
let sourceMode;
let registryEntry; // for identity checks (null in ad-hoc mode)
let metadataFile;
let rulebookExtractFile;
let expectedFile;

if (isRegisteredMode) {
  sourceMode = 'registered';

  console.log(`[preview-cli] Mode: registered fixture`);
  console.log(`[preview-cli] Loading registry: ${REGISTRY_PATH}`);
  let registry;
  try {
    registry = loadRegistry(REGISTRY_PATH);
  } catch (err) {
    console.error(`[preview-cli] Failed to load registry: ${err.message}`);
    process.exit(2);
  }

  const fixture = findFixtureBySlug(registry, fixtureSlug);
  if (!fixture) {
    console.error(`[preview-cli] Unknown fixture slug: "${fixtureSlug}"`);
    console.error(`[preview-cli] Available slugs: ${registry.fixtures.map((f) => f.slug).join(', ')}`);
    process.exit(2);
  }

  if (!fixture.enabled) {
    console.error(`[preview-cli] Fixture "${fixtureSlug}" is disabled in the registry.`);
    process.exit(2);
  }

  const fileCheck = validateFixtureFiles(fixture, REGISTRY_DIR);
  if (!fileCheck.valid) {
    console.error(`[preview-cli] Missing fixture files: ${fileCheck.missing.join(', ')}`);
    process.exit(2);
  }

  sourcePaths = resolveFixturePaths(fixture, REGISTRY_DIR);
  slug = fixture.slug;
  gameName = fixture.gameName;
  profile = fixture.profile;
  registryEntry = fixture;
  metadataFile = fixture.metadataFile;
  rulebookExtractFile = fixture.rulebookExtractFile;
  expectedFile = fixture.expectedFile;
} else {
  sourceMode = 'ad-hoc';

  console.log(`[preview-cli] Mode: ad-hoc local source`);

  const resolvedMetadata = resolve(metadataPath);
  const resolvedExtract = resolve(rulebookExtractPath);
  const resolvedExpected = resolve(expectedPath);

  // Verify files exist
  if (!existsSync(resolvedMetadata)) {
    console.error(`[preview-cli] Metadata file not found: ${resolvedMetadata}`);
    process.exit(2);
  }
  if (!existsSync(resolvedExtract)) {
    console.error(`[preview-cli] Rulebook-extract file not found: ${resolvedExtract}`);
    process.exit(2);
  }
  if (!existsSync(resolvedExpected)) {
    console.error(`[preview-cli] Expected contract file not found: ${resolvedExpected}`);
    process.exit(2);
  }

  sourcePaths = { metadata: resolvedMetadata, extract: resolvedExtract, expected: resolvedExpected };
  registryEntry = null;
  metadataFile = basename(resolvedMetadata);
  rulebookExtractFile = basename(resolvedExtract);
  expectedFile = basename(resolvedExpected);

  // Derive slug and gameName from metadata
  let metaPreview;
  try {
    metaPreview = JSON.parse(readFileSync(resolvedMetadata, 'utf8'));
  } catch (err) {
    console.error(`[preview-cli] Failed to parse metadata JSON: ${err.message}`);
    process.exit(2);
  }
  slug = metaPreview.slug || 'ad-hoc-preview';
  gameName = metaPreview.title || 'Ad-Hoc Preview';
  profile = 'ad-hoc local source';
}

console.log(`[preview-cli] Fixture: ${slug} (${gameName})`);
console.log(`[preview-cli] Metadata: ${sourcePaths.metadata}`);
console.log(`[preview-cli] Extract: ${sourcePaths.extract}`);
console.log(`[preview-cli] Expected: ${sourcePaths.expected}`);
console.log(`[preview-cli] Output: ${resolvedOut}`);
console.log(`[preview-cli] Source mode: ${sourceMode}`);

// ---------------------------------------------------------------------------
// Source contract validation
// ---------------------------------------------------------------------------
console.log('[preview-cli] Validating source contracts...');
const metadataJson = JSON.parse(readFileSync(sourcePaths.metadata, 'utf8'));
const extractJson = JSON.parse(readFileSync(sourcePaths.extract, 'utf8'));
const sourceResult = validateSourceContract(metadataJson, extractJson, registryEntry);
if (!sourceResult.passed) {
  console.error(`[preview-cli] Source contract validation FAILED (${sourceResult.errors.length} error(s)):`);
  sourceResult.errors.forEach((e) => console.error(`  - ${e}`));
  process.exit(1);
}
console.log('[preview-cli]   → Source contracts valid');

// ---------------------------------------------------------------------------
// Create output directory
// ---------------------------------------------------------------------------
mkdirSync(resolvedOut, { recursive: true });

// ---------------------------------------------------------------------------
// Normalize
// ---------------------------------------------------------------------------
const normalizedPath = join(resolvedOut, `${slug}-normalized.json`);
console.log('[preview-cli] Step 1/6: Normalizing fixture...');
try {
  execFileSync('node', [
    NORMALIZER_SCRIPT,
    '--metadata', sourcePaths.metadata,
    '--extract', sourcePaths.extract,
    '--out', normalizedPath,
  ], { encoding: 'utf8', stdio: 'pipe', timeout: 15000, cwd: PROJECT_ROOT });
} catch (err) {
  console.error(`[preview-cli] Normalization failed: ${err.stderr || err.message}`);
  process.exit(1);
}
console.log(`[preview-cli]   → ${normalizedPath}`);

// ---------------------------------------------------------------------------
// Generate tutorial preview artifacts
// ---------------------------------------------------------------------------
console.log('[preview-cli] Step 2/6: Generating tutorial artifacts...');
try {
  execFileSync('node', [
    GENERATE_SCRIPT,
    '--fixture', normalizedPath,
    '--slug', slug,
    '--out', resolvedOut,
  ], { encoding: 'utf8', stdio: 'pipe', timeout: 30000, cwd: PROJECT_ROOT });
} catch (err) {
  console.error(`[preview-cli] Generation failed: ${err.stderr || err.message}`);
  process.exit(1);
}
console.log('[preview-cli]   → script.json, storyboard.json, captions.srt, render-config.json, manifest.json');

// ---------------------------------------------------------------------------
// Render MP4
// ---------------------------------------------------------------------------
const mp4Path = join(resolvedOut, 'preview.mp4');
console.log('[preview-cli] Step 3/6: Rendering MP4...');
try {
  execFileSync('node', [
    RENDER_SCRIPT,
    '--config', join(resolvedOut, 'render-config.json'),
    '--out', mp4Path,
  ], { encoding: 'utf8', stdio: 'pipe', timeout: 300000, cwd: PROJECT_ROOT });
} catch (err) {
  console.error(`[preview-cli] Render failed: ${err.stderr || err.message}`);
  process.exit(1);
}
console.log(`[preview-cli]   → ${mp4Path}`);

// ---------------------------------------------------------------------------
// Capture ffprobe.json
// ---------------------------------------------------------------------------
const ffprobePath = join(resolvedOut, 'ffprobe.json');
console.log('[preview-cli] Step 4/6: Capturing ffprobe metadata...');
try {
  const ffprobeOutput = execFileSync('ffprobe', [
    '-hide_banner', '-loglevel', 'error',
    '-print_format', 'json',
    '-show_format', '-show_streams',
    mp4Path,
  ], { encoding: 'utf8', stdio: 'pipe', timeout: 15000 });
  writeFileSync(ffprobePath, ffprobeOutput, 'utf8');
} catch (err) {
  console.error(`[preview-cli] ffprobe failed: ${err.stderr || err.message}`);
  process.exit(1);
}
console.log(`[preview-cli]   → ${ffprobePath}`);

// ---------------------------------------------------------------------------
// Validate against contract
// ---------------------------------------------------------------------------
console.log('[preview-cli] Step 5/6: Validating artifact contract...');
const expectedContract = JSON.parse(readFileSync(sourcePaths.expected, 'utf8'));
const validationResult = validateRealInputArtifact(resolvedOut, expectedContract);

const validationOutputPath = join(resolvedOut, 'validation-result.json');
writeFileSync(validationOutputPath, JSON.stringify(validationResult, null, 2), 'utf8');

if (validationResult.passed) {
  console.log('[preview-cli]   → Contract validation PASSED');
} else {
  console.error(`[preview-cli]   → Contract validation FAILED (${validationResult.errors.length} error(s)):`);
  validationResult.errors.forEach((e) => console.error(`      - ${e}`));
}

// ---------------------------------------------------------------------------
// Write coverage report
// ---------------------------------------------------------------------------
console.log('[preview-cli] Step 6/6: Writing coverage report...');
const ffprobeData = existsSync(ffprobePath) ? JSON.parse(readFileSync(ffprobePath, 'utf8')) : null;
const manifestData = existsSync(join(resolvedOut, 'manifest.json'))
  ? JSON.parse(readFileSync(join(resolvedOut, 'manifest.json'), 'utf8'))
  : null;

const report = createReport({ registryPath: sourceMode === 'registered' ? REGISTRY_PATH : '(ad-hoc)', enabledCount: 1 });
const entry = buildFixtureEntry({
  slug,
  gameName,
  profile,
  metadataFile,
  rulebookExtractFile,
  expectedFile,
  normalizedFixturePath: normalizedPath,
  artifactDir: resolvedOut,
  ffprobeData,
  manifestData,
  requiredArtifacts: expectedContract.requiredArtifacts || [],
  contractValidation: validationResult,
});
entry.sourceMode = sourceMode;
report.fixtures.push(entry);

const coverageReportPath = join(resolvedOut, 'real-input-preview-coverage.json');
writeReport(coverageReportPath, report);
console.log(`[preview-cli]   → ${coverageReportPath}`);

// ---------------------------------------------------------------------------
// Write preview package manifest
// ---------------------------------------------------------------------------
console.log('[preview-cli] Writing preview-package-manifest.json...');

function fileHash(filePath) {
  if (!existsSync(filePath)) return null;
  const content = readFileSync(filePath);
  return createHash('sha256').update(content).digest('hex');
}

function fileSize(filePath) {
  if (!existsSync(filePath)) return null;
  return statSync(filePath).size;
}

const OUTPUT_FILES = [
  `${slug}-normalized.json`,
  'script.json',
  'storyboard.json',
  'captions.srt',
  'render-config.json',
  'manifest.json',
  'preview.mp4',
  'ffprobe.json',
  'validation-result.json',
  'real-input-preview-coverage.json',
];

const artifacts = {};
for (const file of OUTPUT_FILES) {
  const filePath = join(resolvedOut, file);
  artifacts[file] = {
    exists: existsSync(filePath),
    size: fileSize(filePath),
    sha256: fileHash(filePath),
  };
}

// Media summary from ffprobe
let mediaSummary = null;
if (ffprobeData) {
  const streams = ffprobeData.streams || [];
  const videoStream = streams.find((s) => s.codec_type === 'video');
  const audioStream = streams.find((s) => s.codec_type === 'audio');
  mediaSummary = {
    duration: ffprobeData.format?.duration ? parseFloat(ffprobeData.format.duration) : null,
    videoCodec: videoStream?.codec_name || null,
    videoWidth: videoStream?.width != null ? Number(videoStream.width) : null,
    videoHeight: videoStream?.height != null ? Number(videoStream.height) : null,
    audioPresent: !!audioStream,
    audioCodec: audioStream?.codec_name || null,
  };
}

const packageManifest = {
  _schema: 'preview-package-manifest/v1',
  generatedAt: new Date().toISOString(),
  sourceMode,
  fixtureSlug: slug,
  gameName,
  source: {
    metadataFile,
    rulebookExtractFile,
    expectedFile,
    metadataPath: sourcePaths.metadata,
    extractPath: sourcePaths.extract,
    expectedPath: sourcePaths.expected,
  },
  output: {
    directory: resolvedOut,
    artifacts,
  },
  validation: {
    passed: validationResult.passed,
    errorCount: validationResult.errors.length,
    errors: validationResult.errors,
  },
  media: mediaSummary,
};

const manifestPath = join(resolvedOut, 'preview-package-manifest.json');
writeFileSync(manifestPath, JSON.stringify(packageManifest, null, 2), 'utf8');
console.log(`[preview-cli]   → ${manifestPath}`);

// ---------------------------------------------------------------------------
// Final summary
// ---------------------------------------------------------------------------
console.log('');
if (validationResult.passed) {
  console.log(`[preview-cli] SUCCESS: ${slug} preview pipeline completed (${sourceMode} mode).`);
  console.log(`[preview-cli] Output directory: ${resolvedOut}`);
  process.exit(0);
} else {
  console.error(`[preview-cli] COMPLETED WITH VALIDATION FAILURES: ${validationResult.errors.length} contract violation(s).`);
  console.error(`[preview-cli] Output directory: ${resolvedOut}`);
  process.exit(1);
}
