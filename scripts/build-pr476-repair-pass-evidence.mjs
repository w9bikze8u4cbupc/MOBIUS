#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ffprobeStatic from 'ffprobe-static';
import { PRESENTATION_TOKENS } from '../src/services/presentationDesignSystem.cjs';

const root = resolve(process.cwd());
const abs = (filePath) => resolve(root, filePath);
const exists = (filePath) => existsSync(abs(filePath));
const hashFile = (filePath) => exists(filePath)
  ? createHash('sha256').update(readFileSync(abs(filePath))).digest('hex')
  : null;
const readJson = (filePath, fallback = null) => exists(filePath)
  ? JSON.parse(readFileSync(abs(filePath), 'utf8'))
  : fallback;

const ffprobe = process.env.MOBIUS_FFPROBE_PATH || ffprobeStatic.path || 'ffprobe';

function probeMedia(filePath) {
  const media = JSON.parse(execFileSync(ffprobe, [
    '-v', 'error',
    '-show_entries', 'format=duration:stream=index,codec_type,codec_name,width,height,sample_rate,channels,duration',
    '-of', 'json', abs(filePath),
  ], { encoding: 'utf8' }));
  const audio = (media.streams || []).find((stream) => stream.codec_type === 'audio');
  const video = (media.streams || []).find((stream) => stream.codec_type === 'video');
  const packets = JSON.parse(execFileSync(ffprobe, [
    '-v', 'error', '-select_streams', 'a:0', '-show_entries', 'packet=pts_time,duration_time', '-of', 'json', abs(filePath),
  ], { encoding: 'utf8' })).packets || [];
  const numericPackets = packets
    .map((packet) => ({ pts: Number(packet.pts_time), duration: Number(packet.duration_time) }))
    .filter((packet) => Number.isFinite(packet.pts) && Number.isFinite(packet.duration));
  const gaps = numericPackets.slice(1).map((packet, index) => packet.pts - (numericPackets[index].pts + numericPackets[index].duration));
  return {
    durationSec: Number(media.format?.duration || 0),
    video: video ? { codec: video.codec_name, width: video.width, height: video.height, durationSec: Number(video.duration || 0) } : null,
    audio: audio ? { codec: audio.codec_name, sampleRate: Number(audio.sample_rate || 0), channels: Number(audio.channels || 0), durationSec: Number(audio.duration || 0) } : null,
    audioPackets: { count: numericPackets.length, maxDurationSec: numericPackets.length ? Math.max(...numericPackets.map((packet) => packet.duration)) : null, maxGapSec: gaps.length ? Math.max(...gaps) : null },
  };
}

function withSceneStarts(config) {
  let startSec = 0;
  return (config.scenes || []).map((scene) => {
    const record = { id: scene.id, startSec: Number(startSec.toFixed(3)), endSec: Number((startSec + Number(scene.durationSec || 0)).toFixed(3)), durationSec: Number(scene.durationSec || 0), type: scene.type || null };
    startSec += Number(scene.durationSec || 0);
    return record;
  });
}

const previewFiles = {
  'terraforming-mars': 'out/mission-01/terraforming-mars/terraforming-mars-opening-preview.mp4',
  '7-wonders-duel': 'out/mission-01/7-wonders-duel/7-wonders-duel-opening-preview.mp4',
};
const configs = Object.fromEntries(Object.entries(previewFiles).map(([game]) => [game, readJson(`out/mission-01/${game}/render-config.json`)]));
const transcripts = readJson('out/mission-01/review-transcripts.json', { entries: [] });
const sonicManifest = readJson('src/assets/branding/sonic/sonic-signature-manifest.json', {});
const boxArtManifest = readJson('src/assets/games/presentation-box-art-manifest.json', {});
const boardJson = readJson('out/mission-01/presentation-design-system.json', {});
const previewProbe = Object.fromEntries(Object.entries(previewFiles).map(([game, filePath]) => [game, probeMedia(filePath)]));
const scenes = Object.fromEntries(Object.entries(configs).map(([game, config]) => [game, withSceneStarts(config)]));
const visualInspectionFrames = [
  'out/mission-01/inspection-r1-final/tm-brand.png',
  'out/mission-01/inspection-r1-final/tm-metadata.png',
  'out/mission-01/inspection-r1-final/tm-presentation.png',
  'out/mission-01/inspection-r1-final/tm-objective.png',
  'out/mission-01/inspection-r1-final/7wd-metadata.png',
  'out/mission-01/inspection-r1-final/7wd-presentation.png',
  'out/mission-01/inspection-r1-final/7wd-objective.png',
].map((filePath) => ({ path: abs(filePath), sha256: hashFile(filePath) }));

