#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import sharp from 'sharp';

const require = createRequire(import.meta.url);
const { buildRulebookKnowledgeModel, buildTutorialCoverageMatrix } = require('../src/services/rulebookKnowledge.cjs');
const { compileCanonicalProductionState } = require('../src/services/canonicalProductionCompiler.cjs');
const { buildPhoneScaleQaSheet } = require('../src/services/phoneScaleQa.cjs');
const { materializeVisualPlanFrames } = require('../src/services/visualPlanMaterializer.cjs');

const root = path.resolve(process.cwd());
const outputDir = path.join(root, 'out', 'generator-productization-r11', 'terraforming-mars-normal-path-proof');
fs.mkdirSync(outputDir, { recursive: true });
const evidencePath = path.join(root, 'out', 'hephaestus-recovery-r1', 'terraforming-mars', 'recovered.json');
if (!fs.existsSync(evidencePath)) throw new Error(`Existing Terraforming Mars evidence is missing: ${evidencePath}`);
const evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
const gameplayPath = path.join(root, 'out', 'gameplay-actions-r1', 'terraforming-mars', 'gameplay-actions.json');
const gameplay = JSON.parse(fs.readFileSync(gameplayPath, 'utf8'));

async function bestAccepted(category) {
  const rows = (evidence.assets || []).filter((asset) => asset.reviewState === 'accepted'
    && new RegExp(category, 'i').test(String(asset.category))
    && asset.renderPath && fs.existsSync(asset.renderPath));
  const measured = await Promise.all(rows.map(async (asset) => {
    const metadata = await sharp(asset.renderPath, { limitInputPixels: false }).metadata();
    return { asset, width: Number(metadata.width || 0), height: Number(metadata.height || 0) };
  }));
  return measured.sort((left, right) => right.width * right.height - left.width * left.height)[0];
}

const board = await bestAccepted('board');
const tileAction = (gameplay.actions || []).find((action) => /placer.*tuile/i.test(action.name));
const tileAssetId = tileAction?.visualAssetIds?.[0];
const tileAsset = (evidence.assets || []).find((asset) => asset.id === tileAssetId && asset.renderPath && fs.existsSync(asset.renderPath));
const tileMetadata = tileAsset ? await sharp(tileAsset.renderPath, { limitInputPixels: false }).metadata() : null;
const tile = tileAsset ? { asset: tileAsset, width: Number(tileMetadata.width || 0), height: Number(tileMetadata.height || 0) } : null;
if (!board || !tile) throw new Error('Existing Terraforming Mars evidence lacks an accepted board or tile/token asset.');

const sourcePdfSha256 = evidence.sourcePdfSha256;
const model = buildRulebookKnowledgeModel({ projectSeed: {
  projectId: evidence.projectId,
  gameIdentity: evidence.gameIdentity,
  sourcePdfSha256,
  coverageApplicability: { components: true, mandatory_actions: true, component_placement_orientation: true },
  ruleAtoms: [
    {
      id: 'tm-proof-board', domain: 'components', coverageDomains: ['components'], title: 'Le plateau central',
      componentRefs: ['board'], sourceRefs: [{ page: board.asset.pageNumber, section: 'Components' }], confidence: 0.95, reviewState: 'accepted',
      teaching: { majorSection: 'Les composants', heading: 'Le plateau', narration: 'Repérez le plateau central.', displayLines: ['Plateau central'] },
    },
    {
      id: tileAction.id, domain: 'action', coverageDomains: ['mandatory_actions', 'component_placement_orientation'], title: tileAction.name,
      actor: 'joueur actif', choice: tileAction.purpose, procedureSteps: [tileAction.stateChange.action],
      placement: tileAction.stateChange.after, stateBefore: tileAction.stateChange.before, stateChange: tileAction.stateChange.action, stateAfter: tileAction.stateChange.after, result: tileAction.nextState,
      componentRefs: [...new Set([...(tileAction.componentRefs || []), 'board'])], sourceRefs: tileAction.sourceRefs.map((ref) => ({ page: tile.asset.pageNumber, section: ref.section })), confidence: tileAction.confidence, reviewState: tileAction.reviewState,
      teaching: { majorSection: 'Les actions', heading: tileAction.name, narration: `${tileAction.stateChange.action} ${tileAction.nextState}`, displayLines: [tileAction.name, tileAction.stateChange.after] },
    },
  ],
} });
const atomIds = model.ruleAtoms.map((atom) => atom.id);
const coverage = buildTutorialCoverageMatrix(model, { includedAtomIds: atomIds, storyboardAtomIds: atomIds, visualizedAtomIds: atomIds, narratedAtomIds: atomIds });

