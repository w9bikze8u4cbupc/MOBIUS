#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import ffprobePath from 'ffprobe-static';

const ROOT = path.resolve(process.cwd());
const R5_ROOT = path.join(ROOT, 'out', 'publishability-r5', '7-wonders-duel');
const OUT_ROOT = path.join(ROOT, 'out', 'publishability-r6');
const BASELINE_ROOT = path.join(OUT_ROOT, 'baseline-r5');
const GAME_ROOT = path.join(OUT_ROOT, '7-wonders-duel');

const PATHS = Object.freeze({
  video: path.join(R5_ROOT, '7-wonders-duel-full-tutorial-r5.mp4'),
  configuration: path.join(R5_ROOT, 'full-tutorial-config.json'),
  narrationManifest: path.join(R5_ROOT, 'narration-assets.json'),
  visualPlanManifest: path.join(R5_ROOT, 'visual-storyboard', 'manifest.json'),
  componentLibraryManifest: path.join(R5_ROOT, 'component-library', 'manifest.json'),
  chapters: path.join(R5_ROOT, 'chapters.json'),
  sonicMaster: path.join(ROOT, 'src', 'assets', 'branding', 'sonic', 'mobius-cafe-sonic-signature-v4.wav'),
});

const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const writeJson = (file, value) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
};

function probeVideo(file) {
  return JSON.parse(execFileSync(ffprobePath.path, [
    '-v', 'error', '-show_entries', 'format=duration:stream=index,codec_type,codec_name,width,height,sample_rate,channels',
    '-of', 'json', file,
  ], { encoding: 'utf8' }));
}

for (const [label, file] of Object.entries(PATHS)) {
  if (!fs.existsSync(file)) throw new Error(`R5 baseline is incomplete: ${label} is missing at ${file}`);
}

const videoProbe = probeVideo(PATHS.video);
const chapters = readJson(PATHS.chapters);
const baseline = {
  contract: 'mobius-human-publishable-baseline-v1',
  recordedAt: new Date().toISOString(),
  authority: 'Director human publishability review',
  status: 'HUMAN_PUBLISHABLE_GOLD_BASELINE',
  publishable: true,
  published: false,
  reviewDate: '2026-09-06',
  humanScoreRange10: { min: 8.5, max: 9.0 },
  immutable: true,
  rollbackCandidate: true,
  files: Object.fromEntries(Object.entries(PATHS).map(([key, file]) => [key, {
    path: file,
    sha256: sha256(file),
    bytes: fs.statSync(file).size,
  }])),
  durationSec: Number(videoProbe.format.duration),
  video: videoProbe,
  chapters,
  residualPolishFindings: [
    'crop-completeness', 'crop-purity', 'true-source-detail', 'optical-centering',
    'clause-level-semantic-focus', 'reference-footer-geometry', 'context-text-centering',
    'amelie-warmth-and-prosodic-variety',
  ],
  safeguards: {
    r6DoesNotInheritPublishable: true,
    noYouTubeUploadClaim: true,
    rulesAndMeaningFrozen: true,
    sonicIdentityLocked: true,
    pr476Merged: false,
  },
};
writeJson(path.join(BASELINE_ROOT, 'baseline-manifest.json'), baseline);
writeJson(path.join(BASELINE_ROOT, 'director-verdict.json'), {
  authority: baseline.authority,
  date: baseline.reviewDate,
  artifactSha256: baseline.files.video.sha256,
  verdict: 'PUBLISHABLE',
  classification: baseline.status,
  humanScoreRange10: baseline.humanScoreRange10,
  published: false,
  note: 'R5 remains the immutable rollback candidate. R6 requires a new Director verdict.',
});

