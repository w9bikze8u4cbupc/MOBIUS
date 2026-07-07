#!/usr/bin/env node

/**
 * run-real-input-preview.mjs — Offline CLI for running a registered real-input
 * fixture through the full tutorial preview pipeline.
 *
 * Usage:
 *   node scripts/run-real-input-preview.mjs --fixture <slug> --out <output-dir>
 *
 * Pipeline:
 *   registry lookup → normalize → generate → render → ffprobe → validate → coverage report
 *
 * Exit codes:
 *   0 = success (all steps pass)
 *   1 = pipeline or validation failure
 *   2 = invalid arguments or missing fixture
 */

import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const require = createRequire(import.meta.url);
const { loadRegistry, findFixtureBySlug, resolveFixturePaths, validateFixtureFiles } = require('../tests/helpers/realInputFixtureRegistry.cjs');
const { validateRealInputArtifact } = require('./validate-real-input-preview-artifact.cjs');
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
const outDir = getArg('out');

if (!fixtureSlug || !outDir) {
  console.error('Usage: node scripts/run-real-input-preview.mjs --fixture <slug> --out <output-dir>');
  console.error('');
  console.error('Options:');
  console.error('  --fixture  Slug of a registered real-input fixture (e.g., sakura-market)');
  console.error('  --out      Output directory for preview artifacts');
  process.exit(2);
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
// Step 1: Load registry and find fixture
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Step 2: Validate fixture files exist
// ---------------------------------------------------------------------------
const fileCheck = validateFixtureFiles(fixture, REGISTRY_DIR);
if (!fileCheck.valid) {
  console.error(`[preview-cli] Missing fixture files: ${fileCheck.missing.join(', ')}`);
  process.exit(2);
}

const paths = resolveFixturePaths(fixture, REGISTRY_DIR);
console.log(`[preview-cli] Fixture: ${fixture.slug} (${fixture.gameName})`);
console.log(`[preview-cli] Metadata: ${paths.metadata}`);
console.log(`[preview-cli] Extract: ${paths.extract}`);
console.log(`[preview-cli] Expected: ${paths.expected}`);
console.log(`[preview-cli] Output: ${resolvedOut}`);

// ---------------------------------------------------------------------------
// Step 3: Create output directory
// ---------------------------------------------------------------------------
mkdirSync(resolvedOut, { recursive: true });

// ---------------------------------------------------------------------------
// Step 4: Normalize
// ---------------------------------------------------------------------------
const normalizedPath = join(resolvedOut, `${fixture.slug}-normalized.json`);
console.log('[preview-cli] Step 1/6: Normalizing fixture...');
try {
  execFileSync('node', [
    NORMALIZER_SCRIPT,
    '--metadata', paths.metadata,
    '--extract', paths.extract,
    '--out', normalizedPath,
  ], { encoding: 'utf8', stdio: 'pipe', timeout: 15000, cwd: PROJECT_ROOT });
} catch (err) {
  console.error(`[preview-cli] Normalization failed: ${err.stderr || err.message}`);
  process.exit(1);
}
console.log(`[preview-cli]   → ${normalizedPath}`);

// ---------------------------------------------------------------------------
// Step 5: Generate tutorial preview artifacts
// ---------------------------------------------------------------------------
console.log('[preview-cli] Step 2/6: Generating tutorial artifacts...');
try {
  execFileSync('node', [
    GENERATE_SCRIPT,
    '--fixture', normalizedPath,
    '--slug', fixture.slug,
    '--out', resolvedOut,
  ], { encoding: 'utf8', stdio: 'pipe', timeout: 30000, cwd: PROJECT_ROOT });
} catch (err) {
  console.error(`[preview-cli] Generation failed: ${err.stderr || err.message}`);
  process.exit(1);
}
console.log('[preview-cli]   → script.json, storyboard.json, captions.srt, render-config.json, manifest.json');

// ---------------------------------------------------------------------------
// Step 6: Render MP4
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
// Step 7: Capture ffprobe.json
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
// Step 8: Validate against contract
// ---------------------------------------------------------------------------
console.log('[preview-cli] Step 5/6: Validating artifact contract...');
const expectedContract = JSON.parse(readFileSync(paths.expected, 'utf8'));
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
// Step 9: Write coverage report
// ---------------------------------------------------------------------------
console.log('[preview-cli] Step 6/6: Writing coverage report...');
const ffprobeData = existsSync(ffprobePath) ? JSON.parse(readFileSync(ffprobePath, 'utf8')) : null;
const manifestData = existsSync(join(resolvedOut, 'manifest.json'))
  ? JSON.parse(readFileSync(join(resolvedOut, 'manifest.json'), 'utf8'))
  : null;

const report = createReport({ registryPath: REGISTRY_PATH, enabledCount: 1 });
const entry = buildFixtureEntry({
  slug: fixture.slug,
  gameName: fixture.gameName,
  profile: fixture.profile,
  metadataFile: fixture.metadataFile,
  rulebookExtractFile: fixture.rulebookExtractFile,
  expectedFile: fixture.expectedFile,
  normalizedFixturePath: normalizedPath,
  artifactDir: resolvedOut,
  ffprobeData,
  manifestData,
  requiredArtifacts: expectedContract.requiredArtifacts || [],
  contractValidation: validationResult,
});
report.fixtures.push(entry);

const coverageReportPath = join(resolvedOut, 'real-input-preview-coverage.json');
writeReport(coverageReportPath, report);
console.log(`[preview-cli]   → ${coverageReportPath}`);

// ---------------------------------------------------------------------------
// Final summary
// ---------------------------------------------------------------------------
console.log('');
if (validationResult.passed) {
  console.log(`[preview-cli] SUCCESS: ${fixture.slug} preview pipeline completed.`);
  console.log(`[preview-cli] Output directory: ${resolvedOut}`);
  process.exit(0);
} else {
  console.error(`[preview-cli] COMPLETED WITH VALIDATION FAILURES: ${validationResult.errors.length} contract violation(s).`);
  console.error(`[preview-cli] Output directory: ${resolvedOut}`);
  process.exit(1);
}
