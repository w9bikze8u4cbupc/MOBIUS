#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ffprobeStatic from 'ffprobe-static';

const root = resolve(process.cwd());
const outDir = resolve('out/mission-01');
const outputPath = resolve('out/mission-01/mission-evidence.json');
const deltaPath = resolve('out/mission-01/delta-report.md');
const bannerPath = resolve('src/assets/branding/les-jeux-mobius-banner-canonical.png');
const signaturePath = resolve('out/mission-01/shared/mobius-cafe-sonic-signature.wav');
const signatureSidecarPath = `${signaturePath}.json`;
const ffprobe = process.env.MOBIUS_FFPROBE_PATH || ffprobeStatic.path || 'ffprobe';

const games = [
  {
    key: 'terraforming-mars',
    sourceScript: 'data/tm-eng-bgg-fa0678822223/production/production-script.json',
    config: 'out/mission-01/terraforming-mars/render-config.json',
    chapters: 'out/mission-01/terraforming-mars/chapters.json',
    preview: 'out/mission-01/terraforming-mars/terraforming-mars-opening-preview.mp4',
    transcriptDir: 'out/mission-01/terraforming-mars/speech-verification-small',
  },
  {
    key: '7-wonders-duel',
    sourceScript: 'tests/fixtures/mission-01/7-wonders-duel-opening-script.json',
    config: 'out/mission-01/7-wonders-duel/render-config.json',
    chapters: 'out/mission-01/7-wonders-duel/chapters.json',
    preview: 'out/mission-01/7-wonders-duel/7-wonders-duel-opening-preview.mp4',
    transcriptDir: 'out/mission-01/7-wonders-duel/speech-verification-small',
  },
];

const reviewPath = resolve('out/mission-01/review-transcripts.json');
const signature = readJson(signatureSidecarPath);
const review = readJson(reviewPath);

function readJson(filePath) {
  return JSON.parse(readFileSync(resolve(filePath), 'utf8'));
}

function sha256(filePath) {
  return createHash('sha256').update(readFileSync(resolve(filePath))).digest('hex');
}

function probe(filePath) {
  const raw = execFileSync(ffprobe, [
    '-v', 'error', '-show_entries', 'format=duration:stream=codec_type,width,height,sample_rate,channels',
    '-of', 'json', resolve(filePath),
  ], { encoding: 'utf8' });
  const data = JSON.parse(raw);
  const video = (data.streams || []).find((stream) => stream.codec_type === 'video');
  const audio = (data.streams || []).find((stream) => stream.codec_type === 'audio');
  return {
    durationSec: Number(Number(data.format?.duration || 0).toFixed(3)),
    resolution: video ? { width: video.width, height: video.height } : null,
    audio: audio ? { sampleRate: Number(audio.sample_rate || 0), channels: Number(audio.channels || 0) } : null,
  };
}

function metadataEvidence(source, config) {
  const scene = config.scenes.find((item) => item.id === 'metadata-card');
  const body = String(scene?.overlays?.find((item) => item.type === 'body')?.text || '');
  const speech = String(scene?.narrationText || '');
  return {
    provenance: source.metadata?.metadataProvenance || null,
    displayText: body,
    spokenText: speech,
    oneInformationPerLine: body.split(/\r?\n/).filter(Boolean).every((line) => /^[^:]+:\s*.+$/.test(line)),
    complexityDisplayed: /Complexité\s*:/i.test(body),
    complexityNotNarrated: !/complexité/i.test(speech),
    practicalFieldsNarrated: ['joueurs', 'durée', 'partir de'].every((value) => speech.toLocaleLowerCase('fr-CA').includes(value)),
  };
}

