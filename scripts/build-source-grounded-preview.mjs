#!/usr/bin/env node

/**
 * Assemble a reviewed source-grounded script into the renderer contract used by
 * MOBIUS. The default is French Canadian with Les Jeux Mobius branded bookends.
 * Rules, visuals, and narration remain upstream reviewable artifacts; this
 * script validates and preserves their scene-level relationship for rendering.
 *
 * Usage:
 *   node scripts/build-source-grounded-preview.mjs \
 *     --script work/tutorial.json --page-dir work/pages --audio-dir work/audio \
 *     --out-config work/render-config.json --out-srt work/captions_fr.srt \
 *     --out-chapters work/youtube-chapters.json
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import ffmpegStatic from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';
import presentation from '../src/storyboard/tutorial_presentation.cjs';
import { loadSourceVisualCatalog, selectSourceVisual } from '../src/services/sourceVisualSelection.js';
import { DEFAULT_NARRATION_PRESET, formatOpeningMetadataNarration, getEditorialContract, getNarrationPreset } from '../src/services/editorialStandard.cjs';
import { resolveCanonicalGameIdentity, resolveCanonicalGameMetadata, sanitizeNarrationGameIdentity } from '../src/services/gameIdentity.cjs';

const {
  DEFAULT_BRAND,
  buildBrandIntro,
  buildBrandOutro,
  buildMetadataScene,
  buildTeachingScene,
  buildChapters,
} = presentation;

const AUDIO_EXTENSIONS = ['.wav', '.mp3', '.m4a', '.aac'];
const FFPROBE_BIN = process.env.MOBIUS_FFPROBE_PATH || ffprobeStatic.path || 'ffprobe';

function requiredArg(name) {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0 || !process.argv[index + 1]) throw new Error(`Missing required argument: --${name}`);
  return process.argv[index + 1];
}

function optionalArg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function escapeSrt(text) {
  return String(text || '').replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
}

function formatSrtTime(seconds) {
  const totalMilliseconds = Math.max(0, Math.round(seconds * 1000));
  const hours = Math.floor(totalMilliseconds / 3600000);
  const minutes = Math.floor((totalMilliseconds % 3600000) / 60000);
  const wholeSeconds = Math.floor((totalMilliseconds % 60000) / 1000);
  const milliseconds = totalMilliseconds % 1000;
  return [hours, minutes, wholeSeconds]
    .map((value) => String(value).padStart(2, '0'))
    .join(':') + `,${String(milliseconds).padStart(3, '0')}`;
}

function getDurationSeconds(audioPath) {
  const output = execFileSync(FFPROBE_BIN, [
    '-v', 'error', '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1', audioPath,
  ], { encoding: 'utf8' }).trim();
  const duration = Number(output);
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error(`Unable to determine audio duration for ${audioPath}`);
  }
  return duration;
}

function findAudioFile(audioDir, sceneId) {
  for (const extension of AUDIO_EXTENSIONS) {
    const path = join(audioDir, `${sceneId}${extension}`);
    if (existsSync(path)) return path;
  }
  return null;
}

function assertScene(scene, index) {
  if (!scene || typeof scene !== 'object') throw new Error(`Scene ${index + 1} must be an object`);
  for (const key of ['id', 'section', 'narration', 'on_screen_text', 'source_pages']) {
    if (!scene[key] || (Array.isArray(scene[key]) && scene[key].length === 0)) {
      throw new Error(`Scene ${index + 1} is missing required field '${key}'`);
    }
  }
  if (!Array.isArray(scene.source_pages) || !Number.isInteger(scene.source_pages[0])) {
    throw new Error(`Scene ${index + 1} must contain at least one numeric source page`);
  }
}

function resolveRulebookFallback(scene, pageDir) {
  const pagePath = join(pageDir, `page-${scene.source_pages[0]}.png`);
  if (!existsSync(pagePath)) throw new Error(`Scene ${scene.id} references missing page image: ${pagePath}`);
  return pagePath;
}

function addCaption(captions, cursor, text) {
  const durationSec = Number(captions.scene.durationSec || 0);
  const start = cursor.value;
  cursor.value += durationSec;
  captions.blocks.push([
    String(captions.blocks.length + 1),
    `${formatSrtTime(start)} --> ${formatSrtTime(cursor.value)}`,
    escapeSrt(text),
  ].join('\n'));
}

function requireAudio(audioDir, id, label) {
  const path = findAudioFile(audioDir, id);
  if (!path) throw new Error(`${label} requires narration audio named '${id}.wav', '.mp3', '.m4a', or '.aac' in ${audioDir}`);
  return path;
}

function selectIdentityBoxArt({ script, metadata, pageDir, explicitPath = null } = {}) {
  const candidates = [
    explicitPath,
    script?.identity?.boxArtPath,
    script?.identity?.boxArt,
    metadata?.boxArtPath,
    metadata?.boxArt,
  ].filter(Boolean).map((value) => resolve(String(value)));
  const selected = candidates.find((value) => existsSync(value));
  if (selected) {
    const manifestPath = resolve('src/assets/games/presentation-box-art-manifest.json');
    const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {};
    const gameKey = String(script?.game || script?.gameName || script?.identity?.displayName || '').toLowerCase().includes('7 wonders') ? '7-wonders-duel' : 'terraforming-mars';
    const quality = manifest.assets?.[gameKey] || null;
    return {
      path: selected,
      kind: 'exact-edition-box-art',
      confidence: 0.98,
      reason: 'confirmed operator/authoritative edition asset',
      provenance: { source: 'operator-confirmed-or-authoritative-metadata', edition: script?.identity?.edition || null, quality },
    };
  }
  const fallback = join(pageDir, 'page-1.png');
  if (!existsSync(fallback)) throw new Error(`No exact-edition box art and no rulebook fallback at ${fallback}`);
  return {
    path: fallback,
    kind: 'rulebook-cover-fallback',
    confidence: 0.2,
    reason: 'exact-edition box art unavailable; explicit fallback only',
    provenance: { source: 'rulebook-cover-fallback', boxArtClaim: false },
  };
}

function main() {
  const scriptPath = resolve(requiredArg('script'));
  const pageDir = resolve(requiredArg('page-dir'));
  const audioDir = resolve(requiredArg('audio-dir'));
  const outputConfigPath = resolve(requiredArg('out-config'));
  const outputSrtPath = resolve(requiredArg('out-srt'));
  const outputChaptersPath = resolve(optionalArg('out-chapters', join(dirname(outputConfigPath), 'youtube-chapters.json')));
  const projectId = optionalArg('project-id', 'source-grounded-tutorial');
  const width = Number(optionalArg('width', '1920'));
  const height = Number(optionalArg('height', '1080'));
  const fps = Number(optionalArg('fps', '30'));
  const language = optionalArg('language', DEFAULT_BRAND.language);
  const voiceName = optionalArg('voice-name', DEFAULT_BRAND.narration.voiceName);
  const narrationProvider = optionalArg('narration-provider', DEFAULT_BRAND.narration.provider);
  const narrationPreset = optionalArg('narration-preset', DEFAULT_NARRATION_PRESET);
  const voiceId = optionalArg('voice-id', process.env[DEFAULT_BRAND.narration.voiceIdEnv] || null);
  const canonicalBannerPath = resolve(process.cwd(), DEFAULT_BRAND.bannerPath);
  const bannerPath = optionalArg('brand-banner', canonicalBannerPath);
  const transitionAudioPath = optionalArg('brand-transition-audio', null);
  const brandAmbiencePath = optionalArg('brand-ambience-audio', transitionAudioPath);
  const narrationBedPath = optionalArg('narration-bed-audio', resolve('src/assets/branding/sonic/cafe-ambience-freesound-25813.mp3'));
  const assetManifestPath = optionalArg('asset-manifest', null);
  const visualQualityReportPath = optionalArg('visual-quality-report', null);
  const semanticVisualReportPath = optionalArg('semantic-visual-report', null);
  const requestedMaxScenes = Number(optionalArg('max-scenes', '0'));
  const maxScenes = Number.isInteger(requestedMaxScenes) && requestedMaxScenes > 0 ? requestedMaxScenes : null;
  const includeBrand = !hasFlag('no-brand');
  const preset = getNarrationPreset(narrationPreset);

  if (!['fr-CA', 'fr-FR', 'en'].includes(language)) {
    throw new Error(`Unsupported tutorial language '${language}'. Use fr-CA, fr-FR, or en.`);
  }

  const script = JSON.parse(readFileSync(scriptPath, 'utf8'));
  if (!Array.isArray(script.scenes) || script.scenes.length === 0) {
    throw new Error('The reviewed script must contain a non-empty scenes array');
  }
  const scriptScenes = maxScenes ? script.scenes.slice(0, maxScenes) : script.scenes;
  const requestedBoxArtPath = optionalArg('box-art', null);

  const cursor = { value: 0 };
  const captions = { blocks: [], scene: null };
  const scenes = [];
  const visualWarnings = [];
  const visualCatalog = assetManifestPath
    ? loadSourceVisualCatalog(resolve(assetManifestPath), {
      qualityReportPath: visualQualityReportPath ? resolve(visualQualityReportPath) : null,
      semanticReportPath: semanticVisualReportPath ? resolve(semanticVisualReportPath) : null,
    })
    : { manifestPath: null, assets: [], warnings: [] };
  visualWarnings.push(...(visualCatalog.warnings || []));
  const metadata = script.metadata && typeof script.metadata === 'object' ? script.metadata : {};
  const identity = resolveCanonicalGameIdentity({
    explicitOverride: script.identity || {},
    projectMetadata: { identity: script.identity || {}, gameName: script.game || script.gameName || projectId },
    bgg: metadata,
    rulebook: { gameName: script.sourceTitle, title: script.sourceTitle },
    filename: script.sourcePdf || projectId,
    locale: language === 'french' ? 'fr-CA' : language,
    sourceLanguage: script.sourceLanguage || 'en',
  });
  const canonicalMetadata = resolveCanonicalGameMetadata({ explicit: metadata, bgg: metadata });
  const metadataValues = Object.values(canonicalMetadata).filter((value) => value && value !== 'Not specified');

  if (includeBrand) {
    const intro = buildBrandIntro({
      bannerPath: bannerPath && existsSync(resolve(bannerPath)) ? resolve(bannerPath) : null,
      audio: {
        ...(brandAmbiencePath && existsSync(resolve(brandAmbiencePath))
          ? { ambientFile: resolve(brandAmbiencePath), ambientGain: 1.0, ambientFadeOutSec: 0.72 }
          : {}),
        provider: narrationProvider, providerVoiceId: voiceId, language, narrationPreset,
      },
    });
    intro.durationSec = getEditorialContract({ narrationPreset }).brandAudio.durationSec;
    scenes.push(intro);
  }

  const hasCanonicalMetadataScene = scriptScenes.some((scene) => scene?.id === 'metadata-card');
  if (!hasCanonicalMetadataScene) {
    const metadataAudio = requireAudio(audioDir, 'metadata-card', 'The metadata opening scene');
    const metadataSource = {
      id: 'metadata-card',
      section: 'À propos du jeu',
      narration: formatOpeningMetadataNarration({ identity, metadata: canonicalMetadata }),
      on_screen_text: [
        canonicalMetadata.playerCount && `Joueurs : ${canonicalMetadata.playerCount}`,
        canonicalMetadata.gameLength && `Durée : ${String(canonicalMetadata.gameLength).replace(/\bmin\b/gi, 'minutes')}`,
        canonicalMetadata.minimumAge && `Âge minimum : ${String(canonicalMetadata.minimumAge).replace(/\+?$/, '+')}`,
        canonicalMetadata.weight && `Complexité : ${String(canonicalMetadata.weight).replace(/\/?5$/, '')}/5`,
      ].filter(Boolean).join('\n') || metadataValues.slice(0, 4).map((value) => Array.isArray(value) ? value.join(', ') : value).join('\n'),
      source_pages: [1],
      source_pdf_sha256: script.sourcePdfSha256 || null,
      visual_intent: 'box cover and game overview',
      metadata_card: true,
    };
    const boxArt = selectIdentityBoxArt({ script, metadata, pageDir, explicitPath: requestedBoxArtPath });
    const metadataVisual = { path: boxArt.path, kind: boxArt.kind, confidence: boxArt.confidence, reason: boxArt.reason, provenance: boxArt.provenance, languageAudit: null };
    if (!metadataVisual.path) throw new Error('Metadata scene has no renderable visual');
    const metadataDuration = getDurationSeconds(metadataAudio);
    const metadataScene = buildMetadataScene({
      gameName: identity.displayName,
      identity,
      metadata: canonicalMetadata,
      narration: metadataSource.narration,
      sourcePages: metadataSource.source_pages,
      background: {
        image: metadataVisual.path,
        kind: metadataVisual.kind,
        confidence: metadataVisual.confidence,
        reason: metadataVisual.reason,
        languageAudit: metadataVisual.languageAudit || null,
        provenance: metadataVisual.provenance || null,
      },
      audio: {
        file: metadataAudio,
        ...(narrationBedPath && existsSync(resolve(narrationBedPath)) ? { ambientFile: resolve(narrationBedPath), ambientGain: 0.07, ambientFadeOutSec: 1.0 } : {}),
        provider: narrationProvider, providerVoiceId: voiceId, language, narrationPreset,
      },
      visualKind: metadataVisual.kind,
      durationSec: metadataDuration,
    });
    metadataScene.durationSec = metadataDuration;
    metadataScene.visualSelection = metadataVisual;
    captions.scene = metadataScene;
    addCaption(captions, cursor, metadataScene.narrationText);
    scenes.push(metadataScene);
  }

  for (const [index, scene] of scriptScenes.entries()) {
    assertScene(scene, index);
    const audioPath = requireAudio(audioDir, scene.id, `Scene ${scene.id}`);
    const durationSec = getDurationSeconds(audioPath);
    const visual = scene.metadata_card
      ? selectIdentityBoxArt({ script, metadata, pageDir, explicitPath: requestedBoxArtPath })
      : selectSourceVisual({
        ...scene,
        language,
        source_pdf_sha256: scene.source_pdf_sha256 || script.sourcePdfSha256 || null,
      }, visualCatalog, resolveRulebookFallback(scene, pageDir));
    if (!visual.path) throw new Error(`Scene ${scene.id} has no renderable visual`);
    if (visual.warning) visualWarnings.push(visual.warning);
    const commonScene = {
      id: scene.id,
      index,
      total: scriptScenes.length,
      section: scene.section,
      narration: scene.metadata_card
        ? formatOpeningMetadataNarration({ identity, metadata: canonicalMetadata })
        : sanitizeNarrationGameIdentity(scene.narration, identity),
      onScreenText: scene.on_screen_text,
      sourcePages: scene.source_pages,
      background: {
        image: visual.path,
        kind: visual.kind,
        confidence: visual.confidence,
        reason: visual.reason,
        languageAudit: visual.languageAudit || null,
        fallbackReason: visual.fallbackReason || null,
        alternativesConsidered: visual.alternativesConsidered || [],
        provenance: visual.provenance || null,
      },
      audio: {
        file: audioPath,
        ...(narrationBedPath && existsSync(resolve(narrationBedPath))
          ? { ambientFile: resolve(narrationBedPath), ambientGain: 0.07, ambientFadeOutSec: 1.0 }
          : {}),
        provider: narrationProvider,
        providerVoiceId: voiceId,
        language,
        narrationPreset,
      },
      visualKind: visual.kind,
      durationSec,
      preserveLineBreaks: scene.preserve_line_breaks === true,
    };
    const teaching = scene.metadata_card
      ? buildMetadataScene({ ...commonScene, gameName: identity.displayName, identity, metadata: canonicalMetadata })
      : buildTeachingScene({
        ...commonScene,
        callouts: scene.callouts || scene.visual_callouts || [],
        completedSteps: scene.completed_steps || [],
        visualFocus: scene.visual_focus || null,
        preserveLineBreaks: scene.preserve_line_breaks === true,
      });
    teaching.durationSec = durationSec;
    teaching.visualSelection = visual;
    teaching.layout.visualFocus = teaching.layout.visualFocus || scene.visual_focus || null;
    captions.scene = teaching;
    addCaption(captions, cursor, teaching.narrationText);
    scenes.push(teaching);
  }

  if (includeBrand) {
    const outroAudio = requireAudio(audioDir, 'brand-outro', 'The branded outro');
    const outro = buildBrandOutro({
      bannerPath: bannerPath && existsSync(resolve(bannerPath)) ? resolve(bannerPath) : null,
      audio: {
        file: outroAudio,
        ...(narrationBedPath && existsSync(resolve(narrationBedPath))
          ? { ambientFile: resolve(narrationBedPath), ambientGain: 0.07, ambientFadeOutSec: 0.72 }
          : {}),
        provider: narrationProvider, providerVoiceId: voiceId, language, narrationPreset,
      },
    });
    outro.durationSec = getDurationSeconds(outroAudio);
    captions.scene = outro;
    addCaption(captions, cursor, outro.narrationText);
    scenes.push(outro);
  }

  const chapters = buildChapters(scenes);
  const renderConfig = {
    projectId,
    gameName: identity.displayName,
    identity,
    ...(maxScenes ? { boundedPreview: { maxScenes, sourceSceneCount: script.scenes.length } } : {}),
    language,
    video: { resolution: { width, height }, fps },
    narration: {
      provider: narrationProvider,
      voiceName,
      providerVoiceId: voiceId,
      modelId: preset.modelId,
      narrationPreset,
      voiceSettings: preset.voiceSettings,
      language,
    },
    editorial: getEditorialContract({ narrationPreset }),
    scenes,
    chapters,
    sourceGrounded: true,
    reviewedScript: scriptPath,
    sourceVisualManifest: visualCatalog.manifestPath,
    sourceVisualQualityReport: visualCatalog.qualityReportPath || null,
    sourceSemanticVisualReport: visualCatalog.semanticReportPath || null,
    visualWarnings,
    visualLanguageAudit: scenes
      .filter((scene) => scene.type === 'teaching')
      .map((scene) => ({
        sceneId: scene.id,
        kind: scene.background?.kind || 'unknown',
        language: scene.background?.languageAudit || 'language-unknown',
      })),
    branding: {
      bannerPath: bannerPath && existsSync(resolve(bannerPath)) ? resolve(bannerPath) : null,
      transitionAudioPath: transitionAudioPath && existsSync(resolve(transitionAudioPath)) ? resolve(transitionAudioPath) : null,
      brandAmbiencePath: brandAmbiencePath && existsSync(resolve(brandAmbiencePath)) ? resolve(brandAmbiencePath) : null,
      contract: getEditorialContract({ narrationPreset }).brandAudio,
    },
  };

  mkdirSync(dirname(outputConfigPath), { recursive: true });
  mkdirSync(dirname(outputSrtPath), { recursive: true });
  mkdirSync(dirname(outputChaptersPath), { recursive: true });
  writeFileSync(outputConfigPath, `${JSON.stringify(renderConfig, null, 2)}\n`, 'utf8');
  writeFileSync(outputSrtPath, `${captions.blocks.join('\n\n')}\n`, 'utf8');
  writeFileSync(outputChaptersPath, `${JSON.stringify({ version: 1, language, chapters }, null, 2)}\n`, 'utf8');

  console.log(JSON.stringify({
    projectId,
    language,
    voiceName,
    narrationProvider,
    sceneCount: scenes.length,
    totalDurationSec: Number(cursor.value.toFixed(3)),
    configPath: outputConfigPath,
    captionsPath: outputSrtPath,
    chaptersPath: outputChaptersPath,
    visualAssetCount: visualCatalog.assets.length,
    visualWarnings,
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(`[build-source-grounded-preview] ${error.message}`);
  process.exit(1);
}