function sourceAsset(measured, semanticObject) {
  const asset = measured.asset;
  return {
    ...asset,
    id: `tm-proof-${semanticObject}`,
    filePath: asset.renderPath,
    width: measured.width,
    height: measured.height,
    sourceAuthority: 'NATIVE_EMBEDDED',
    semanticObjects: semanticObject === 'tile' ? [...tileAction.componentRefs, tileAction.name, asset.category] : [semanticObject, asset.category],
    cropCompleteness: 'complete',
    cropPurity: 'clean',
    containsActualGamePixels: true,
    visualClassification: semanticObject === 'board' ? 'REAL_BOARD_OR_TRACK' : 'REAL_COMPONENT',
    sourceRefs: [{ page: asset.pageNumber, sourcePdfSha256, originalAssetId: asset.id }],
    reviewState: 'accepted',
  };
}
const input = {
  projectId: evidence.projectId,
  knowledgeModel: model,
  coverageMatrix: coverage,
  sourceAssets: [sourceAsset(board, 'board'), sourceAsset(tile, 'tile')],
  displayBounds: { width: 320, height: 220 },
};
const first = compileCanonicalProductionState(input);
const second = compileCanonicalProductionState(input);
const materialized = await materializeVisualPlanFrames({ state: first, outputDir: path.join(outputDir, 'visual-plan-frames'), width: 960, height: 620 });
const stableHash = (value) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const normalEntrypoints = ['scripts/run-rulebook-production.mjs', 'scripts/run-source-grounded-production.mjs'];
const normalEntrypointSource = Object.fromEntries(normalEntrypoints.map((file) => [file, fs.readFileSync(path.join(root, file), 'utf8')]));
const forbiddenDependencies = normalEntrypoints.flatMap((file) => {
  const text = normalEntrypointSource[file];
  return [
    ...(/build-7wd-r\d+/i.test(text) ? [`${file}:build-7wd-r*`] : []),
    ...(/qa-publishability-r\d+/i.test(text) ? [`${file}:qa-publishability-r*`] : []),
  ];
});
const phoneScaleQa = await buildPhoneScaleQaSheet({ scenes: materialized.scenes, outputPath: path.join(outputDir, 'phone-scale-qa.png'), columns: 2 });
const r11ReplayPath = path.join(root, 'out', 'publishability-r11', '7-wonders-duel', 'replay-idempotence.json');
const r11Replay = fs.existsSync(r11ReplayPath) ? JSON.parse(fs.readFileSync(r11ReplayPath, 'utf8')) : null;
const checks = {
  normalCompilerUsed: first.contract === 'mobius-canonical-production-compiler-v2',
  codexRequiredForNormalProduction: first.CODEX_REQUIRED_FOR_NORMAL_PRODUCTION,
  knowledgeGenerated: model.ruleAtoms.length === 2,
  componentEvidenceConsumed: first.assets.length === 2,
  visualRequirementsDerived: model.ruleAtoms.every((atom) => atom.visualRequirement?.purpose && atom.visualRequirement?.requiredObjects?.length),
  physicalStatesGenerated: first.physicalStates.length === model.ruleAtoms.length,
  visualPlansGenerated: first.visualPlans.length === model.ruleAtoms.length,
  multiAssetVisualPlanMaterialized: materialized.records.length >= 1 && materialized.records.every((record) => fs.existsSync(record.outputPath)),
  sourceSelectionsGenerated: first.sourceSelections.every((selection) => selection.status === 'AUTO_ACCEPTED'),
  cockpitStateGenerated: first.scenes.every((scene) => scene.visualPlan?.coverageStatus === 'resolved'),
  responsiveStoryboardStateGenerated: first.scenes.every((scene) => scene.canonicalVisualPlan?.alignment?.fit === 'CONTAIN'),
  amelieR10Default: model.ruleAtoms.every((atom) => atom.teaching?.profile === 'AMELIE_TEACHING_WARM_R10'),
  deterministicQaPass: first.qa.status === 'PASS',
  replayIdempotent: stableHash(first) === stableHash(second),
  normalEntrypointHasNoIterationDependency: forbiddenDependencies.length === 0,
  productionMemoryDedupeBeforeExpensiveWork: /findProcessedBySha/.test(normalEntrypointSource['scripts/run-rulebook-production.mjs'])
    && /stageReady\(/.test(normalEntrypointSource['scripts/run-rulebook-production.mjs'])
    && /checkpointReady\(/.test(normalEntrypointSource['scripts/run-source-grounded-production.mjs']),
  narrationCacheIncludesDeliveryContract: /sourceTextHash:[\s\S]*deliveryProfile:[\s\S]*voiceSettings/.test(normalEntrypointSource['scripts/run-source-grounded-production.mjs']),
  r11ReplayPreserved: Boolean(r11Replay?.deterministic && r11Replay?.configStable && r11Replay?.narrationManifestStable && r11Replay?.encodedVideoUntouched),
};
const pass = Object.entries(checks).every(([key, value]) => key === 'codexRequiredForNormalProduction' ? value === false : value === true);
const report = {
  contract: 'mobius-bounded-non-7wd-normal-path-proof-v1',
  generatedAt: new Date().toISOString(),
  status: pass ? 'PASS' : 'FAIL',
  projectId: evidence.projectId,
  sourcePdfSha256,
  normalEntrypoints,
  forbiddenDependencies,
  checks,
  counts: { atoms: model.ruleAtoms.length, assets: first.assets.length, plans: first.visualPlans.length, physicalStates: first.physicalStates.length, reviewItems: first.reviewItems.length },
  hashes: { first: stableHash(first), second: stableHash(second) },
  phoneScaleQa,
  r11Replay: r11Replay ? { path: r11ReplayPath, deterministic: r11Replay.deterministic, videoSha256: r11Replay.after?.video } : null,
  providerCalls: 0,
  narrationGenerated: 0,
  fullVideoRendered: false,
};
fs.writeFileSync(path.join(outputDir, 'proof.json'), `${JSON.stringify(report, null, 2)}\n`);
fs.writeFileSync(path.join(outputDir, 'canonical-production-state.json'), `${JSON.stringify(first, null, 2)}\n`);
console.log(JSON.stringify({ status: report.status, outputDir, checks }, null, 2));
if (!pass) process.exitCode = 1;
