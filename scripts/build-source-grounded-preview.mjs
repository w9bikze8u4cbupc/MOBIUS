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
import presentation from '../src/storyboard/tutorial_presentation.cjs';
import { loadSourceVisualCatalog, selectSourceVisual } from '../src/services/sourceVisualSelection.js';
import { DEFAULT_NARRATION_PRESET, getEditorialContract, getNarrationPreset } from '../src/services/editorialStandard.cjs';

const {
  DEFAULT_BRAND,
  buildBrandIntro,
  buildBrandOutro,
  buildTeachingScene,
  buildChapters,
} = presentation;

const AUDIO_EXTENSIONS = ['.wav', '.mp3', '.m4a', '.aac'];

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
  const output = execFileSync('ffprobe', [
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
  const bannerPath = optionalArg('brand-banner', null);
  const assetManifestPath = optionalArg('asset-manifest', null);
  const visualQualityReportPath = optionalArg('visual-quality-report', null);
  const semanticVisualReportPath = optionalArg('semantic-visual-report', null);
  const includeBrand = !hasFlag('no-brand');
  const preset = getNarrationPreset(narrationPreset);

  if (!['fr-CA', 'fr-FR', 'en'].includes(language)) {
    throw new Error(`Unsupported tutorial language '${language}'. Use fr-CA, fr-FR, or en.`);
  }

  const script = JSON.parse(readFileSync(scriptPath, 'utf8'));
  if (!Array.isArray(script.scenes) || script.scenes.length === 0) {
    throw new Error('The reviewed script must contain a non-empty scenes array');
  }

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

  if (includeBrand) {
    const introAudio = requireAudio(audioDir, 'brand-intro', 'The branded intro');
    const intro = buildBrandIntro({
      bannerPath: bannerPath && existsSync(resolve(bannerPath)) ? resolve(bannerPath) : null,
      audio: { file: introAudio, provider: narrationProvider, providerVoiceId: voiceId, language, narrationPreset },
    });
    intro.durationSec = getDurationSeconds(introAudio);
    captions.scene = intro;
    addCaption(captions, cursor, intro.narrationText);
    scenes.push(intro);
  }

  for (const [index, scene] of script.scenes.entries()) {
    assertScene(scene, index);
    const audioPath = requireAudio(audioDir, scene.id, `Scene ${scene.id}`);
    const durationSec = getDurationSeconds(audioPath);
    const visual = selectSourceVisual({ ...scene, language }, visualCatalog, resolveRulebookFallback(scene, pageDir));
    if (!visual.path) throw new Error(`Scene ${scene.id} has no renderable visual`);
    if (visual.warning) visualWarnings.push(visual.warning);
    const teaching = buildTeachingScene({
      id: scene.id,
      index,
      total: script.scenes.length,
      section: scene.section,
      narration: scene.narration,
      onScreenText: scene.on_screen_text,
      sourcePages: scene.source_pages,
      background: {
        image: visual.path,
        kind: visual.kind,
        confidence: visual.confidence,
        reason: visual.reason,
        languageAudit: visual.languageAudit || null,
      },
      audio: {
        file: audioPath,
        provider: narrationProvider,
        providerVoiceId: voiceId,
        language,
        narrationPreset,
      },
      callouts: scene.callouts || scene.visual_callouts || [],
      completedSteps: scene.completed_steps || [],
      visualKind: visual.kind,
      visualFocus: scene.visual_focus || null,
      durationSec,
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
      audio: { file: outroAudio, provider: narrationProvider, providerVoiceId: voiceId, language, narrationPreset },
    });
    outro.durationSec = getDurationSeconds(outroAudio);
    captions.scene = outro;
    addCaption(captions, cursor, outro.narrationText);
    scenes.push(outro);
  }

  const chapters = buildChapters(scenes);
  const renderConfig = {
    projectId,
    gameName: script.game || projectId,
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