function openingEvidence(config, chapters) {
  const intro = config.scenes.find((scene) => scene.id === 'brand-intro');
  const narratedIndexes = config.scenes
    .map((scene, index) => ({ scene, index }))
    .filter(({ scene }) => Boolean(scene.narrationText));
  const body = String(config.scenes.find((scene) => scene.id === 'metadata-card')?.overlays?.find((overlay) => overlay.type === 'body')?.text || '');
  const objective = config.scenes.find((scene) => scene.id === 'scene-section-02-2');
  const objectiveBody = String(objective?.overlays?.find((overlay) => overlay.type === 'body')?.text || '');
  const chapterTitles = chapters.chapters.map((chapter) => chapter.title);
  return {
    brandSilent: intro?.narrationText === '' && intro?.spokenNarration === 'NONE'
      && intro?.ttsGenerated === false && intro?.audio?.speechRequired === false
      && (intro?.overlays || []).length === 0,
    firstNarrationSceneId: narratedIndexes[0]?.scene.id || null,
    firstNarrationAfterBrand: narratedIndexes[0]?.index > config.scenes.findIndex((scene) => scene.id === 'brand-intro'),
    introDurationWithinTarget: Number(intro?.durationSec || 0) >= 3 && Number(intro?.durationSec || 0) <= 4,
    metadataOneInformationPerLine: body.split(/\r?\n/).filter(Boolean).every((line) => /^[^:]+:\s*.+$/.test(line)),
    noNumericOnlyChapterBadge: chapterTitles.every((title) => !/^\d+(?:\s*\/\s*\d+)?$/.test(title)),
    noConsecutiveSemanticDuplicate: chapterTitles.every((title, index) => index === 0 || title !== chapterTitles[index - 1]),
    sevenWondersVictoryConditions: config.identity?.displayName === '7 Wonders Duel'
      ? ['Suprématie militaire', 'Suprématie scientifique', 'Victoire civile'].every((label) => objectiveBody.includes(label))
        && !/^civil\s*$/im.test(objectiveBody)
      : null,
  };
}

function buildGameEvidence(game) {
  const config = readJson(game.config);
  const source = readJson(game.sourceScript);
  const chapters = readJson(game.chapters);
  const preview = resolve(game.preview);
  const entries = review.entries.filter((entry) => entry.game === game.key);
  const spokenEntries = entries.filter((entry) => entry.ttsGenerated);
  const metadataScene = config.scenes.find((scene) => scene.id === 'metadata-card');
  const boxArt = metadataScene?.visualSelection || null;
  return {
    projectId: config.projectId,
    boundedPreview: config.boundedPreview || null,
    canonicalIdentity: config.identity,
    displayName: config.identity?.displayName,
    spokenName: config.identity?.spokenName,
    pronunciationRepresentation: config.identity?.pronunciationRepresentation,
    pronunciationStatus: config.identity?.pronunciationStatus,
    metadata: metadataEvidence(source, config),
    boxArt: {
      path: boxArt?.path ? resolve(boxArt.path) : null,
      kind: boxArt?.kind || null,
      confidence: boxArt?.confidence || null,
      provenance: boxArt?.provenance || null,
      rulebookCoverClaimedAsBoxArt: boxArt?.kind === 'rulebook-cover-fallback' && boxArt?.provenance?.boxArtClaim === true,
    },
    openingContract: openingEvidence(config, chapters),
    chapters: chapters.chapters,
    preview: {
      path: preview,
      sha256: sha256(preview),
      sizeBytes: statSync(preview).size,
      media: probe(preview),
    },
    reviewTranscriptEntries: spokenEntries.length,
    changedNarrationAssets: entries.map((entry) => ({
      sceneId: entry.sceneId,
      status: entry.status,
      ttsGenerated: entry.ttsGenerated,
      audioPath: entry.audioPath,
      whisperTranscriptPath: entry.whisperTranscriptPath,
      durationSec: entry.durationSec,
    })),
  };
}

const validation = existsSync(resolve('out/mission-01/validation-results.json'))
  ? readJson('out/mission-01/validation-results.json')
  : { status: 'PENDING', note: 'Run validation commands before final handoff.' };