const findings = [
  ['knowledge-setup-central', 'coins', 'Coins are cut at the upper crop boundary.', 'Re-crop complete coins with padding and no neighbouring card fragment.', 'P2', 'NO_PARTIAL_COIN'],
  ['knowledge-setup-central', 'progress-tokens', 'Progress tokens have weak true detail at their displayed size.', 'Use the best native/official master or a reviewed derivative at a truthful display scale.', 'P2', 'TRUE_SOURCE_DETAIL'],
  ['knowledge-setup-wonder-selection', 'wonder-cards', 'The Wonder selection crop has incomplete neighbouring card edges.', 'Keep every intended Wonder complete and remove accidental edge fragments.', 'P2', 'CROP_COMPLETENESS'],
  ['knowledge-setup-age-decks', 'age-deck-composite', 'Age deck imagery contains clipped card edges.', 'Use object-aware bounds so every intended deck/card remains complete.', 'P2', 'NO_PARTIAL_CARD'],
  ['knowledge-setup-age-layouts', 'age-layout-diagram', 'Age/deck structure imagery loses useful edge content and card definition.', 'Preserve every required structure, title and card edge at adequate true detail.', 'P2', 'DIAGRAM_COMPLETENESS'],
  ['knowledge-setup-later-age-layouts', 'age-layout-diagram', 'Later-Age diagram is framed without enough semantic padding.', 'Retain Age labels, full structures, legends and orientation cues.', 'P2', 'DIAGRAM_COMPLETENESS'],
  ['knowledge-accessible-card', 'age-accessibility-composite', 'The accessible-card crop is soft and visually crowded by clipped cards.', 'Use a complete, sharper structure and restrained accessibility highlighting.', 'P2', 'TRUE_SOURCE_DETAIL'],
  ['knowledge-construct-building', 'blue-card-cost', 'Small card raster is enlarged and the cost callout stays active after the cost clause.', 'Use adequate source detail and move/fade focus from cost to the built-card state.', 'P2', 'CLAUSE_FOCUS_TIMELINE'],
  ['knowledge-resource-production', 'production-card-strip', 'The visual is soft and emphasizes card cost instead of production/effect.', 'Show complete production cards and target the production/effect region only.', 'P2', 'SEMANTIC_REGION_MATCH'],
  ['knowledge-trade-missing-resources', 'trade-diagram', 'The trade crop is soft and contains visually weak page-raster detail.', 'Use exact resources/opponent production/coins at truthful resolution.', 'P2', 'TRUE_SOURCE_DETAIL'],
  ['knowledge-chain-construction', 'chain-cards', 'Cards are enlarged and callouts do not cleanly isolate the matching white chain symbols.', 'Use complete cards and clause-level focus on both verified chain symbols.', 'P2', 'CLAUSE_FOCUS_TIMELINE'],
  ['knowledge-discard-for-coins', 'discard-card-coins', 'The card/coin composition contains clipped and incomplete objects.', 'Show a complete accessible card, discard state and complete isolated coins.', 'P2', 'CROP_PURITY_COMPLETENESS'],
  ['knowledge-construct-wonder', 'wonder-under-card', 'The Age card relationship is close to the edge and lacks balanced optical centering.', 'Center the complete Wonder-plus-Age-card relationship with safe padding.', 'P3', 'OPTICAL_CENTERING'],
  ['knowledge-military-system', 'conflict-track', 'The track is mathematically placed but not always optically balanced in its pane.', 'Center the visible track/pawn centroid and preserve threshold labels.', 'P3', 'OPTICAL_CENTERING'],
  ['knowledge-science-pair-progress', 'science-symbols-progress', 'Science strip is soft/poorly framed and Progress token edges lack clean definition.', 'Use complete sharp symbols and complete isolated Progress tokens.', 'P2', 'TRUE_SOURCE_DETAIL'],
  ['knowledge-science-supremacy', 'science-symbols', 'The science-symbol strip is soft and leaves avoidable unbalanced space.', 'Use a complete, adequately detailed strip centered in the visual pane.', 'P2', 'TRUE_SOURCE_DETAIL'],
  ['knowledge-scoring-buildings', 'building-cards-vp', 'Cost/resource regions are highlighted while narration discusses printed laurels/VP.', 'Target each card’s verified victory-point/laurel region during the scoring clause.', 'P2', 'SEMANTIC_REGION_MATCH'],
  ['knowledge-scoring-progress', 'progress-token-row', 'Progress tokens are enlarged from weak raster detail.', 'Use best available masters or reviewed derivatives with complete edges.', 'P2', 'TRUE_SOURCE_DETAIL'],
  ['knowledge-scoring-treasury', 'coins', 'Coins are cut at the upper boundary and are not optically centered.', 'Use a complete, pure, centered coin group.', 'P2', 'NO_PARTIAL_COIN'],
  ['knowledge-tie-breaker', 'blue-card', 'The comparison uses one oversized soft card and one tiny duplicate.', 'Use one adequately detailed card with focus on the blue-card VP region.', 'P2', 'VISUAL_BALANCE'],
  ['knowledge-construct-building', 'reference-footer', '“Livret p. 5, 8, 9, 10” sits inside the rounded-corner collision zone.', 'Reserve a dedicated provenance safe zone outside panel masks.', 'P2', 'REFERENCE_SAFE_ZONE'],
  ['knowledge-chain-construction', 'reference-footer', '“Livret p. 5, 9” is partly covered by rounded panel geometry.', 'Inset the reference and validate pixel overlap against the actual mask.', 'P2', 'REFERENCE_SAFE_ZONE'],
  ['knowledge-construct-wonder', 'context-panel', 'Short contextual text is not optically centered within its rounded box.', 'Center text optically with balanced horizontal/vertical padding.', 'P3', 'TEXT_OPTICAL_CENTERING'],
];

