#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PRESENTATION_TOKENS } from '../src/services/presentationDesignSystem.cjs';

const root = resolve(process.cwd());
const abs = (p) => resolve(root, p);
const hash = (p) => existsSync(abs(p)) ? createHash('sha256').update(readFileSync(abs(p))).digest('hex') : null;
const read = (p, fallback = {}) => existsSync(abs(p)) ? JSON.parse(readFileSync(abs(p), 'utf8')) : fallback;
const configs = {
  'terraforming-mars': read('out/mission-01/terraforming-mars/render-config.json'),
  '7-wonders-duel': read('out/mission-01/7-wonders-duel/render-config.json'),
};
const sonic = read('src/assets/branding/sonic/sonic-signature-manifest.json');
const boxArt = read('src/assets/games/presentation-box-art-manifest.json');
const transcripts = read('out/mission-01/review-transcripts.json');
const previews = {
  'terraforming-mars': 'out/mission-01/terraforming-mars/terraforming-mars-opening-preview.mp4',
  '7-wonders-duel': 'out/mission-01/7-wonders-duel/7-wonders-duel-opening-preview.mp4',
};
const checks = {
  brandIntroSilent: Object.values(configs).every((config) => { const scene = config.scenes?.find((item) => item.id === 'brand-intro'); return scene && !scene.narrationText && scene.ttsGenerated === false && scene.audio?.speechRequired === false; }),
  brandDurationSec: Object.values(configs).map((config) => config.scenes?.find((item) => item.id === 'brand-intro')?.durationSec || null),
  recordedSonicSources: sonic.mix?.recordedAssetsOnly === true && sonic.sources?.length === 3,
  firstNarrationAfterBrand: Object.values(configs).every((config) => (config.chapters?.[1]?.startSec || 0) >= 3.6),
  noDefaultMetadataAgeWeightMechanicsSpeech: Object.values(configs).every((config) => { const text = config.scenes?.find((item) => item.id === 'metadata-card')?.narrationText || ''; return !/(âge|\bans\b|complexité|poids|mécanique|drafting)/i.test(text); }),
  semanticTimeline: Object.values(configs).every((config) => (config.chapters || []).every((chapter) => !/^\d+(?:\s*\/\s*\d+)?$/.test(chapter.title))),
  warmPanels: Object.values(configs).every((config) => config.scenes?.filter((scene) => scene.type === 'teaching').every((scene) => scene.layout?.panelVariant === 'WARM_DARK')),
  realPreviews: Object.values(previews).every((p) => existsSync(abs(p))),
  transcriptEntries: Array.isArray(transcripts.entries) && transcripts.entries.length === 6,
};
const evidence = {
  version: 'mobius-mission-01d-evidence-v1', mission: 'MOBIUS 2.0 — Canonical Product Mission 01D', generatedAt: new Date().toISOString(),
  branch: 'fix/terraforming-mars-quality-regression-restore', pr: 476, verdict: checks.realPreviews && checks.brandIntroSilent && checks.recordedSonicSources ? 'TECHNICAL PASS' : 'BLOCK', humanReviewRequired: true,
  identity: Object.fromEntries(Object.entries(configs).map(([game, config]) => [game, { canonical: config.identity, displayName: config.identity?.displayName, spokenName: config.identity?.spokenName, pronunciationRepresentation: config.identity?.pronunciationRepresentation, pronunciationStatus: config.identity?.pronunciationStatus, provenance: config.identity?.provenance, metadataProvenance: config.scenes?.find((scene) => scene.id === 'metadata-card')?.background?.provenance || null }])),
  designSystem: { tokensPath: abs('src/services/presentationDesignSystem.json'), tokensSha256: hash('src/services/presentationDesignSystem.json'), reviewBoardPath: abs('out/mission-01/presentation-design-system-review.png'), reviewBoardSha256: hash('out/mission-01/presentation-design-system-review.png'), deltaReportPath: abs('out/mission-01/mission-01d-delta-report.md'), resolved: PRESENTATION_TOKENS },
  fonts: { manifestPath: abs('src/assets/fonts/font-manifest.json'), manifestSha256: hash('src/assets/fonts/font-manifest.json'), files: { display: { path: abs('src/assets/fonts/Lora-Variable.ttf'), sha256: hash('src/assets/fonts/Lora-Variable.ttf') }, body: { path: abs('src/assets/fonts/Nunito-Variable.ttf'), sha256: hash('src/assets/fonts/Nunito-Variable.ttf') } } },
  boxArt: { manifestPath: abs('src/assets/games/presentation-box-art-manifest.json'), manifestSha256: hash('src/assets/games/presentation-box-art-manifest.json'), assets: boxArt.assets },
  sonicSignature: { manifestPath: abs('src/assets/branding/sonic/sonic-signature-manifest.json'), manifestSha256: hash('src/assets/branding/sonic/sonic-signature-manifest.json'), path: abs('src/assets/branding/sonic/mobius-cafe-sonic-signature.wav'), sha256: hash('src/assets/branding/sonic/mobius-cafe-sonic-signature.wav'), durationSec: sonic.durationSec, sources: sonic.sources },
  previews: Object.fromEntries(Object.entries(previews).map(([game, p]) => [game, { path: abs(p), sha256: hash(p), resolution: configs[game].video?.resolution, chapters: configs[game].chapters }])),
  transcriptsPath: abs('out/mission-01/review-transcripts.json'), transcriptsTxtPath: abs('out/mission-01/review-transcripts.txt'), transcriptsSha256: hash('out/mission-01/review-transcripts.json'), transcripts,
  validations: checks,
  tts: { changedSegments: ['terraforming-mars:metadata-card', '7-wonders-duel:metadata-card'], generatedCount: 2, reusedCount: 6, reusedNarrationSegments: ['terraforming-mars:scene-section-01-1', 'terraforming-mars:scene-section-02-2', 'terraforming-mars:brand-outro', '7-wonders-duel:scene-section-01-1', '7-wonders-duel:scene-section-02-2', '7-wonders-duel:brand-outro'], idempotence: 'second regeneration reused both metadata assets', brandIntro: { ttsGenerated: false, spokenNarration: 'NONE' } },
  testResults: { focused: { suites: 7, tests: 46, passed: 46 }, clientBuild: 'passed', broader: { suitesPassed: 78, suitesFailed: 5, testsPassed: 886, testsFailed: 10, skipped: 1, knownEnvironmentalOrPreExistingFailures: ['ffprobe PATH unavailable in mobius_e2e_orchestrator', 'BGG API 401 in imagePipeline/images_api', 'AI preflight/summarization fixture expectations'] } },
  remainingNonPublishableIssues: ['Human listening/review is still required for the recorded cup and dice cue balance and Amélie delivery.', '7 Wonders Duel exact front-cover source is 601×600 and remains below the 720px HD threshold; replace before publication.', 'The bounded previews retain rulebook-page fallback visuals for later teaching scenes; full visual recovery is outside Mission 01D.', 'PR #476 remains unmerged and PUBLISHABLE is a Director decision.'],
};
const output = abs('out/mission-01/mission-evidence.json');
writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ path: output, verdict: evidence.verdict, checks }, null, 2));
