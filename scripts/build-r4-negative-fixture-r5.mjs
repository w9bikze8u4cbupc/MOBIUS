#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import ffmpegPath from 'ffmpeg-static';

const ROOT = path.resolve(process.cwd());
const sourceRoot = path.join(ROOT, 'out', 'publishability-r4', '7-wonders-duel');
const outputRoot = path.join(ROOT, 'out', 'publishability-r5');
const fixtureRoot = path.join(outputRoot, 'gold-negative-r4');
const auditRoot = path.join(outputRoot, '7-wonders-duel');
const videoPath = path.join(sourceRoot, '7-wonders-duel-full-tutorial-r4.mp4');
const configPath = path.join(sourceRoot, 'full-tutorial-config.json');

const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const writeJson = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); };

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const targetIds = new Set([
  'knowledge-objective-victory-overview',
  'knowledge-components-overview',
  'knowledge-construct-building',
  'knowledge-chain-construction',
  'knowledge-discard-for-coins',
  'knowledge-science-pair-progress',
  'knowledge-science-supremacy',
  'knowledge-scoring-ledger',
  'knowledge-scoring-buildings',
]);

let cursor = 0;
const scenes = config.scenes.map((scene) => {
  const startSec = Number(cursor.toFixed(3));
  const durationSec = Number(scene.durationSec || 0);
  cursor += durationSec;
  return { ...scene, startSec, endSec: Number(cursor.toFixed(3)), durationSec };
});

fs.mkdirSync(fixtureRoot, { recursive: true });
const videoSha256 = sha256(videoPath);
const frames = [];
for (const scene of scenes.filter((item) => targetIds.has(item.id))) {
  const timestampSec = Number((scene.startSec + Math.min(Math.max(scene.durationSec * 0.5, 0.5), Math.max(scene.durationSec - 0.25, 0.5))).toFixed(3));
  const framePath = path.join(fixtureRoot, `${scene.id}.png`);
  execFileSync(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-ss', String(timestampSec), '-i', videoPath, '-frames:v', '1', '-y', framePath], { stdio: 'pipe' });
  const labels = ['NON_PUBLISHABLE', 'VISUAL_SUPPORT_MISSING', 'TEXT_ONLY_INSTRUCTION', 'ABSTRACT_PROXY_INSTEAD_OF_COMPONENT', 'BRAND_VISUAL_REGRESSION'];
  if (['knowledge-objective-victory-overview', 'knowledge-components-overview', 'knowledge-chain-construction'].includes(scene.id)) labels.push('POOR_SPACE_USE');
  frames.push({
    sceneId: scene.id,
    ruleAtomId: scene.atomId || null,
    sourceVideo: videoPath,
    sourceVideoSha256: videoSha256,
    timestampSec,
    framePath,
    frameSha256: sha256(framePath),
    directorClassification: 'HUMAN_REJECTED_GOLD_NEGATIVE_VISUAL_REFERENCE',
    humanScore10: 5,
    publishable: false,
    labels,
    defectCategory: 'missing-real-game-visual-evidence',
    reason: 'The rendered instructional scene substitutes text/vector shapes for source-grounded recognizable game components.',
  });
}

const manifest = {
  contract: 'mobius-human-gold-negative-visual-fixture-v1',
  recordedAt: new Date().toISOString(),
  authority: 'Director human review',
  videoPath,
  videoSha256,
  humanScore10: 5,
  publishable: false,
  classification: 'HUMAN_REJECTED_GOLD_NEGATIVE_VISUAL_REFERENCE',
  supersedes: ['R4 visual quality PASS', 'R4 visual correspondence PASS', 'R4 professional candidate'],
  frames,
};
writeJson(path.join(fixtureRoot, 'manifest.json'), manifest);

const teachingScenes = scenes.filter((scene) => scene.type === 'teaching' && scene.atomId);
const auditScenes = teachingScenes.map((scene) => {
  const sourceType = scene.visualBinding?.sourceType || 'UNKNOWN';
  const synthetic = sourceType === 'DETERMINISTIC_VECTOR' || scene.background?.provenance?.kind === 'deterministic-source-grounded-schematic';
  const physicalComponentsNamed = scene.visualRequirement?.requiredObjects || [];
  const actualAssetIds = synthetic ? [] : [scene.visualBinding?.assetId].filter(Boolean);
  const classification = synthetic ? 'INVALID_PROXY' : 'REAL_CARD_OR_WONDER';
  return {
    sceneId: scene.id,
    ruleAtomId: scene.atomId,
    narration: scene.narrationText,
    physicalComponentsNamed,
    actualVisualAssetIds: actualAssetIds,
    renderedVisualContainsRealGamePixels: !synthetic,
    sourceType,
    semanticMatch: synthetic ? 'FAIL_COMPONENT_EVIDENCE' : 'UNASSESSABLE',
    displayBounds: { width: 1920, height: 1080 },
    visualPaneOccupancy: null,
    textPaneOccupancy: null,
    emptyPanelRatio: null,
    syntheticProxyUsed: synthetic,
    realComponentAvailable: true,
    realComponentOmitted: synthetic,
    classification,
  };
});
const metrics = {
  auditedInstructionalScenes: auditScenes.length,
  scenesWithRealGamePixels: auditScenes.filter((scene) => scene.renderedVisualContainsRealGamePixels).length,
  textOnlyOrInvalidProxyScenes: auditScenes.filter((scene) => ['TEXT_ONLY', 'GENERIC_DECORATIVE', 'INVALID_PROXY'].includes(scene.classification)).length,
  syntheticProxyScenes: auditScenes.filter((scene) => scene.syntheticProxyUsed).length,
  missingRealComponentScenes: auditScenes.filter((scene) => scene.realComponentOmitted).length,
};
const audit = {
  contract: 'mobius-visual-coverage-audit-v1',
  generatedAt: new Date().toISOString(),
  artifact: '7 Wonders Duel R4',
  videoPath,
  videoSha256,
  humanAuthority: { score10: 5, publishable: false, classification: 'HUMAN_REJECTED_GOLD_NEGATIVE_VISUAL_REFERENCE' },
  requiredClassifications: ['REAL_COMPONENT', 'REAL_BOARD_OR_TRACK', 'REAL_CARD_OR_WONDER', 'REAL_SETUP_STATE', 'SOURCE_FAITHFUL_DIAGRAM_WITH_REAL_ASSETS', 'ABSTRACT_SUPPORTING_DIAGRAM', 'TEXT_ONLY', 'GENERIC_DECORATIVE', 'INVALID_PROXY'],
  metrics,
  status: metrics.textOnlyOrInvalidProxyScenes > 0 ? 'FAIL' : 'PASS',
  scenes: auditScenes,
};
writeJson(path.join(auditRoot, 'visual-coverage-audit.json'), audit);
fs.writeFileSync(path.join(auditRoot, 'visual-coverage-audit.md'), `# 7 Wonders Duel R4 visual coverage audit\n\n- Video SHA-256: \`${videoSha256}\`\n- Director: **NON_PUBLISHABLE — 5/10**\n- Classification: **HUMAN_REJECTED_GOLD_NEGATIVE_VISUAL_REFERENCE**\n- Instructional scenes audited: ${metrics.auditedInstructionalScenes}\n- Invalid proxy/text-only scenes: ${metrics.textOnlyOrInvalidProxyScenes}\n- Real components omitted: ${metrics.missingRealComponentScenes}\n- Gate: **${audit.status}**\n`);

process.stdout.write(`${JSON.stringify({ fixtureFrames: frames.length, audit: metrics, r4Gate: audit.status }, null, 2)}\n`);