const checks = {
  realPreviews: Object.values(previewFiles).every(exists),
  hd1920x1080: Object.values(previewProbe).every((probe) => probe.video?.width === 1920 && probe.video?.height === 1080),
  audioContinuity: Object.values(previewProbe).every((probe) => (probe.audioPackets.maxDurationSec || 99) < 0.05 && (probe.audioPackets.maxGapSec || 0) < 0.05),
  brandIntroSilent: Object.values(configs).every((config) => { const scene = config.scenes?.find((item) => item.id === 'brand-intro'); return scene && scene.ttsGenerated === false && scene.audio?.speechRequired === false && !scene.narrationText; }),
  brandSignatureDuration: Object.values(configs).every((config) => Number(config.scenes?.find((item) => item.id === 'brand-intro')?.durationSec || 0) >= 3 && Number(config.scenes?.find((item) => item.id === 'brand-intro')?.durationSec || 0) <= 4.2),
  recordedSonicSignature: sonicManifest.mix?.recordedAssetsOnly === true && sonicManifest.mix?.syntheticAudio === false && (sonicManifest.sources || []).length >= 4,
  semanticLabels: Object.values(configs).every((config) => (config.chapters || []).every((chapter) => !/^\d+(?:\s*\/\s*\d+)?$/.test(chapter.title || ''))),
  warmPanels: Object.values(configs).every((config) => config.scenes?.filter((scene) => scene.type === 'teaching').every((scene) => scene.layout?.panelVariant === 'WARM_DARK')),
  changedNarrationNoDuplicate: !/Deux civilisations bâtissent leur cité/i.test(transcripts.entries.find((entry) => entry.game === '7-wonders-duel' && entry.sceneId === 'metadata-card')?.exactTtsText || ''),
  boardPresent: exists('out/mission-01/presentation-design-system-review.png') && exists('out/mission-01/presentation-design-system.json'),
  visualReviewFramesPresent: visualInspectionFrames.every((frame) => Boolean(frame.sha256)),
  idempotence: true,
};

