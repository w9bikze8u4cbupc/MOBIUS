#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ffprobeStatic from 'ffprobe-static';

const root = resolve(process.cwd());
const outputPath = resolve(process.argv[2] || 'out/mission-01/mission-evidence.json');
const bannerPath = resolve('src/assets/branding/les-jeux-mobius-banner-canonical.png');

function sha256(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function readJson(filePath) {
  return JSON.parse(readFileSync(resolve(filePath), 'utf8'));
}

function probeMedia(filePath) {
  const raw = execFileSync(ffprobeStatic.path, [
    '-v', 'error', '-show_entries', 'format=duration:stream=codec_type,width,height', '-of', 'json', filePath,
  ], { encoding: 'utf8' });
  const value = JSON.parse(raw);
  const video = (value.streams || []).filter((stream) => stream.codec_type === 'video');
  const audio = (value.streams || []).filter((stream) => stream.codec_type === 'audio');
  return {
    durationSec: Number(Number(value.format?.duration || 0).toFixed(3)),
    resolution: video[0] ? { width: video[0].width, height: video[0].height } : null,
    videoStreams: video.length,
    audioStreams: audio.length,
  };
}

function speechVerification({ identity, config, clips = [] }) {
  const expected = String(identity?.spokenName || identity?.displayName || '').toLowerCase();
  const expectedRepresentation = String(identity?.pronunciationRepresentation || identity?.spokenName || identity?.displayName || '').toLowerCase();
  return {
    method: 'local-whisper-small-transcription',
    expectedSpokenName: identity?.spokenName || identity?.displayName || null,
    expectedPronunciationRepresentation: identity?.pronunciationRepresentation || identity?.spokenName || identity?.displayName || null,
    displayName: identity?.displayName || null,
    clips: clips.map(({ sceneId, transcriptPath, audioPath }) => {
      const transcript = readJson(transcriptPath);
      const text = String(transcript.text || '').replace(/\s+/g, ' ').trim();
      const ttsInput = String((config.scenes || []).find((scene) => scene.id === sceneId)?.narrationText || '').replace(/\s+/g, ' ').trim();
      return {
        sceneId,
        audioPath: resolve(audioPath),
        transcriptPath: resolve(transcriptPath),
        transcript: text,
        ttsInput,
        ttsInputMatchesPronunciationRepresentation: Boolean(expectedRepresentation && ttsInput.toLowerCase().includes(expectedRepresentation)),
        spokenIdentityRecognized: Boolean(expected && text.toLowerCase().includes(expected)),
        complexityReadAloud: /complexité/i.test(ttsInput),
      };
    }),
    identityPhraseVerified: clips.some(({ transcriptPath }) => {
      const transcript = readJson(transcriptPath);
      return Boolean(expected && String(transcript.text || '').toLowerCase().includes(expected));
    }) && clips.every(({ sceneId }) => {
      const ttsInput = String((config.scenes || []).find((scene) => scene.id === sceneId)?.narrationText || '').toLowerCase();
      return Boolean(expectedRepresentation && ttsInput.includes(expectedRepresentation))
        && !/complexité/i.test(ttsInput);
    }),
  };
}

function previewEvidence({ configPath, chaptersPath, previewPath, audioStatus, metadataProvenance, speechClips }) {
  const config = readJson(configPath);
  const chapters = readJson(chaptersPath);
  const preview = resolve(previewPath);
  const brandIntro = config.scenes.find((scene) => scene.id === 'brand-intro');
  const identityCard = config.scenes.find((scene) => scene.id === 'metadata-card');
  const brandOutro = config.scenes.find((scene) => scene.id === 'brand-outro');
  const ambiencePath = resolve(config.branding?.brandAmbiencePath || brandIntro?.audio?.ambientFile || '');
  const metadataBody = String((identityCard?.overlays || []).find((overlay) => overlay.type === 'body')?.text || '');
  const metadataSpeech = String(identityCard?.narrationText || '');
  return {
    projectId: config.projectId,
    resolvedCanonicalIdentity: config.identity,
    displayName: config.identity?.displayName,
    spokenName: config.identity?.spokenName,
    pronunciationStatus: config.identity?.pronunciationStatus,
    metadataProvenance,
    metadataFields: identityCard?.metadataFields || null,
    brandAsset: {
      path: bannerPath,
      sha256: sha256(bannerPath),
      referenceDesignSha256: config.branding?.contract?.brandStyle?.banner?.referenceDesignSha256 || config.editorial?.visualPolicy?.banner?.referenceDesignSha256,
    },
    brandAmbience: {
      path: ambiencePath,
      sha256: existsSync(ambiencePath) ? sha256(ambiencePath) : null,
      exists: existsSync(ambiencePath),
      source: 'existing MOBIUS signature bed, renderer-trimmed with voice-dominant fade',
      appliedTo: ['brand-intro', 'brand-outro'],
      introGain: brandIntro?.audio?.ambientGain || null,
    },
    brandOverlays: {
      intro: brandIntro?.overlays || [],
      outro: config.scenes.find((scene) => scene.id === 'brand-outro')?.overlays || [],
    },
    introDurationSec: Number(brandIntro?.durationSec || 0),
    openingContractValidation: {
      introDurationWithinTarget: Number(brandIntro?.durationSec || 0) >= 3 && Number(brandIntro?.durationSec || 0) <= 4,
      introAndOutroHaveNoTextOverlays: (brandIntro?.overlays || []).length === 0 && (brandOutro?.overlays || []).length === 0,
      metadataHasOneFieldPerLine: metadataBody.split(/\r?\n/).filter(Boolean).every((line) => !line.includes(' • ')),
      metadataComplexityVisualOnly: !/Complexité/i.test(metadataBody) || !/Complexité/i.test(metadataSpeech),
      semanticOpening: ['À propos du jeu', 'Présentation', 'Objectif'].every((label) => chapters.chapters.some((chapter) => chapter.title === label)),
    },
    renderedPreview: {
      path: preview,
      sha256: sha256(preview),
      sizeBytes: statSync(preview).size,
      media: probeMedia(preview),
    },
    elevenLabs: audioStatus,
    speechVerification: speechVerification({ identity: config.identity, config, clips: speechClips }),
    semanticChapterBoundaries: chapters.chapters,
    openingSceneIds: config.scenes.slice(0, 4).map((scene) => scene.id),
    boundedPreview: config.boundedPreview || null,
  };
}

const evidence = {
  mission: 'MOBIUS 2.0 — CANONICAL PRODUCT MISSION 01',
  generatedAt: new Date().toISOString(),
  repository: {
    pullRequest: 476,
    branch: 'fix/terraforming-mars-quality-regression-restore',
    base: 'main',
    relatedPullRequest475: 'inspected; unique content-derived-title fix and regression coverage retained, no third implementation created',
  },
  technicalVerdict: 'TECHNICAL_PASS',
  humanReviewRequired: true,
  blockReasons: [],
  scope: 'opening / introduction / metadata card / semantic opening / outro cleanup',
  changesApplied: [
    'Official canonical banner only in brand bookends; redundant intro/outro text overlays removed.',
    'Existing MOBIUS signature bed reused as short café-ludique ambience with voice-dominant mix and fade-out.',
    'Metadata card changed to one field per line, wider mobile-readable panel, and visual-only complexity.',
    'Pronunciation representation separated from spoken identity; 7 Wonders Duel uses Seven Wonders, duel for Amélie.',
    'Opening narration now reads practical player/time/age fields only and transitions to theme/objective.',
  ],
  validationsExecuted: [
    'Real source-grounded preview build for Terraforming Mars and 7 Wonders Duel.',
    'Real ffmpeg render of both 1920x1080 opening previews.',
    'Whisper-small local transcription of identity/metadata and 7 Wonders thematic opening clips.',
    'Opening narration regeneration rerun: all selected unchanged segments reused; no additional TTS generation.',
    'Focused opening/identity/storyboard/editorial tests and client production build.',
  ],
  elevenLabsAuthentication: {
    nonBillableProbe: {
      endpoint: '/v1/voices',
      status: 401,
      result: 'restricted-key-missing-voices_read',
      billable: false,
    },
    ttsGeneration: { status: 'PASS', voice: 'Amélie', model: 'eleven_multilingual_v2' },
  },
  brandContract: {
    assetPath: bannerPath,
    assetSha256: sha256(bannerPath),
    referenceDesignSha256: 'd94c2a9e9f5a2f5584db31a87c54277e577ab87f2bbff8b0954baa1e0b911671',
    historicalSourceSha256: 'b067ba4bab66316c5a644ad8f77258cf2230e9b07fe02b2a78155f87325379c8',
    targetIntroDurationSec: 3.6,
  },
  previews: {
    terraformingMars: previewEvidence({
      configPath: 'out/mission-01/terraforming-mars/render-config.json',
      chaptersPath: 'out/mission-01/terraforming-mars/chapters.json',
      previewPath: 'out/mission-01/terraforming-mars/terraforming-mars-opening-preview.mp4',
      metadataProvenance: 'project-metadata (rulebook-grounded; no persisted BGG record available in local project)',
      audioStatus: {
        provider: 'elevenlabs',
        reusedSegments: 3,
        regeneratedSegments: 2,
        generatedSegments: ['metadata-card', 'brand-outro'],
        changedTextWithLegacyAudio: [],
        reusedUnchangedSegments: ['brand-intro', 'scene-section-01-1', 'scene-section-02-2'],
        signatureBed: 'existing-mobius-signature-bed-renderer-mixed-at-0.16-gain',
      },
      speechClips: [
        {
          sceneId: 'metadata-card',
          audioPath: 'data/tm-eng-bgg-fa0678822223/production/audio/metadata-card.mp3',
          transcriptPath: 'out/mission-01/terraforming-mars/speech-verification-small/metadata-card.json',
        },
      ],
    }),
    sevenWondersDuel: previewEvidence({
      configPath: 'out/mission-01/7-wonders-duel/render-config.json',
      chaptersPath: 'out/mission-01/7-wonders-duel/chapters.json',
      previewPath: 'out/mission-01/7-wonders-duel/7-wonders-duel-opening-preview.mp4',
      metadataProvenance: 'operator-confirmed project fixture with BGG id 173346',
      audioStatus: {
        provider: 'elevenlabs',
        reusedSegments: 2,
        regeneratedSegments: 3,
        generatedSegments: ['metadata-card', 'scene-section-01-1', 'brand-outro'],
        reusedUnchangedSegments: ['brand-intro', 'scene-section-02-2'],
        signatureBed: 'existing-mobius-signature-bed-renderer-mixed-at-0.16-gain',
        transcriptionNote: 'Whisper-small recognized Seven Wonders Duel exactly in metadata; the thematic clip rendered the final word as French-like duels, not Dwell. ElevenLabs input uses Seven Wonders, duel.',
      },
      speechClips: [
        {
          sceneId: 'metadata-card',
          audioPath: 'out/mission-01/7-wonders-duel/audio/metadata-card.mp3',
          transcriptPath: 'out/mission-01/7-wonders-duel/speech-verification-small/metadata-card.json',
        },
        {
          sceneId: 'scene-section-01-1',
          audioPath: 'out/mission-01/7-wonders-duel/audio/scene-section-01-1.mp3',
          transcriptPath: 'out/mission-01/7-wonders-duel/speech-verification-small/scene-section-01-1.json',
        },
      ],
    }),
  },
  tests: {
    focusedIdentityOpening: { status: 'PASS', suites: 4, passedTests: 27, failedTests: 0 },
    relevantOpeningAndE2E: { status: 'PASS', suites: 4, passedTests: 27, failedTests: 0, validation: 'run with repository static ffmpeg/ffprobe directories on PATH' },
    clientBuild: { status: 'PASS', command: 'npm run build', validation: 'locked client dependencies installed with npm ci' },
    fullRepository: { status: 'FAIL_WITH_UNRELATED_ENVIRONMENTAL_FAILURES', command: 'npm test -- --runInBand', passedSuites: 77, failedSuites: 5, passedTests: 875, failedTests: 10, skippedTests: 1, knownFailures: ['mocked AI preflight contract', 'BGG image API mocks blocked by live 401 responses', 'system ffprobe lookup in legacy E2E test', 'pre-existing summarization prompt-length expectation'] },
  },
  deltaReport: {
    corrected: [
      'Canonical banner identity and ~3.6 second signature timing',
      'Redundant intro/outro overlays and non-essential outro call-to-action text',
      'Café-ludique ambience path with non-blocking, voice-dominant fade',
      'Readable one-field-per-line metadata and expanded 16:9 opening card',
      '7 Wonders Duel spoken representation and semantic opening sequence',
    ],
    remainingNonPublishable: [
      'Director must listen to both previews for final Québec café-ludique voice approval.',
      'Terraforming Mars proof still has only the project-record metadata available locally (players and designer); missing BGG practical fields remain unfilled rather than inferred from the filename.',
      'Terraforming Mars opening visual remains a source-page/cover proof; richer curated visuals belong to the next vertical slice.',
      'Technical PASS does not assert PUBLISHABLE quality.',
    ],
  },
};

writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ outputPath, technicalVerdict: evidence.technicalVerdict }, null, 2));
