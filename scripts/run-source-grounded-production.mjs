#!/usr/bin/env node

import 'dotenv/config';

/**
 * Canonical, resumable source-grounded production pipeline.
 *
 * This command deliberately starts from the persisted project returned by
 * MOBIUS' load API. Browser state and ad-hoc project JSON edits are not inputs.
 * Expensive work is checkpointed by content hashes, so rerunning an unchanged
 * project reuses reviewed visuals, narration, the render handoff, and a valid
 * final MP4.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve, basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import presentation from '../src/storyboard/tutorial_presentation.cjs';
import { generateNarration, ELEVENLABS_MODEL_ID } from '../src/services/elevenLabsService.js';
import { selectSourceVisual } from '../src/services/sourceVisualSelection.js';
import {
  BRAND_AUDIO_CONTRACT,
  DEFAULT_NARRATION_PRESET,
  classifyVisualLanguage,
  estimateTeachingLayout,
  getEditorialContract,
  getNarrationPreset,
  prepareNarrationText,
  evaluateProfessionalReleaseGate,
} from '../src/services/editorialStandard.cjs';
import { analyzeProductionVideo, buildExternalReviewSummary } from '../src/services/twelveLabsVideoReview.js';

const { DEFAULT_BRAND, buildBrandIntro, buildBrandOutro } = presentation;
const SCRIPT_NAME = 'production-script.json';
const CHECKPOINT_NAME = 'production-pipeline-state.json';
const REPORT_NAME = 'production-report.json';
const AUDIO_NAME = 'narration-assets.json';
const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.m4a', '.aac'];
const EDITORIAL_NAME = 'editorial-report.json';

function parseMaybeJson(value, fallback = null) {
  if (value && typeof value === 'object') return value;
  if (typeof value !== 'string' || !value.trim()) return fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

function hashValue(value) {
  return crypto.createHash('sha256').update(stable(value)).digest('hex');
}

function hashFile(filePath) {
  return crypto.createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function argsToObject(argv = process.argv.slice(2)) {
  const flags = new Set();
  const values = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const name = token.slice(2);
    if (name.includes('=')) {
      const [key, ...rest] = name.split('=');
      values[key] = rest.join('=');
    } else if (argv[i + 1] && !argv[i + 1].startsWith('--')) {
      values[name] = argv[i + 1];
      i += 1;
    } else flags.add(name);
  }
  return { ...values, flags };
}

function required(value, name) {
  if (!value) throw new Error(`Missing required option --${name}`);
  return value;
}

function jsonFile(filePath, value) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function readJsonIfPresent(filePath, fallback = null) {
  if (!existsSync(filePath)) return fallback;
  try { return JSON.parse(readFileSync(filePath, 'utf8')); } catch { return fallback; }
}

function resolveExecutable(root, envName, candidates) {
  const configured = process.env[envName];
  if (configured && existsSync(configured)) return resolve(configured);
  for (const candidate of candidates) {
    const resolved = resolve(root, candidate);
    if (existsSync(resolved)) return resolved;
  }
  return envName === 'MOBIUS_FFMPEG_PATH' ? 'ffmpeg' : 'ffprobe';
}

function toolEnvironment(root) {
  const ffprobe = resolveExecutable(root, 'MOBIUS_FFPROBE_PATH', [
    'node_modules/ffprobe-static/bin/win32/x64/ffprobe.exe',
    'node_modules/ffprobe-static/bin/linux/x64/ffprobe',
  ]);
  const ffmpeg = resolveExecutable(root, 'MOBIUS_FFMPEG_PATH', [
    'node_modules/ffmpeg-static/ffmpeg.exe',
    'node_modules/ffmpeg-static/ffmpeg',
  ]);
  const pathEntries = [dirname(ffprobe), dirname(ffmpeg), process.env.PATH].filter(Boolean);
  return { ffprobe, ffmpeg, env: { ...process.env, PATH: pathEntries.join(';') } };
}

function runNodeScript(root, script, scriptArgs, env) {
  const result = spawnSync(process.execPath, [resolve(root, script), ...scriptArgs], {
    cwd: root,
    env,
    stdio: 'inherit',
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${script} exited with code ${result.status}`);
}

async function loadPersistedProject(baseUrl, projectId, apiKey) {
  const url = `${baseUrl.replace(/\/$/, '')}/load-project/${encodeURIComponent(projectId)}`;
  const response = await fetch(url, { headers: apiKey ? { 'x-api-key': apiKey } : {} });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Project load failed (${response.status}): ${body.error || 'unknown error'}`);
  return body;
}

function normalizeProject(project, root, projectId, language) {
  const metadata = parseMaybeJson(project.metadata, {}) || {};
  const context = parseMaybeJson(metadata.projectContext || project.projectContext, {}) || {};
  const scenes = parseMaybeJson(project.scenes, []) || [];
  if (!Array.isArray(scenes) || scenes.length === 0) throw new Error('Persisted project has no storyboard scenes.');
  const gameName = context.gameName || project.name || projectId;
  const projectDir = resolve(root, 'data', projectId);
  const productionDir = join(projectDir, 'production');
  const audioDir = join(productionDir, 'audio');
  const sourceCandidates = [
    join(projectDir, 'source', 'rulebook.pdf'),
    context.sourcePdf?.path,
    context.sourcePdf?.filePath,
  ].filter(Boolean).map((p) => resolve(p));
  const sourcePdf = sourceCandidates.find(existsSync) || null;
  if (!sourcePdf) throw new Error(`Persisted project source PDF is missing under ${projectDir}.`);
  const pageDirCandidates = [
    join(root, 'data', 'rulebook-images', String(gameName).toLowerCase().replace(/[^a-z0-9]+/g, '-')),
    join(root, 'data', 'rulebook-images', projectId),
  ];
  const pageDir = pageDirCandidates.find((dir) => existsSync(join(dir, 'page-1.png'))) || null;
  if (!pageDir) throw new Error(`No canonical rulebook page images found for ${gameName}.`);
  const production = context.production || {};
  const voiceId = production.voiceId
    || process.env.ELEVENLABS_VOICE_ID_AMELIE
    || required(process.env.ELEVENLABS_VOICE_ID, 'voice-id or ELEVENLABS_VOICE_ID_AMELIE');
  const narrationPreset = production.narrationPreset || DEFAULT_NARRATION_PRESET;
  getNarrationPreset(narrationPreset);
  return {
    project,
    metadata,
    context,
    scenes,
    projectId,
    gameName,
    language,
    projectDir,
    productionDir,
    audioDir,
    sourcePdf,
    sourcePdfSha256: hashFile(sourcePdf),
    pageDir,
    voiceId,
    voiceName: production.voiceName || 'Amélie',
    narrationPreset,
    production,
  };
}

function sourcePagesForScene(scene) {
  const preferred = Number(scene.renderVisual?.sourcePage);
  if (Number.isInteger(preferred) && preferred > 0) return [preferred];
  const pages = (scene.sources || [])
    .map((source) => Number(source.page ?? source.pageNumber ?? source.section))
    .filter((page) => Number.isInteger(page) && page > 0);
  return [...new Set(pages)].length ? [...new Set(pages)] : [1];
}

function scriptSceneFromCanonical(scene, index) {
  const directions = Array.isArray(scene.visualDirections) ? scene.visualDirections : [];
  const overlay = scene.overlay || {};
  const firstDirection = directions[0] || {};
  const onScreenText = Array.isArray(overlay.onScreenText) && overlay.onScreenText.length
    ? overlay.onScreenText.join(' ')
    : firstDirection.onScreenText || scene.title;
  const explicit = ['explicit-asset', 'component', 'automatic-asset', 'automatic-component', 'focused-page-crop', 'focused-page-region'].includes(scene.renderVisual?.kind)
    && scene.renderVisual?.path
    && existsSync(scene.renderVisual.path);
  const sourceNarration = scene.spokenText;
  return {
    id: scene.id,
    section: scene.title || scene.sectionId || `Étape ${index + 1}`,
    narration: prepareNarrationText(sourceNarration),
    source_narration: sourceNarration,
    on_screen_text: onScreenText,
    source_pages: sourcePagesForScene(scene),
    callouts: overlay.callouts || firstDirection.callouts || [],
    visual_focus: scene.visualPlan?.visualFocus || null,
    ...(explicit ? {
      visual_asset: resolve(scene.renderVisual.path),
      visual_asset_id: scene.renderVisual.assetId || null,
      visual_asset_kind: scene.renderVisual.kind,
      visual_source_page: scene.renderVisual.sourcePage || null,
      visual_provenance: scene.renderVisual.provenance || null,
    } : {}),
  };
}

function canonicalInput(normalized) {
  return {
    projectId: normalized.projectId,
    gameName: normalized.gameName,
    language: normalized.language,
    voiceId: normalized.voiceId,
    voiceName: normalized.voiceName,
    narrationPreset: normalized.narrationPreset,
    editorial: getEditorialContract({ narrationPreset: normalized.narrationPreset }),
    sourcePdfSha256: normalized.sourcePdfSha256,
    scenes: normalized.scenes.map((scene, index) => ({
      ...scriptSceneFromCanonical(scene, index),
      renderKind: scene.renderVisual?.kind || 'missing',
    })),
  };
}

function inspectVisuals(normalized) {
  const counts = { explicit: 0, automatic: 0, automaticComponent: 0, automaticFocusedCrop: 0, fallback: 0, missing: 0 };
  const warnings = [];
  const bindings = [];
  for (const [index, scene] of normalized.scenes.entries()) {
    const pages = sourcePagesForScene(scene);
    const fallback = join(normalized.pageDir, `page-${pages[0]}.png`);
  const explicit = ['explicit-asset', 'component', 'automatic-asset', 'automatic-component', 'focused-page-crop', 'focused-page-region'].includes(scene.renderVisual?.kind) && scene.renderVisual?.path;
    const selection = selectSourceVisual(
      explicit ? {
        language: normalized.language,
        visual_asset: scene.renderVisual.path,
        visual_asset_id: scene.renderVisual.assetId,
        visual_asset_kind: scene.renderVisual.kind,
        visual_source_page: scene.renderVisual.sourcePage,
        visual_provenance: scene.renderVisual.provenance,
        visual_metadata: scene.renderVisual.metadata,
      } : { language: normalized.language },
      { assets: [] },
      fallback,
    );
    if (!selection.path || !existsSync(selection.path)) {
      counts.missing += 1;
      warnings.push(`Scene ${scene.id || index + 1} has no readable visual.`);
    } else if (selection.kind === 'explicit-asset') {
      counts.explicit += 1;
    } else if (selection.kind === 'automatic-asset' || selection.kind === 'automatic-component' || selection.kind === 'component') {
      counts.automatic += 1;
      counts.automaticComponent += 1;
    } else if (['focused-page-crop', 'focused-page-region'].includes(selection.kind)) {
      counts.automatic += 1;
      counts.automaticFocusedCrop += 1;
    } else {
      counts.fallback += 1;
      warnings.push(`Scene '${scene.id}' uses labelled rulebook fallback page ${pages[0]}.`);
    }
    bindings.push({
      sceneId: scene.id,
      kind: selection.kind,
      path: selection.path,
      sourcePage: selection.sourcePage || pages[0],
      provenance: selection.provenance || null,
      fallbackReason: selection.fallbackReason || scene.renderVisual?.fallbackReason || null,
      alternativesConsidered: selection.alternativesConsidered || scene.renderVisual?.alternativesConsidered || [],
      fallbackMitigation: selection.fallbackMitigation || scene.renderVisual?.fallbackMitigation || null,
    });
  }
  if (counts.missing) throw new Error(`Visual contract failed: ${counts.missing} scene(s) have no readable visual.`);
  return { counts, warnings, bindings };
}

function buildEditorialReport(config, normalized, visuals, narration) {
  const teaching = (config.scenes || []).filter((scene) => scene.type === 'teaching');
  const layout = estimateTeachingLayout({ width: config.video?.resolution?.width, height: config.video?.resolution?.height });
  const sceneAudit = teaching.map((scene) => {
    const body = (scene.overlays || []).find((overlay) => overlay.type === 'body');
    const source = scene.background || {};
    return {
      sceneId: scene.id,
      visualKind: source.kind || 'unknown',
      language: source.languageAudit || classifyVisualLanguage({ visualKind: source.kind, assetPath: source.image, language: normalized.language }),
      supportTextChars: String(body?.text || '').length,
      conciseSupportText: String(body?.text || '').length <= 150,
      groupedSetup: scene.layout?.editorial?.groupedSetup === true,
      calloutCount: Array.isArray(scene.callouts) ? scene.callouts.length : 0,
      fallbackReason: scene.background?.fallbackReason || scene.visualSelection?.fallbackReason || null,
      alternativesConsidered: scene.background?.alternativesConsidered || scene.visualSelection?.alternativesConsidered || [],
    };
  });
  return {
    version: 'mobius-editorial-report-v2',
    contract: getEditorialContract({ narrationPreset: normalized.narrationPreset }),
    brandedIntroAudioPresent: Boolean(narration.records.find((record) => record.sceneId === 'brand-intro')?.brandAudioContract),
    brandedOutroAudioPresent: Boolean(narration.records.find((record) => record.sceneId === 'brand-outro')?.brandAudioContract),
    narrationPreset: normalized.narrationPreset,
    narrationPresetHash: narration.presetHash,
    visualDominantLayout: { ...layout, panelShare: 0.22, visualShare: layout.visualAreaRatio },
    foreignExplanatoryTextScenes: sceneAudit.filter((scene) => ['english-explanatory', 'english-source-uncertain'].includes(scene.language)).map((scene) => scene.sceneId),
    localizedCalloutScenes: sceneAudit.filter((scene) => scene.calloutCount > 0).map((scene) => scene.sceneId),
    layoutCollisions: sceneAudit.filter(() => layout.overlap).map((scene) => scene.sceneId),
    fullPageFallbacks: sceneAudit.filter((scene) => scene.visualKind === 'rulebook-page-fallback').map((scene) => scene.sceneId),
    fallbackJustifications: sceneAudit.filter((scene) => scene.visualKind === 'rulebook-page-fallback').map((scene) => ({
      sceneId: scene.sceneId,
      fallbackReason: scene.fallbackReason || 'not-recorded',
      alternativesConsidered: scene.alternativesConsidered,
    })),
    groupedSetupSteps: sceneAudit.filter((scene) => scene.groupedSetup).map((scene) => scene.sceneId),
    calloutCount: sceneAudit.reduce((sum, scene) => sum + scene.calloutCount, 0),
    overlayExceedsConcisePolicy: sceneAudit.filter((scene) => !scene.conciseSupportText).map((scene) => scene.sceneId),
    scenes: sceneAudit,
  };
}

function audioSpecs(normalized) {
  const intro = buildBrandIntro({ audio: null, gameName: normalized.gameName, themeHook: normalized.scenes[0]?.spokenText || '' });
  const outro = buildBrandOutro({ audio: null });
  return [
    { id: 'brand-intro-voice', sceneId: 'brand-intro', text: prepareNarrationText(intro.narrationText) },
    ...normalized.scenes.map((scene) => ({ id: scene.id, sceneId: scene.id, text: prepareNarrationText(scene.spokenText) })),
    { id: 'brand-outro-voice', sceneId: 'brand-outro', text: prepareNarrationText(outro.narrationText) },
  ];
}

function audioRecordIndex(normalized) {
  const records = parseMaybeJson(normalized.context.audioAssets, []) || [];
  const sidecar = readJsonIfPresent(join(normalized.productionDir, AUDIO_NAME), {});
  const all = [...(Array.isArray(records) ? records : []), ...(Array.isArray(sidecar.assets) ? sidecar.assets : [])];
  return new Map(all.filter((record) => record?.sceneId).map((record) => [record.sceneId, record]));
}

function ensureBrandAudioMix(normalized, tools, records, presetHash) {
  const signaturePath = join(normalized.audioDir, 'mobius-signature-bed.wav');
  const signatureMetaPath = join(normalized.audioDir, 'mobius-signature-bed.json');
  const transitionPath = join(normalized.audioDir, 'mobius-transition-bed.wav');
  const mixHash = hashValue({ brandAudio: BRAND_AUDIO_CONTRACT, presetHash });
  const introVoice = records.find((record) => record.sceneId === 'brand-intro');
  const outroVoice = records.find((record) => record.sceneId === 'brand-outro');
  if (!introVoice || !outroVoice) throw new Error('Branded bookend narration records are missing.');

  const signatureMeta = readJsonIfPresent(signatureMetaPath, {});
  if (!existsSync(signaturePath) || signatureMeta.contractHash !== mixHash) {
    const duration = BRAND_AUDIO_CONTRACT.durationSec;
    const bedFilter = [
      '[0:a]volume=0.075[motif1]',
      '[1:a]volume=0.045[motif2]',
      '[2:a]volume=0.03[motif3]',
      '[3:a]lowpass=f=1100,volume=0.06[room]',
      '[4:a]adelay=900|900,volume=0.08[cup1]',
      '[5:a]adelay=2600|2600,volume=0.06[cup2]',
      '[6:a]lowpass=f=700,volume=0.035[water]',
      '[motif1][motif2][motif3][room][cup1][cup2][water]amix=inputs=7:duration=longest:normalize=0,atrim=0:' + duration + ',afade=t=in:st=0:d=0.18,afade=t=out:st=' + Math.max(0, duration - 0.72).toFixed(2) + ':d=0.72,alimiter=limit=0.8[a]',
    ].join(';');
    execFileSync(tools.ffmpeg, [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-f', 'lavfi', '-i', `sine=frequency=261.63:duration=${duration}:sample_rate=48000`,
      '-f', 'lavfi', '-i', `sine=frequency=329.63:duration=${duration}:sample_rate=48000`,
      '-f', 'lavfi', '-i', `sine=frequency=392.00:duration=${duration}:sample_rate=48000`,
      '-f', 'lavfi', '-i', `anoisesrc=color=pink:amplitude=0.02:duration=${duration}:sample_rate=48000`,
      '-f', 'lavfi', '-i', 'aevalsrc=0.18*sin(2*PI*90*t)*exp(-35*t):s=48000:d=0.18',
      '-f', 'lavfi', '-i', 'aevalsrc=0.14*sin(2*PI*120*t)*exp(-42*t):s=48000:d=0.16',
      '-f', 'lavfi', '-i', `anoisesrc=color=brown:amplitude=0.018:duration=${duration}:sample_rate=48000`,
      '-filter_complex', bedFilter,
      '-map', '[a]', '-ar', '48000', '-ac', '2', signaturePath,
    ], { stdio: 'pipe', windowsHide: true });
    jsonFile(signatureMetaPath, { version: BRAND_AUDIO_CONTRACT.version, contract: BRAND_AUDIO_CONTRACT.id, contractHash: mixHash, path: signaturePath, layers: BRAND_AUDIO_CONTRACT.layers });
  }

  const transitionMetaHash = hashValue({ mixHash, transition: BRAND_AUDIO_CONTRACT.transition });
  const transitionMetaPath = join(normalized.audioDir, 'mobius-transition-bed.json');
  const transitionMeta = readJsonIfPresent(transitionMetaPath, {});
  if (!existsSync(transitionPath) || transitionMeta.contractHash !== transitionMetaHash) {
    execFileSync(tools.ffmpeg, [
      '-hide_banner', '-loglevel', 'error', '-y', '-i', signaturePath,
      '-filter_complex', `[0:a]atrim=0:${BRAND_AUDIO_CONTRACT.transitionBedSec},volume=0.24,afade=t=in:st=0:d=0.18,afade=t=out:st=1.8:d=4.0,alimiter=limit=0.7[a]`,
      '-map', '[a]', '-ar', '48000', '-ac', '2', transitionPath,
    ], { stdio: 'pipe', windowsHide: true });
    jsonFile(transitionMetaPath, { version: BRAND_AUDIO_CONTRACT.version, contract: BRAND_AUDIO_CONTRACT.id, contractHash: transitionMetaHash, path: transitionPath, durationSec: BRAND_AUDIO_CONTRACT.transitionBedSec });
  }

  const mixed = new Map();
  for (const [sceneId, voiceRecord] of [['brand-intro', introVoice], ['brand-outro', outroVoice]]) {
    const outputPath = join(normalized.audioDir, `${sceneId}.mp3`);
    const voicePath = voiceRecord.rawFilePath || voiceRecord.filePath;
    const outputHash = hashValue({ mixHash, sceneId, voice: hashFile(voicePath) });
    if (voiceRecord.brandMixHash !== outputHash || !existsSync(outputPath)) {
      execFileSync(tools.ffmpeg, [
        '-hide_banner', '-loglevel', 'error', '-y',
        '-i', voicePath, '-i', signaturePath,
        '-filter_complex', '[0:a]aresample=48000,volume=1.0[voice];[1:a]aresample=48000,volume=0.16[bed];[voice][bed]amix=inputs=2:duration=longest:dropout_transition=0,alimiter=limit=0.95[a]',
        '-map', '[a]', '-ar', '48000', '-ac', '2', outputPath,
      ], { stdio: 'pipe', windowsHide: true });
    }
    const probe = probeAudio(tools.ffprobe, outputPath);
    mixed.set(sceneId, {
      ...voiceRecord,
      filePath: outputPath,
      rawFilePath: voicePath,
      durationMs: Math.round(probe.durationSec * 1000),
      sampleRate: probe.sampleRate,
      channels: probe.channels,
      brandAudioContract: BRAND_AUDIO_CONTRACT.id,
      brandAudioContractHash: mixHash,
      brandMixHash: outputHash,
    });
  }
  return { mixed, transitionPath, transitionHash: transitionMetaHash };
}

function probeAudio(ffprobe, filePath) {
  const raw = execFileSync(ffprobe, [
    '-v', 'error', '-show_entries', 'format=duration:stream=sample_rate,channels', '-of', 'json', filePath,
  ], { encoding: 'utf8' });
  const value = JSON.parse(raw);
  const stream = (value.streams || []).find((item) => item.channels);
  return {
    durationSec: Number(value.format?.duration || 0),
    sampleRate: Number(stream?.sample_rate || 0),
    channels: Number(stream?.channels || 0),
  };
}

async function ensureNarration(normalized, tools, checkpoint, inputHash) {
  const index = audioRecordIndex(normalized);
  const preset = getNarrationPreset(normalized.narrationPreset);
  const presetHash = hashValue(preset);
  mkdirSync(normalized.audioDir, { recursive: true });
  const records = [];
  let reused = 0;
  let generated = 0;
  for (const spec of audioSpecs(normalized)) {
    const target = join(normalized.audioDir, `${spec.id}.mp3`);
    const existing = index.get(spec.sceneId) || index.get(spec.id);
    const sourcePath = existing?.rawFilePath || existing?.filePath || existing?.path;
    const compatible = existing
      && existing.sourceText === spec.text
      && existing.providerVoiceId === normalized.voiceId
      && existing.language === normalized.language
      && existing.modelId === preset.modelId
      && existing.narrationPreset === preset.id
      && existing.narrationPresetHash === presetHash
      && sourcePath && existsSync(sourcePath);
    if (compatible && !existsSync(target)) copyFileSync(sourcePath, target);
    const valid = compatible && existsSync(target);
    if (!valid) {
      await generateNarration(spec.text, normalized.voiceId, target, {
        modelId: preset.modelId,
        voiceSettings: preset.voiceSettings,
      });
      generated += 1;
    } else reused += 1;
    const probe = probeAudio(tools.ffprobe, target);
    records.push({
      id: `narration-${spec.sceneId}`,
      sceneId: spec.sceneId,
      provider: 'elevenlabs',
      providerVoiceId: normalized.voiceId,
      modelId: preset.modelId,
      language: normalized.language,
      sourceText: spec.text,
      narrationPreset: preset.id,
      narrationPresetHash: presetHash,
      sourceTextHash: hashValue({ text: spec.text, voiceId: normalized.voiceId, language: normalized.language, modelId: preset.modelId, narrationPreset: preset.id, voiceSettings: preset.voiceSettings }),
      filePath: target,
      rawFilePath: target,
      durationMs: Math.round(probe.durationSec * 1000),
      sampleRate: probe.sampleRate,
      channels: probe.channels,
      status: 'ready',
    });
  }
  const brandMix = await ensureBrandAudioMix(normalized, tools, records, presetHash);
  const finalRecords = records.map((record) => brandMix.mixed.get(record.sceneId) || record);
  jsonFile(join(normalized.productionDir, AUDIO_NAME), {
    provider: 'elevenlabs', voiceName: normalized.voiceName, voiceId: normalized.voiceId,
    language: normalized.language, modelId: preset.modelId, narrationPreset: preset.id,
    narrationPresetHash: presetHash, voiceSettings: preset.voiceSettings, inputHash, assets: finalRecords,
  });
  checkpoint.stages.narration = { inputHash, reused, generated, outputs: [join(normalized.productionDir, AUDIO_NAME)] };
  return { reused, generated, records: finalRecords, preset, presetHash, brandTransitionPath: brandMix.transitionPath, brandTransitionHash: brandMix.transitionHash };
}

function materializeScript(normalized, inputHash) {
  const output = join(normalized.productionDir, SCRIPT_NAME);
  const scenes = normalized.scenes.map(scriptSceneFromCanonical);
  const value = {
    version: 1,
    game: normalized.gameName,
    language: normalized.language,
    voiceName: normalized.voiceName,
    voiceId: normalized.voiceId,
    narrationPreset: normalized.narrationPreset,
    editorial: getEditorialContract({ narrationPreset: normalized.narrationPreset }),
    sourcePdf: normalized.sourcePdf,
    sourcePdfSha256: normalized.sourcePdfSha256,
    sourceProjectId: normalized.projectId,
    sourceInputHash: inputHash,
    scenes,
  };
  const previous = readJsonIfPresent(output);
  const reused = previous?.sourceInputHash === inputHash && Array.isArray(previous.scenes)
    && hashValue(previous.scenes) === hashValue(scenes);
  if (!reused) jsonFile(output, value);
  return { path: output, reused, value };
}

function validateCaptionFile(filePath, durationSec) {
  const blocks = readFileSync(filePath, 'utf8').trim().split(/\r?\n\r?\n/).filter(Boolean);
  let previousEnd = 0;
  let lastEnd = 0;
  for (const block of blocks) {
    const match = block.match(/\n(\d\d:\d\d:\d\d,\d{3}) --> (\d\d:\d\d:\d\d,\d{3})/);
    if (!match) throw new Error('Caption contract failed: malformed SRT cue.');
    const toSec = (value) => { const [h, m, s, ms] = value.split(/[:,]/).map(Number); return h * 3600 + m * 60 + s + ms / 1000; };
    const start = toSec(match[1]);
    const end = toSec(match[2]);
    if (start < previousEnd - 0.001 || end <= start) throw new Error('Caption contract failed: overlapping or empty cue.');
    previousEnd = end;
    lastEnd = end;
  }
  if (Math.abs(lastEnd - durationSec) > 0.2) throw new Error(`Caption contract failed: cues end at ${lastEnd}, media ends at ${durationSec}.`);
  return { blocks: blocks.length, lastEndSec: lastEnd, overlaps: 0 };
}

function probeMedia(tools, filePath, expectedDuration) {
  const raw = execFileSync(tools.ffprobe, [
    '-v', 'error', '-show_entries', 'format=format_name,duration,size:stream=codec_type,codec_name,width,height,avg_frame_rate,sample_rate,channels,duration', '-of', 'json', filePath,
  ], { encoding: 'utf8' });
  const value = JSON.parse(raw);
  const video = (value.streams || []).find((stream) => stream.codec_type === 'video');
  const audio = (value.streams || []).find((stream) => stream.codec_type === 'audio');
  const duration = Number(value.format?.duration || 0);
  const errors = [];
  if (!String(value.format?.format_name || '').includes('mp4')) errors.push('not an MP4');
  if (!video || video.codec_name !== 'h264' || Number(video.width) < 1920 || Number(video.height) < 1080 || video.avg_frame_rate !== '30/1') errors.push('video does not meet H.264 1920x1080/30 contract');
  if (!audio || audio.codec_name !== 'aac' || Number(audio.sample_rate) !== 48000 || Number(audio.channels) < 1) errors.push('audio does not meet AAC 48kHz contract');
  if (Math.abs(duration - expectedDuration) > 0.8) errors.push(`duration ${duration} differs from expected ${expectedDuration}`);
  if (errors.length) throw new Error(`Media contract failed: ${errors.join('; ')}`);
  execFileSync(tools.ffmpeg, ['-hide_banner', '-loglevel', 'error', '-xerror', '-i', filePath, '-map', '0:v:0', '-map', '0:a:0', '-f', 'null', 'NUL'], { stdio: 'pipe' });
  return { format: value.format.format_name, durationSec: duration, sizeBytes: Number(value.format.size), video, audio, decode: 'ok' };
}

function measureLoudness(tools, filePath) {
  const result = spawnSync(tools.ffmpeg, [
    '-hide_banner', '-i', filePath, '-map', '0:a:0', '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json', '-f', 'null', 'NUL',
  ], { encoding: 'utf8', windowsHide: true });
  const text = `${result.stdout || ''}\n${result.stderr || ''}`;
  const match = text.match(/\{\s*"input_i"[\s\S]*?\}/);
  if (!match) return { status: 'unavailable' };
  const value = JSON.parse(match[0]);
  return { status: 'measured', integratedLufs: Number(value.input_i), truePeakDbtp: Number(value.input_tp), loudnessRangeLu: Number(value.input_lra) };
}

function checkpointReady(checkpoint, stage, inputHash, outputs) {
  const record = checkpoint.stages?.[stage];
  return Boolean(record?.inputHash === inputHash && outputs.every(existsSync));
}

export function buildStagePlan({ checkpoint = {}, stages = [], inputHash, outputsByStage = {} }) {
  return stages.map((stage) => ({
    stage,
    reuse: checkpointReady(checkpoint, stage, inputHash, outputsByStage[stage] || []),
  }));
}

export function canReuseRenderedMedia({ checkpoint = {}, renderHash, outputPath, outputSha256 }) {
  const render = checkpoint.stages?.render;
  return Boolean(render
    && render.inputHash === renderHash
    && render.output === outputPath
    && render.outputSha256
    && render.outputSha256 === outputSha256);
}

function stopAfter(options, stage, checkpoint, partial) {
  if (options.stopAfter !== stage) return false;
  checkpoint.stoppedAfter = stage;
  jsonFile(partial.checkpointPath, checkpoint);
  console.log(JSON.stringify({ status: 'stopped-after-stage', stage, checkpoint: partial.checkpointPath }, null, 2));
  return true;
}

export async function runProduction(options = {}) {
  const root = resolve(options.root || process.cwd());
  const projectId = required(options.projectId, 'project');
  const language = options.language || 'fr-CA';
  if (language !== 'fr-CA') throw new Error(`This production profile requires fr-CA; received ${language}.`);
  const tools = toolEnvironment(root);
  const project = await loadPersistedProject(options.baseUrl || process.env.MOBIUS_BASE_URL || 'http://127.0.0.1:5001', projectId, options.apiKey || process.env.API_KEY);
  const normalized = normalizeProject(project, root, projectId, language);
  const checkpointPath = join(normalized.productionDir, CHECKPOINT_NAME);
  const checkpoint = readJsonIfPresent(checkpointPath, { version: 1, projectId, stages: {} });
  const inputHash = hashValue(canonicalInput(normalized));
  checkpoint.projectId = projectId;
  checkpoint.inputHash = inputHash;
  checkpoint.sourcePdfSha256 = normalized.sourcePdfSha256;
  checkpoint.voice = { name: normalized.voiceName, id: normalized.voiceId, language };
  const partial = { checkpointPath };

  const visuals = inspectVisuals(normalized);
  checkpoint.stages.visuals = { inputHash, counts: visuals.counts, warnings: visuals.warnings };
  if (stopAfter(options, 'visuals', checkpoint, partial)) return { status: 'stopped', stage: 'visuals' };

  const script = materializeScript(normalized, inputHash);
  checkpoint.stages.script = { inputHash, reused: script.reused, outputs: [script.path] };
  if (stopAfter(options, 'script', checkpoint, partial)) return { status: 'stopped', stage: 'script' };

  const narrationPreset = getNarrationPreset(normalized.narrationPreset);
  const narrationPresetHash = hashValue(narrationPreset);
  const narrationInputHash = hashValue({
    inputHash,
    voiceId: normalized.voiceId,
    language,
    narrationPreset: normalized.narrationPreset,
    narrationPresetHash,
    modelId: narrationPreset.modelId,
  });
  const narration = await ensureNarration(normalized, tools, checkpoint, narrationInputHash);
  if (stopAfter(options, 'narration', checkpoint, partial)) return { status: 'stopped', stage: 'narration' };

  const configPath = join(normalized.productionDir, 'render-config.json');
  const captionsPath = join(normalized.productionDir, `captions_${language}.srt`);
  const chaptersPath = join(normalized.productionDir, 'chapters.json');
  const handoffHash = hashValue({
    inputHash,
    narrationInputHash,
    editorial: getEditorialContract({ narrationPreset: normalized.narrationPreset }),
    branding: { bannerPath: resolve(root, DEFAULT_BRAND.bannerPath), transitionHash: narration.brandTransitionHash },
    audio: narration.records.map((record) => ({
      id: record.id,
      durationMs: record.durationMs,
      sourceTextHash: record.sourceTextHash,
      brandMixHash: record.brandMixHash || null,
    })),
  });
  const handoffReuse = checkpointReady(checkpoint, 'handoff', handoffHash, [configPath, captionsPath, chaptersPath]);
  if (!handoffReuse) {
    runNodeScript(root, 'scripts/build-source-grounded-preview.mjs', [
      '--script', script.path, '--page-dir', normalized.pageDir, '--audio-dir', normalized.audioDir,
      '--out-config', configPath, '--out-srt', captionsPath, '--out-chapters', chaptersPath,
      '--project-id', projectId, '--width', '1920', '--height', '1080', '--fps', '30',
      '--language', language, '--voice-name', normalized.voiceName, '--voice-id', normalized.voiceId,
      '--narration-provider', 'elevenlabs', '--narration-preset', normalized.narrationPreset,
      '--brand-banner', resolve(root, DEFAULT_BRAND.bannerPath),
      '--brand-transition-audio', narration.brandTransitionPath,
    ], tools.env);
  }
  checkpoint.stages.handoff = { inputHash: handoffHash, reused: handoffReuse, outputs: [configPath, captionsPath, chaptersPath] };
  if (stopAfter(options, 'handoff', checkpoint, partial)) return { status: 'stopped', stage: 'handoff' };

  const config = readJsonIfPresent(configPath);
  if (!config?.scenes?.length) throw new Error('Render handoff is missing scenes.');
  const editorialReport = buildEditorialReport(config, normalized, visuals, narration);
  jsonFile(join(normalized.productionDir, EDITORIAL_NAME), editorialReport);
  const expectedDuration = config.scenes.reduce((sum, scene) => sum + Number(scene.durationSec || 0), 0);
  const outputPath = join(normalized.productionDir, `${String(normalized.gameName).toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${language}-production.mp4`);
  const renderHash = hashValue({ handoffHash, configHash: hashFile(configPath) });
  let renderReused = false;
  if (!options.forceRender && existsSync(outputPath)) {
    const outputSha256 = hashFile(outputPath);
    if (canReuseRenderedMedia({ checkpoint, renderHash, outputPath, outputSha256 })) {
      try { probeMedia(tools, outputPath, expectedDuration); renderReused = true; } catch { renderReused = false; }
    }
  }
  if (!renderReused) {
    runNodeScript(root, 'scripts/render-storyboard-ffmpeg.mjs', ['--config', configPath, '--out', outputPath], tools.env);
  }
  checkpoint.stages.render = { inputHash: renderHash, reused: renderReused, output: outputPath, outputSha256: hashFile(outputPath) };
  if (stopAfter(options, 'render', checkpoint, partial)) return { status: 'stopped', stage: 'render' };

  const media = probeMedia(tools, outputPath, expectedDuration);
  const captions = validateCaptionFile(captionsPath, media.durationSec);
  const chapters = readJsonIfPresent(chaptersPath, {});
  const chapterList = Array.isArray(chapters) ? chapters : chapters.chapters;
  if (!Array.isArray(chapterList) || chapterList.length !== config.scenes.length) throw new Error('Chapter contract failed: chapter count does not match render scenes.');
  for (let index = 1; index < chapterList.length; index += 1) {
    if (Number(chapterList[index].startSec) < Number(chapterList[index - 1].startSec)) throw new Error('Chapter contract failed: chapter order is not monotonic.');
  }
  const loudness = measureLoudness(tools, outputPath);
  const physicalReview = readJsonIfPresent(join(normalized.productionDir, 'professional-physical-review.json'), {});
  const calibration = readJsonIfPresent(join(normalized.productionDir, 'twelvelabs-calibration.json'), {});
  const professionalGate = evaluateProfessionalReleaseGate({
    deterministicPass: true,
    visuals,
    editorial: editorialReport,
    media: { ...media, valid: true },
    captions: { ...captions, valid: true },
    chapters: { count: chapterList.length, order: 'valid' },
    narration: { total: narration.records.length, complete: narration.records.length === config.scenes.length },
    provenance: { sourceGrounded: true, complete: normalized.scenes.every((scene) => sourcePagesForScene(scene).length > 0) },
    branding: { bannerPresent: true, introPresent: true, outroPresent: true },
    physicalReview,
    calibration,
  });
  const report = {
    status: 'PASS',
    projectId,
    language,
    voice: {
      name: normalized.voiceName,
      id: normalized.voiceId,
      provider: 'elevenlabs',
      modelId: narration.preset.modelId,
      narrationPreset: narration.preset.id,
      narrationPresetHash: narration.presetHash,
      voiceSettings: narration.preset.voiceSettings,
    },
    source: { pdf: normalized.sourcePdf, sha256: normalized.sourcePdfSha256 },
    scenes: { teaching: normalized.scenes.length, rendered: config.scenes.length },
    visuals: { ...visuals.counts, warnings: visuals.warnings },
    narration: { total: narration.records.length, reused: narration.reused, generated: narration.generated },
    handoff: { configPath, captionsPath, chaptersPath, reused: handoffReuse },
    branding: {
      bannerPath: resolve(root, DEFAULT_BRAND.bannerPath),
      transitionAudioPath: narration.brandTransitionPath,
      transitionHash: narration.brandTransitionHash,
      introPresent: true,
      outroPresent: true,
    },
    render: { outputPath, reused: renderReused, durationSec: media.durationSec, resolution: `${media.video.width}x${media.video.height}`, fps: media.video.avg_frame_rate, status: 'complete' },
    media: { ...media, loudness },
    captions,
    chapters: { count: chapterList.length, order: 'valid' },
    editorial: editorialReport,
    professionalGate,
    checkpoint: checkpointPath,
    generatedAt: new Date().toISOString(),
  };
  checkpoint.stages.qa = { inputHash: renderHash, media, captions, chapterCount: chapterList.length, loudness, editorial: editorialReport };
  delete checkpoint.stoppedAfter;
  jsonFile(checkpointPath, checkpoint);
  jsonFile(join(normalized.productionDir, REPORT_NAME), report);
  if (String(process.env.MOBIUS_EXTERNAL_VIDEO_QA || '').trim().toLowerCase() === 'twelvelabs') {
    let externalReview;
    try {
      externalReview = await analyzeProductionVideo({
        videoPath: outputPath,
        cachePath: join(root, 'data', 'twelvelabs', 'editorial-review-cache.json'),
      });
    } catch (error) {
      externalReview = { status: 'unavailable', configured: true, classification: 'unknown_provider_failure', error: String(error?.message || error) };
    }
    jsonFile(join(normalized.productionDir, 'twelvelabs-review.json'), externalReview);
    report.externalEditorialReview = buildExternalReviewSummary(externalReview);
    const updatedCalibration = readJsonIfPresent(join(normalized.productionDir, 'twelvelabs-calibration.json'), calibration);
    report.professionalGate = evaluateProfessionalReleaseGate({
      deterministicPass: true,
      visuals,
      editorial: editorialReport,
      media: { ...media, valid: true },
      captions: { ...captions, valid: true },
      chapters: { count: chapterList.length, order: 'valid' },
      narration: { total: narration.records.length, complete: narration.records.length === config.scenes.length },
      provenance: { sourceGrounded: true, complete: normalized.scenes.every((scene) => sourcePagesForScene(scene).length > 0) },
      branding: { bannerPresent: true, introPresent: true, outroPresent: true },
      physicalReview,
      calibration: updatedCalibration,
    });
    jsonFile(join(normalized.productionDir, REPORT_NAME), report);
  }
  console.log(JSON.stringify(report, null, 2));
  return report;
}

async function main() {
  const parsed = argsToObject();
  await runProduction({
    projectId: parsed.project || parsed['project-id'],
    language: parsed.lang || parsed.language || 'fr-CA',
    root: parsed.root || process.cwd(),
    baseUrl: parsed['base-url'],
    apiKey: parsed['api-key'],
    forceRender: parsed.flags.has('force-render'),
    stopAfter: parsed['stop-after-stage'],
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`[run-source-grounded-production] ${error.message}`);
    process.exitCode = 1;
  });
}