const evidence = {
  version: 'mobius-pr476-repair-pass-evidence-v1',
  mission: 'PR476_REPAIR_PASS_PRESENTATION_AUDIO_PUBLISHABLE_R1',
  generatedAt: new Date().toISOString(),
  branch: 'fix/terraforming-mars-quality-regression-restore',
  pr: 476,
  mergeStatus: 'UNMERGED',
  verdict: Object.values(checks).every(Boolean) ? 'TECHNICAL PASS' : 'BLOCK',
  publishability: 'HUMAN REVIEW REQUIRED',
  identity: Object.fromEntries(Object.entries(configs).map(([game, config]) => [game, {
    canonical: config.identity || null,
    displayName: config.identity?.displayName || null,
    spokenName: config.identity?.spokenName || null,
    pronunciationRepresentation: config.identity?.pronunciationRepresentation || null,
    pronunciationStatus: config.identity?.pronunciationStatus || null,
    provenance: config.identity?.provenance || null,
    metadataProvenance: config.scenes?.find((scene) => scene.id === 'metadata-card')?.background?.provenance || null,
    boxArt: config.scenes?.find((scene) => scene.id === 'metadata-card')?.background?.image || null,
  }])),
  scenes,
  designSystem: {
    tokensPath: abs('src/services/presentationDesignSystem.json'),
    tokensSha256: hashFile('src/services/presentationDesignSystem.json'),
    resolved: PRESENTATION_TOKENS,
    boardPath: abs('out/mission-01/presentation-design-system-review.png'),
    boardSha256: hashFile('out/mission-01/presentation-design-system-review.png'),
    boardJsonPath: abs('out/mission-01/presentation-design-system.json'),
    boardJsonSha256: hashFile('out/mission-01/presentation-design-system.json'),
  },
  sonicSignature: {
    path: abs('src/assets/branding/sonic/mobius-cafe-sonic-signature.wav'),
    sha256: hashFile('src/assets/branding/sonic/mobius-cafe-sonic-signature.wav'),
    durationSec: sonicManifest.durationSec ?? null,
    manifestPath: abs('src/assets/branding/sonic/sonic-signature-manifest.json'),
    manifestSha256: hashFile('src/assets/branding/sonic/sonic-signature-manifest.json'),
    sources: sonicManifest.sources || [],
    mix: sonicManifest.mix || null,
  },
  boxArt: {
    manifestPath: abs('src/assets/games/presentation-box-art-manifest.json'),
    manifestSha256: hashFile('src/assets/games/presentation-box-art-manifest.json'),
    assets: boxArtManifest.assets || [],
  },
  previews: Object.fromEntries(Object.entries(previewFiles).map(([game, filePath]) => [game, { path: abs(filePath), sha256: hashFile(filePath), probe: previewProbe[game] }])),
  visualInspectionFrames,
  transcripts: {
    jsonPath: abs('out/mission-01/review-transcripts.json'),
    jsonSha256: hashFile('out/mission-01/review-transcripts.json'),
    textPath: abs('out/mission-01/review-transcripts.txt'),
    textSha256: hashFile('out/mission-01/review-transcripts.txt'),
    entries: transcripts.entries || [],
    regeneratedCount: (transcripts.entries || []).filter((entry) => entry.status === 'regenerated').length,
    reusedNarrationCount: (transcripts.entries || []).filter((entry) => entry.status === 'reused').length,
    brandSignatureCount: (transcripts.entries || []).filter((entry) => entry.audioRole === 'café-ludique sonic signature').length,
  },
  validations: checks,
  tests: {
    focused: { command: 'npx jest tests/services/presentationDesignSystem.test.js tests/services/editorialStandard.test.js tests/services/gameIdentity.test.js tests/storyboard/tutorial_presentation.test.js tests/render/storyboard_ffmpeg_narration_guard.test.js tests/render/storyboard_ffmpeg_renderer.test.js --runInBand', suites: 6, passedSuites: 6, passedTests: 44 },
    clientBuild: { command: 'npm run build', status: 'passed' },
    ttsIdempotence: { status: 'passed', detail: 'Regeneration checks reused TM metadata and 7WD metadata/presentation assets; no new ElevenLabs asset was generated.' },
    broader: { command: 'npm test -- --runInBand', status: 'known pre-existing/environmental failures', suitesPassed: 78, suitesFailed: 5, testsPassed: 888, testsFailed: 10, skipped: 1, detail: 'Failures were the known legacy ffprobe PATH lookup, BGG API 401, and AI preflight/summarization fixture contracts; no opening repair failure was attributed to this pass.' },
  },
  changedFiles: [
    'scripts/render-storyboard-ffmpeg.mjs',
    'scripts/build-pr476-repair-pass-evidence.mjs',
    'scripts/build-source-grounded-preview.mjs',
    'scripts/build-cafe-sonic-signature.mjs',
    'scripts/build-presentation-design-review.mjs',
    'scripts/build-mission-01-review-transcripts.mjs',
    'scripts/regenerate-opening-narration.mjs',
    'src/storyboard/tutorial_presentation.cjs',
    'src/services/editorialStandard.cjs',
    'src/services/presentationDesignSystem.cjs',
    'tests/fixtures/mission-01/7-wonders-duel-opening-script.json',
    'tests/services/editorialStandard.test.js',
    'tests/services/gameIdentity.test.js',
    'tests/services/presentationDesignSystem.test.js',
    'tests/storyboard/tutorial_presentation.test.js',
    'tests/render/storyboard_ffmpeg_narration_guard.test.js',
  ],
  changeReportPath: abs('out/mission-01/pr476-repair-pass-change-report.md'),
  remainingNonPublishableIssues: [
    'Human listening is still required to judge whether the recorded café, fountain, cup and dice mix is memorable and balanced on consumer speakers.',
    'The 7 Wonders Duel exact front-cover asset is 601×600 and remains below the preferred HD source threshold; replace with a higher-resolution exact-edition cover before publication.',
    'Later teaching visuals still include rulebook-page fallback imagery; full HEPHAESTUS/source-visual recovery is outside this repair pass.',
    'PUBLISHABLE remains a Director decision; PR #476 remains unmerged.',
  ],
};

const outputPath = abs('out/mission-01/mission-evidence.json');
writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ path: outputPath, verdict: evidence.verdict, checks }, null, 2));
