#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { QUALITY_STATES, traceAssetSourceDetail } = require('../src/services/sourceDetailLineage.cjs');

const ROOT = path.resolve(process.cwd());
function parseArgs(argv = process.argv.slice(2)) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (!argv[index].startsWith('--')) continue;
    result[argv[index].slice(2)] = argv[index + 1];
    index += 1;
  }
  return result;
}
const absolute = (value) => path.isAbsolute(value) ? path.resolve(value) : path.resolve(ROOT, value);
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const writeJson = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); };

const args = parseArgs();
if (!args.assets || !args.storyboard || !args.lineage || !args.out) {
  throw new Error('Usage: --assets <component manifest> --storyboard <manifest> --lineage <pdf lineage> --out <report>');
}
const assetManifest = readJson(absolute(args.assets));
const storyboard = readJson(absolute(args.storyboard));
const lineage = readJson(absolute(args.lineage));
const byId = new Map((assetManifest.assets || []).map((asset) => [asset.id, asset]));
const scenes = [];

for (const frame of storyboard.frames || []) {
  const traces = [];
  for (const bounds of frame.layout?.visualBounds || []) {
    const asset = byId.get(bounds.assetId);
    if (!asset) {
      traces.push({ assetId: bounds.assetId, qualityState: QUALITY_STATES.FAIL, violationCount: 1, reason: 'asset-not-in-component-library' });
      continue;
    }
    const report = traceAssetSourceDetail({ asset, finalBounds: bounds, pdfLineage: lineage });
    if (Array.isArray(asset.nativeMasterPath) && !asset.sourceLineage?.layers) {
      report.qualityState = QUALITY_STATES.FAIL;
      report.violationCount += 1;
      report.unresolvedReason = 'Composite lost per-layer placement lineage; final composite pixels cannot prove native source detail.';
    }
    traces.push(report);
  }
  scenes.push({
    sceneId: frame.sceneId,
    ruleAtomId: frame.ruleAtomId,
    framePath: frame.filePath,
    componentTraces: traces,
    trueSourceDetailViolationCount: traces.filter((trace) => trace.qualityState === QUALITY_STATES.FAIL).length,
    marginalCount: traces.filter((trace) => trace.qualityState === QUALITY_STATES.MARGINAL).length,
    reviewedEnhancedCount: traces.filter((trace) => trace.qualityState === QUALITY_STATES.ENHANCED).length,
  });
}
const report = {
  contract: 'mobius-source-lineage-resolution-report-v1',
  generatedAt: new Date().toISOString(),
  input: {
    assetManifest: absolute(args.assets),
    storyboardManifest: absolute(args.storyboard),
    pdfLineage: absolute(args.lineage),
  },
  policy: {
    preferredTrueSourcePixelsPerDisplayPixel: 1,
    warnBelow: 1,
    failBelow: 0.8,
    failEffectiveUpscaleAbove: 1.25,
    finalCompositeResolutionIsNotSourceDetailProof: true,
  },
  status: scenes.some((scene) => scene.trueSourceDetailViolationCount) ? 'FAIL' : 'PASS',
  metrics: {
    scenes: scenes.length,
    assetsTraced: scenes.reduce((sum, scene) => sum + scene.componentTraces.length, 0),
    trueSourceDetailViolations: scenes.reduce((sum, scene) => sum + scene.trueSourceDetailViolationCount, 0),
    marginal: scenes.reduce((sum, scene) => sum + scene.marginalCount, 0),
    reviewedEnhancedDerivatives: scenes.reduce((sum, scene) => sum + scene.reviewedEnhancedCount, 0),
  },
  scenes,
};
writeJson(absolute(args.out), report);
process.stdout.write(`${JSON.stringify({ status: report.status, metrics: report.metrics, output: absolute(args.out) }, null, 2)}\n`);
if (args.strict === 'true' && report.status !== 'PASS') process.exitCode = 1;