const config = readJson(PATHS.configuration);
let cursor = 0;
const sceneTimes = new Map(config.scenes.map((scene) => {
  const startSec = cursor;
  cursor += Number(scene.durationSec || 0);
  return [scene.id, { startSec: Number(startSec.toFixed(3)), endSec: Number(cursor.toFixed(3)) }];
}));
const feedback = {
  contract: 'mobius-director-feedback-manifest-v1',
  authority: 'Director review of R5 production bundle and 23 screenshots',
  reviewDate: '2026-09-06',
  sourceVideo: PATHS.video,
  sourceVideoSha256: baseline.files.video.sha256,
  findingCount: findings.length,
  findings: findings.map(([sceneId, assetId, observation, expectedCorrection, severity, requiredTechnicalGate], index) => ({
    id: `DIR-R6-${String(index + 1).padStart(3, '0')}`,
    sceneId,
    timestampSec: sceneTimes.get(sceneId)?.startSec ?? null,
    sceneEndSec: sceneTimes.get(sceneId)?.endSec ?? null,
    assetId,
    screenshotCategory: requiredTechnicalGate,
    observation,
    expectedCorrection,
    severity,
    requiredTechnicalGate,
    status: 'LOCKED_DIRECTOR_FINDING',
  })),
};
writeJson(path.join(GAME_ROOT, 'director-feedback-manifest.json'), feedback);

const delta = {
  contract: 'mobius-r5-to-r6-delta-contract-v1',
  generatedAt: new Date().toISOString(),
  baseline: { path: PATHS.video, sha256: baseline.files.video.sha256, status: baseline.status },
  candidateStatus: 'NOT_YET_RENDERED',
  rulesChanged: false,
  scriptSemanticsChanged: false,
  sonicIdentityChanged: false,
  allowedNarrationChange: 'Prosody-only regeneration with unchanged meaning and pronunciation contract.',
  changes: feedback.findings.map((finding) => ({
    directorFindingId: finding.id,
    exactDefectAddressed: finding.observation,
    generatorModule: null,
    affectedScenes: [finding.sceneId],
    affectedAssets: [finding.assetId],
    narrationChanged: false,
    rulesChanged: false,
    regressionEvidence: null,
    state: 'PLANNED',
  })),
};
writeJson(path.join(BASELINE_ROOT, 'r5-to-r6-delta-contract.json'), delta);

process.stdout.write(`${JSON.stringify({
  status: 'PASS',
  r5VideoSha256: baseline.files.video.sha256,
  durationSec: baseline.durationSec,
  directorFindingsMapped: feedback.findingCount,
  baselineRoot: BASELINE_ROOT,
}, null, 2)}\n`);