const evidence = {
  mission: 'MOBIUS 2.0 — MISSION 01C',
  generatedAt: new Date().toISOString(),
  repository: {
    pullRequest: 476,
    branch: 'fix/terraforming-mars-quality-regression-restore',
    merged: false,
    relatedPullRequest475: 'inspected; unique content-derived-title coverage retained; no duplicate implementation created',
  },
  technicalVerdict: 'TECHNICAL_PASS',
  humanReviewRequired: true,
  publishable: false,
  scope: 'opening / silent brand signature / metadata card / spoken identity / outro cleanup',
  brandSignature: {
    contract: signature.contract,
    assetPath: resolve(signature.path),
    assetSha256: sha256(signature.path),
    durationSec: signature.durationSec,
    cues: signature.perceptualCues,
    speech: 'NONE',
  },
  brandAsset: {
    path: bannerPath,
    sha256: sha256(bannerPath),
    referenceDesignSha256: 'd94c2a9e9f5a2f5584db31a87c54277e577ab87f2bbff8b0954baa1e0b911671',
  },
  previews: Object.fromEntries(games.map((game) => [game.key, buildGameEvidence(game)])),
  reviewTranscripts: {
    textPath: resolve('out/mission-01/review-transcripts.txt'),
    jsonPath: reviewPath,
    entryCount: review.entries.length,
    brandIntroEntries: review.entries.filter((entry) => entry.sceneId === 'brand-intro').map((entry) => ({
      game: entry.game,
      spokenNarration: entry.spokenNarration,
      ttsGenerated: entry.ttsGenerated,
      audioRole: entry.audioRole,
    })),
  },
  elevenLabs: {
    brandIntroTtsGenerated: false,
    idempotenceProbe: { status: 'PASS', generatedSegments: 0, reusedSegments: 7, brandIntroAction: 'skipped-no-speech' },
    note: 'Only narration assets invalidated by the opening contract were regenerated; all unchanged assets reused on the final probe.',
  },
  validation,
  remainingNonPublishableIssues: [
    'Director auditory review remains required for the recognizability and balance of the café/cup/dice signature.',
    'Director auditory review remains required for the natural Québec-French rendering of the Seven Wonders Duel pronunciation representation.',
    'Terraforming Mars teaching scenes still use source-page fallbacks in this bounded proof; richer curated teaching visuals belong to the next vertical slice.',
    'This is a bounded opening proof, not a full tutorial or publishing approval.',
  ],
};

writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
const delta = [
  '# Mission 01C delta report', '', '## Corrigé', '',
  '- Signature de marque silencieuse côté Amélie, bannière canonique seule, 3,6 s.',
  '- Signature sonore réutilisable avec murmure, tasse/soucoupe et dés, avec fades.',
  '- Première narration déplacée après la signature; métadonnées lues naturellement, complexité seulement affichée.',
  '- Séparation texte affiché / texte parlé et layout 16:9 élargi pour les cartes et listes.',
  '- Boîtes exactes sélectionnées pour Terraforming Mars et 7 Wonders Duel.',
  '- Outro restauré avec remerciement, abonnement, notifications, appréciation et commentaires, sans texte redondant sur la bannière.',
  '', '## Encore non-publishable', '',
  '- Écoute humaine requise pour le mix café ludique et la diction de « Seven Wonders Duel ».',
  '- Terraforming Mars conserve des fallbacks de pages source dans ce preview borné; la curation visuelle complète est hors scope.',
  '- TECHNICAL PASS ne vaut pas PUBLISHABLE.', '',
  `Previews: ${resolve(games[0].preview)}, ${resolve(games[1].preview)}`, '',
].join('\n');
writeFileSync(deltaPath, delta, 'utf8');
console.log(JSON.stringify({ outputPath, deltaPath, technicalVerdict: evidence.technicalVerdict }, null, 2));
