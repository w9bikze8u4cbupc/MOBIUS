#!/usr/bin/env node

import crypto from 'node:crypto';
// MOBIUS_BENCHMARK_MIGRATION_ONLY: retained as historical recovery evidence.
// Canonical knowledge-driven production is owned by run-rulebook-production
// and assemble-knowledge-tutorial-r4.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import ffmpegStatic from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';
import sharp from 'sharp';
import dotenv from 'dotenv';
import { generateNarration } from '../src/services/elevenLabsService.js';
import editorialStandard from '../src/services/editorialStandard.cjs';

const require = createRequire(import.meta.url);
const { PRESENTATION_TOKENS } = require('../src/services/presentationDesignSystem.cjs');

const root = path.resolve(process.cwd());
dotenv.config({ path: path.join(root, '.env'), override: false });
const outputRoot = process.env.MOBIUS_FULL_TUTORIAL_OUTPUT_ROOT
  ? path.resolve(process.env.MOBIUS_FULL_TUTORIAL_OUTPUT_ROOT)
  : path.join(root, 'out', 'full-tutorial-r1');
const sonic = path.join(root, 'src', 'assets', 'branding', 'sonic', 'mobius-cafe-sonic-signature-v4.wav');
const banner = path.join(root, 'src', 'assets', 'branding', 'les-jeux-mobius-banner-canonical.png');
const voiceId = process.env.ELEVENLABS_VOICE_ID_AMELIE || 'UJCi4DDncuo0VJDSIegj';
const preset = editorialStandard.getNarrationPreset('warm-engaging-fr-ca');
const ffmpegBinary = typeof ffmpegStatic === 'string' ? ffmpegStatic : ffmpegStatic.path;
const ffmpeg = process.env.MOBIUS_FFMPEG_PATH && fs.existsSync(process.env.MOBIUS_FFMPEG_PATH) ? process.env.MOBIUS_FFMPEG_PATH : ffmpegBinary;
const ffprobe = process.env.MOBIUS_FFPROBE_PATH && fs.existsSync(process.env.MOBIUS_FFPROBE_PATH) ? process.env.MOBIUS_FFPROBE_PATH : ffprobeStatic.path;

const games = {
  '7-wonders-duel': {
    label: '7 Wonders Duel',
    sourcePdfSha256: '8b05c4ce1c4f211fd04d39627dd26593085faa16b6eb85aaac8f6cf89e6958f2',
    sourceArtifact: path.join(root, 'data', 'rulebook-images', '7-wonders-duel'),
    opening: path.join(root, 'out', 'mission-01', '7-wonders-duel', 'render-config.json'),
    components: path.join(root, 'out', 'hephaestus-recovery-r1', '7-wonders-duel', 'setup-evidence.json'),
    visualEvidence: path.join(root, 'out', 'gameplay-actions-r1', '7-wonders-duel', 'evidence.json'),
    gameplay: path.join(root, 'out', 'gameplay-actions-r1', '7-wonders-duel', 'preview-config.json'),
    scoring: path.join(root, 'out', 'scoring-endgame-r1', '7-wonders-duel', 'preview-config.json'),
    nativeVisualManifest: path.join(root, 'out', 'publishability-r3', '7-wonders-duel', 'native-visual-manifest.json'),
  },
  'terraforming-mars': {
    label: 'Terraforming Mars',
    sourcePdfSha256: 'fa06788222239dccf57e2d40d1cf6ccafb91ecba04ea25f52e7d037e60f7a1ee',
    sourceArtifact: path.join(root, 'data', 'tm-eng-bgg-fa0678822223', 'source', 'rulebook.pdf'),
    opening: path.join(root, 'out', 'mission-01', 'terraforming-mars', 'render-config.json'),
    components: path.join(root, 'out', 'hephaestus-recovery-r1', 'terraforming-mars', 'setup-evidence.json'),
    visualEvidence: path.join(root, 'out', 'gameplay-actions-r1', 'terraforming-mars', 'evidence.json'),
    gameplay: path.join(root, 'out', 'gameplay-actions-r1', 'terraforming-mars', 'preview-config.json'),
    scoring: path.join(root, 'out', 'scoring-endgame-r1', 'terraforming-mars', 'preview-config.json'),
  },
};

function args(argv = process.argv.slice(2)) {
  const values = {};
  const flags = new Set();
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const name = token.slice(2);
    if (argv[i + 1] && !argv[i + 1].startsWith('--')) { values[name] = argv[i + 1]; i += 1; }
    else flags.add(name);
  }
  return { values, flags };
}
function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function writeJson(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); }
function sha(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function hashValue(value) { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function exists(file) { return Boolean(file && fs.existsSync(file)); }
function safePath(file) { return String(file || '').replace(/\\/g, '/'); }

function findByBasename(name, roots = [path.join(root, 'out'), path.join(root, 'data'), path.join(root, 'src', 'assets')]) {
  const target = path.basename(name);
  const visit = (directory) => {
    if (!exists(directory)) return null;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      const candidate = path.join(directory, entry.name);
      if (entry.isFile() && entry.name === target) return candidate;
      if (entry.isDirectory()) { const result = visit(candidate); if (result) return result; }
    }
    return null;
  };
  return roots.map(visit).find(Boolean) || null;
}
function resolveAsset(file) { return exists(file) ? file : findByBasename(file); }
function resolveSceneAssets(scene) {
  const out = JSON.parse(JSON.stringify(scene));
  if (out.background?.image) out.background.image = resolveAsset(out.background.image) || out.background.image;
  if (out.audio?.file) out.audio.file = resolveAsset(out.audio.file) || out.audio.file;
  if (out.audio?.ambientFile) out.audio.ambientFile = resolveAsset(out.audio.ambientFile) || out.audio.ambientFile;
  return out;
}
function sceneReferencePages(scene) {
  const pages = [];
  for (const ref of scene.sourceRefs || []) if (Number.isFinite(Number(ref.page))) pages.push(Number(ref.page));
  const sourcePage = scene.visualSelection?.sourcePage || scene.visualSelection?.page;
  if (Number.isFinite(Number(sourcePage))) pages.push(Number(sourcePage));
  for (const overlay of scene.overlays || []) {
    const match = String(overlay.text || '').match(/(?:p\.?|page|pages?)\s+(\d+)/i);
    if (match) pages.push(Number(match[1]));
  }
  return [...new Set(pages)].sort((a, b) => a - b);
}
function referenceText(pages) {
  if (!pages.length) return 'Source vérifiée';
  const contiguous = pages.length > 1 && pages.every((page, i) => i === 0 || page === pages[i - 1] + 1);
  if (contiguous) return `Livret p. ${pages[0]}–${pages.at(-1)}`;
  return `Livret p. ${pages.join(', ')}`;
}
function overlay(scene, type) { return (scene.overlays || []).find((item) => item.type === type); }
function withReference(scene) {
  const out = resolveSceneAssets(scene);
  out.sourceRefs = out.sourceRefs || sceneReferencePages(scene).map((page) => ({ page, source: 'vertical-source-artifact' }));
  return out;
}
function makeBrandScene(source) {
  const scene = source.find((item) => item.id === 'brand-intro' || item.id === 'brand-signature');
  return { ...resolveSceneAssets(scene), id: 'brand-signature', chapterTitle: 'Bienvenue', type: 'brand_intro', audio: { ...(scene.audio || {}), ambientFile: resolveAsset(scene.audio?.ambientFile) || sonic, speechRequired: false }, narrationText: '', spokenNarration: 'NONE', ttsGenerated: false, sourceRefs: [] };
}
function makeSectionCard(title, id, used) {
  return {
    id: dedupeId(`section-card-${id}`, used),
    chapterTitle: title,
    section: title,
    type: 'section_card',
    sectionCard: true,
    majorSection: title,
    durationSec: 2.0,
    narrationText: '',
    spokenNarration: 'NONE',
    sourceRefs: [],
    background: { image: banner, kind: 'section-card', provenance: { assetId: 'brand-banner-canonical', visualUtility: 'CONTEXTUAL_INSTRUCTIONAL', reviewState: 'accepted' } },
    layout: { mode: 'brand', sectionCard: true, panelVariant: 'WARM_DARK' },
    overlays: [{ type: 'section-card-title', text: title, position: 'section-card-title', fontColor: '#f7ecd2' }],
    audio: { speechRequired: false, ambientFile: null, role: 'section-card-no-speech' },
  };
}
function makeOutroScene(source, audioManifest = null) {
  const scene = source.find((item) => item.id === 'brand-outro' || item.id === 'end-card');
  const out = { ...resolveSceneAssets(scene), id: 'brand-outro', chapterTitle: 'Merci et à bientôt', type: 'teaching', sourceRefs: sceneReferencePages(scene) };
  const cleanText = String(scene?.narrationText || scene?.audio?.sourceText || '').replace(/\s+/g, ' ').trim();
  out.narrationText = cleanText;
  out.spokenNarration = cleanText;
  out.audio = { ...(out.audio || {}), narrationPreset: 'AMELIE_OUTRO', deliveryProfile: 'AMELIE_OUTRO', speechRequired: true };
  const textHash = hashValue({ text: cleanText, voiceId, modelId: preset.modelId, profile: 'AMELIE_OUTRO', contract: 'outro-no-false-start-v1' });
  out.audio.sourceTextHash = textHash;
  const audioFile = path.join(audioManifest?.path || path.join(root, 'out', 'audio'), 'brand-outro-r3.mp3');
  const prior = audioManifest?.assets?.find((asset) => asset.sceneId === 'brand-outro' && asset.sourceTextHash === textHash && exists(asset.filePath)) || null;
  out.audio.file = prior?.filePath || audioFile;
  out.generatedNarration = { sceneId: 'brand-outro', text: cleanText, sourceTextHash: textHash, profile: 'AMELIE_OUTRO', reused: Boolean(prior), contract: 'outro-no-false-start-v1' };
  if (audioManifest && !prior) audioManifest.pending.push({ scene: out, row: { id: 'brand-outro', text: cleanText }, audioFile, existing: null, profile: 'AMELIE_OUTRO' });
  const narrationDurationSec = prior ? probeDuration(prior.filePath) : probeDuration(out.audio?.file);
  const safeTailSec = 1.2;
  const requiredDurationSec = Number((narrationDurationSec + safeTailSec + 0.01).toFixed(3));
  out.durationSec = Math.max(Number(out.durationSec || 0), requiredDurationSec);
  out.outroCompletionGuard = { narrationDurationSec, safeTailSec, requiredDurationSec, valid: out.durationSec >= requiredDurationSec };
  return out;
}
function dedupeId(id, used) {
  const base = String(id || 'scene').replace(/[^a-zA-Z0-9_-]+/g, '-');
  let value = base; let n = 2;
  while (used.has(value)) value = `${base}-${n++}`;
  used.add(value); return value;
}
function cloneTeaching(source, used, prefix, titleOverrides = {}) {
  return source.filter((scene) => !['brand-intro', 'brand-signature', 'brand-outro', 'end-card'].includes(scene.id)).map((scene) => {
    const out = withReference(scene);
    out.id = dedupeId(`${prefix}-${scene.id}`, used);
    if (titleOverrides[scene.id]) out.chapterTitle = titleOverrides[scene.id];
    out.section = out.chapterTitle || out.section || out.id;
    out.type = out.type || 'teaching';
    out.overlays = (out.overlays || []).filter((item) => item.type !== 'badge');
    return out;
  });
}
function replaceOverlayText(scene, type, text) {
  const overlays = (scene.overlays || []).map((item) => item.type === type ? { ...item, text } : item);
  return { ...scene, overlays };
}
function reconcile7wdTeachingScene(scene) {
  const id = scene.id;
  let out = scene;
  if (id.includes('gameplay-action-choisir-une-carte')) {
    const text = 'À chaque tour, choisissez une carte accessible dans la structure. Elle quitte la structure, puis les cartes qu’elle libère deviennent accessibles.';
    out = { ...out, narrationText: text, sourceRefs: [{ page: 10, source: 'official-7wd-rulebook' }, { page: 20, source: 'official-7wd-rulebook' }], visualBinding: { ...(out.visualBinding || {}), componentName: 'Carte accessible et structure d’Âge', displayLabelFrCa: 'Carte accessible', sourcePage: 10, visualUtility: 'EXACT_INSTRUCTIONAL' } };
    out = replaceOverlayText(out, 'heading', 'Choisir une carte accessible');
    out = replaceOverlayText(out, 'body', 'AVANT — Des cartes accessibles sont visibles.\nACTION — Choisissez-en une.\nAPRÈS — La carte quitte la structure et de nouvelles cartes peuvent devenir accessibles.');
  } else if (id.includes('gameplay-action-defausser-pour-obtenir-des-pieces')) {
    const text = 'Si vous ne construisez pas la carte, vous pouvez la défausser pour recevoir des pièces de la banque.';
    out = { ...out, narrationText: text, sourceRefs: [{ page: 10, source: 'official-7wd-rulebook' }], visualBinding: { ...(out.visualBinding || {}), componentName: 'Carte défaussée et pièces', displayLabelFrCa: 'Défausser pour obtenir des pièces', sourcePage: 10, visualUtility: 'EXACT_INSTRUCTIONAL' } };
    out = replaceOverlayText(out, 'heading', 'Défausser pour obtenir des pièces');
    out = replaceOverlayText(out, 'body', 'CARTE — Une carte accessible est choisie.\nACTION — Défaussez-la.\nAPRÈS — La banque vous donne des pièces.');
  } else if (id.includes('scoring-scoring-military-points') || id.includes('scoring-immediate-victory')) {
    const text = id.includes('scoring-immediate-victory')
      ? 'La partie s’arrête immédiatement si le pion Conflit atteint la capitale adverse, ou si une civilisation réunit les six symboles scientifiques différents.'
      : 'Chaque bouclier fait avancer le pion Conflit d’une case vers la capitale adverse. En entrant dans une zone, appliquez son jeton Militaire : l’adversaire perd deux ou cinq pièces. Si le pion atteint sa capitale, c’est la suprématie militaire.';
    out = { ...out, narrationText: text, sourceRefs: [{ page: 12, source: 'official-7wd-rulebook' }], layout: { ...(out.layout || {}), mode: 'wide-diagram', panelVariant: 'WARM_DARK' }, visualBinding: { ...(out.visualBinding || {}), componentName: 'Piste Militaire et pion Conflit', displayLabelFrCa: 'Piste militaire', sourcePage: 12, visualUtility: 'EXACT_INSTRUCTIONAL' } };
    out = replaceOverlayText(out, 'body', id.includes('scoring-immediate-victory') ? 'SUPRÉMATIE MILITAIRE — Le pion atteint la capitale adverse.\nSUPRÉMATIE SCIENTIFIQUE — Six symboles scientifiques différents.' : 'BOUCLIERS → pion Conflit vers la capitale\nZONE MILITAIRE → perte de 2 ou 5 pièces\nCAPITALE ADVERSE → suprématie militaire');
  } else if (id.includes('scoring-final-phase')) {
    out = { ...out, visualBinding: { ...(out.visualBinding || {}), componentName: 'Structure de l’Âge III', displayLabelFrCa: 'Fin de l’Âge III', sourcePage: 13, visualUtility: 'EXACT_INSTRUCTIONAL' } };
  }
  return out;
}
function probeDuration(file) {
  try {
    const output = execFileSync(ffprobe, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', file], { encoding: 'utf8' });
    return Number(JSON.parse(output).format?.duration || 0);
  } catch { return 0; }
}
function materializeMetadataDelivery(scene, outputDir) {
  const profile = editorialStandard.getNarrationDeliveryProfile('AMELIE_METADATA');
  const source = resolveAsset(scene.audio?.file);
  if (!source || !exists(source) || !profile?.speedFactor || profile.speedFactor === 1) return scene;
  const target = path.join(outputDir, 'audio', 'metadata-card-amelie-metadata.mp3');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (!exists(target)) execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-i', source, '-filter:a', `atempo=${profile.speedFactor}`, '-c:a', 'libmp3lame', '-q:a', '2', target]);
  const sourceDurationSec = probeDuration(source);
  const durationSec = probeDuration(target);
  return { ...scene, audio: { ...(scene.audio || {}), file: target, narrationPreset: 'AMELIE_METADATA', deliveryProfile: 'AMELIE_METADATA', sourceAudioFile: source, sourceAudioDurationSec: sourceDurationSec, deliverySpeedFactor: profile.speedFactor }, durationSec: Number((durationSec + 0.04).toFixed(3)), generatedNarration: { ...(scene.generatedNarration || {}), profile: 'AMELIE_METADATA', deliverySpeedFactor: profile.speedFactor, sourceAudioFile: source, filePath: target } };
}
function localizeLabel(value) { return editorialStandard.localizeComponentLabel(value).displayLabelFrCa; }
function dedupeNarrationAssets(assets = []) {
  const byKey = new Map();
  for (const asset of assets) byKey.set(`${asset.sceneId || ''}|${asset.sourceTextHash || ''}`, asset);
  return [...byKey.values()];
}
function loadNativeManifest(file) { return exists(file) ? readJson(file) : null; }
function nativeById(manifest, id) { return manifest?.assets?.find((asset) => asset.id === id) || null; }
function assetUsable(asset) {
  return asset && exists(asset.filePath) && asset.visualUtility !== 'DECORATIVE_RULEBOOK_ART' && asset.visualUtility !== 'IRRELEVANT';
}
function chooseNativeVisual(manifest, descriptor = '', role = '') {
  if (!manifest?.assets?.length) return null;
  const text = `${descriptor} ${role}`.toLowerCase();
  let preferredIds;
  if (/setup-progress-coins|progrès et pièces/.test(text)) preferredIds = ['r3-setup-progress-and-coins', 'r3-setup-central-hdpi'];
  else if (/scoring-scoring-overview|scoring-winner-resolution|calcul des points|ce qu’on compte/.test(text)) preferredIds = ['r3-scoring-categories-collage', 'r3-military-track-wide-hdpi'];
  else if (/scoring-scoring-military|scoring-immediate-victory|military|militaire|conflit|shield|bouclier|piste/.test(text)) preferredIds = ['r3-military-track-wide-hdpi', 'p11_img19_xref621'];
  else if (/gameplay-action-defausser|discard|défausser|defausser/.test(text)) preferredIds = ['r3-discard-to-coins', 'r3-age-i-layout-hdpi'];
  else if (/scoring-scoring-progress|progress|progrès/.test(text)) preferredIds = ['r3-progress-tokens-pure-hdpi', 'p1_img18_xref77'];
  else if (/scoring-scoring-treasury|treasury|coin|pièce/.test(text)) preferredIds = ['r3-coins-pure-hdpi', 'p1_img6_xref51'];
  else if (/scoring-scoring-buildings|building|bâtiment/.test(text)) preferredIds = ['p3_img9_xref185', 'p4_img2_xref238'];
  else if (/wonder-selection|wonder-construction|limite de construction|sélection.*merveille|merveille.*sélection/.test(text)) preferredIds = ['r3-wonder-selection-hdpi', 'r3-age-layouts-hdpi'];
  else if (/scoring-scoring-wonders|wonder|merveille/.test(text)) preferredIds = ['p4_img2_xref238', 'r3-wonder-selection-hdpi'];
  else if (/action-choisir|carte accessible|accessible card/.test(text)) preferredIds = ['r3-age-i-accessible-card-hdpi', 'r3-age-i-layout-hdpi'];
  else if (/age-layout|structure.*âge|structure.*age|face visible|face cachée|face cachee/.test(text)) preferredIds = ['r3-age-layouts-hdpi', 'r3-age-i-layout-hdpi'];
  else if (/setup-central|plateau|pion conflit|jetons militaire|sept pièces/.test(text)) preferredIds = ['r3-setup-central-hdpi', 'r3-age-layouts-hdpi'];
  else if (role === 'setup') preferredIds = ['r3-setup-central-hdpi', 'r3-age-layouts-hdpi'];
  else if (role === 'components') preferredIds = ['page2-components-hdpi', 'r3-setup-central-hdpi'];
  else if (/gameplay-game-loop/.test(text)) preferredIds = ['p0_img3_xref28', 'r3-age-layouts-hdpi'];
  else if (/gameplay-action-construire/.test(text)) preferredIds = ['p4_img2_xref238', 'p3_img9_xref185'];
  else if (/présentation|presentation|theme|thème/.test(text)) preferredIds = ['p0_img3_xref28', 'p0_img0_xref25'];
  else if (/objectif|science|scientifi|suprématie/.test(text)) preferredIds = ['r3-military-track-wide-hdpi', 'p11_img19_xref621'];
  else if (/card|carte|action|component|composant/.test(text)) preferredIds = ['r3-age-i-layout-hdpi', 'p3_img9_xref185', 'p4_img2_xref238'];
  else preferredIds = ['p0_img3_xref28', 'r3-age-layouts-hdpi'];
  for (const id of preferredIds) {
    const asset = nativeById(manifest, id);
    if (assetUsable(asset)) return asset;
  }
  return manifest.assets.find((asset) => assetUsable(asset) && asset.width >= 250 && asset.height >= 180) || null;
}
function attachNativeVisual(scene, manifest) {
  if (!manifest || scene.id === 'brand-signature' || scene.id === 'brand-outro' || scene.id.includes('metadata')) return scene;
  const descriptor = `${scene.id} ${scene.chapterTitle || ''} ${scene.narrationText || ''} ${scene.visualBinding?.componentName || ''}`;
  const asset = chooseNativeVisual(manifest, descriptor, scene.type);
  if (!asset) return scene;
  return {
    ...scene,
    background: { ...(scene.background || {}), image: asset.filePath, kind: asset.nativeMaster === false ? 'high-dpi-source-crop' : 'native-embedded-component', provenance: { ...(scene.background?.provenance || {}), assetId: asset.id, sourcePage: asset.page, extractionMethod: asset.extractionMethod, sourceDimensions: { width: asset.width, height: asset.height }, nativeMaster: asset.nativeMaster !== false, sourceRegion: asset.sourceRegion || null, sourcePdfSha256: manifest.sourcePdfSha256, visualUtility: asset.visualUtility || 'CONTEXTUAL_INSTRUCTIONAL', cropPurity: asset.cropPurity || 'unknown', reviewState: 'accepted' } },
    visualSelection: { source: 'native-embedded', assetId: asset.id, page: asset.page, width: asset.width, height: asset.height, extractionMethod: asset.extractionMethod },
  };
}
function setupPaths(evidence) {
  const rows = evidence.bindings || [];
  return rows.map((row) => row.bindings?.find((binding) => binding.reviewState === 'accepted') || row.bindings?.[0]).filter(Boolean);
}
function selectReusableVisual(visualEvidence, role, fallback, preferred = null) {
  if (preferred && exists(resolveAsset(preferred))) {
    return { path: resolveAsset(preferred), provenance: null };
  }
  const candidates = (visualEvidence?.acceptedVisuals || []).filter((item) => item.reviewState === 'accepted' && exists(resolveAsset(item.renderPath || item.sourceImage)));
  if (!candidates.length) return { path: resolveAsset(fallback), provenance: null };
  const ranked = candidates.map((item) => ({ item, path: resolveAsset(item.renderPath || item.sourceImage) }))
    .filter((entry) => entry.path)
    .sort((a, b) => {
      const descriptorA = `${a.item.category || ''} ${a.item.componentName || ''}`;
      const descriptorB = `${b.item.category || ''} ${b.item.componentName || ''}`;
      const nativeA = a.item.extractionMethod === 'pymupdf-native-raster' ? 2 : 0;
      const nativeB = b.item.extractionMethod === 'pymupdf-native-raster' ? 2 : 0;
      const componentA = role === 'components'
        ? (/card|deck/i.test(descriptorA) ? 4 : /token|currency|component|meeple|tile|cube|marker/i.test(descriptorA) ? 2 : 0)
        : 0;
      const componentB = role === 'components'
        ? (/card|deck/i.test(descriptorB) ? 4 : /token|currency|component|meeple|tile|cube|marker/i.test(descriptorB) ? 2 : 0)
        : 0;
      const nonBoardA = role === 'components' && /board|table|plateau/i.test(descriptorA) ? -3 : 0;
      const nonBoardB = role === 'components' && /board|table|plateau/i.test(descriptorB) ? -3 : 0;
      const boardA = role === 'setup' && /board|table|plateau|setup/i.test(descriptorA) ? 4 : 0;
      const boardB = role === 'setup' && /board|table|plateau|setup/i.test(descriptorB) ? 4 : 0;
      const scoreA = nativeA + componentA + nonBoardA + boardA + Number(a.item.pedagogicalUsefulness || 0) + Number(a.item.confidence || 0);
      const scoreB = nativeB + componentB + nonBoardB + boardB + Number(b.item.pedagogicalUsefulness || 0) + Number(b.item.confidence || 0);
      return scoreB - scoreA;
    });
  const selected = ranked[0];
  return { path: selected.path, provenance: { assetId: selected.item.id, componentName: selected.item.componentName, category: selected.item.category, sourcePage: selected.item.pageNumber, extractionMethod: selected.item.extractionMethod, confidence: selected.item.confidence, reviewState: selected.item.reviewState } };
}
function buildGeneratedSetupScenes(game, opening, setupEvidence, visualEvidence, used, audioManifest, nativeManifest = null) {
  const bindings = setupPaths(setupEvidence);
  if (!bindings.length) throw new Error(`${game.label}: no source-grounded setup bindings available.`);
  const localizedBindings = bindings.map((binding) => ({ ...binding, ...editorialStandard.localizeComponentLabel(binding.componentName) }));
  const names = [...new Set(localizedBindings.map((binding) => binding.displayLabelFrCa).filter(Boolean))];
  const fallbackPages = [...new Set(bindings.map((binding) => Number(binding.sourcePage)).filter(Number.isFinite))].sort((a, b) => a - b);
  const is7wd = game.label === '7 Wonders Duel';
  const rows = is7wd
    ? [
      { id: 'components', chapterTitle: 'Les composants', heading: 'Les composants', text: 'Voici les éléments que vous allez manipuler : le plateau, les cartes des Âges, les cartes Merveille, les pièces, le pion Conflit et les jetons Militaire et Progrès.', pages: [3, 4], visualRole: 'components', setupStep: null },
      { id: 'setup-central', chapterTitle: 'Mise en place', heading: 'Préparer le centre', text: 'Placez le plateau entre vous. Posez le pion Conflit sur l’espace neutre du milieu, puis placez les quatre jetons Militaire face visible sur leurs emplacements.', pages: [6], visualRole: 'setup-central', setupStep: { action: 'préparer le centre', componentRefs: ['Game Board', 'Conflict Pawn', 'Military Tokens'], quantities: { 'Military Tokens': 4 }, state: 'face visible', destination: 'plateau central', sourceRefs: [{ page: 6 }], confidence: 0.99, reviewState: 'accepted' } },
      { id: 'setup-progress-coins', chapterTitle: 'Mise en place', heading: 'Progrès et pièces', text: 'Mélangez les jetons Progrès, placez-en cinq au hasard face visible sur le plateau et remettez les autres dans la boîte. Chaque joueur prend ensuite sept pièces à la banque.', pages: [6], visualRole: 'setup-central', setupStep: { action: 'placer les jetons Progrès et distribuer les pièces', componentRefs: ['Progress Tokens', 'Coins'], quantities: { 'Progress Tokens': 5, Coins: 7 }, state: 'face visible pour les jetons', destination: 'plateau et réserve personnelle', sourceRefs: [{ page: 6 }], confidence: 0.99, reviewState: 'accepted' } },
      { id: 'setup-wonder-selection', chapterTitle: 'Mise en place', heading: 'Choisir les merveilles', text: 'Mélangez les douze cartes Merveille. Offrez-en quatre face visible : le premier joueur en choisit une, l’autre en choisit deux, puis le premier prend la dernière. Recommencez avec quatre nouvelles cartes en inversant le premier joueur. Chacun termine avec quatre merveilles.', pages: [7], visualRole: 'wonder-selection', setupStep: { action: 'sélectionner les merveilles', componentRefs: ['Wonder Cards'], quantities: { 'Wonder Cards': 12, 'offered per group': 4, 'per player': 4 }, ordering: ['first player takes 1', 'second player takes 2', 'first player takes 1'], destination: 'colonne personnelle', sourceRefs: [{ page: 7 }], confidence: 0.99, reviewState: 'accepted' } },
      { id: 'setup-wonder-construction-limit', chapterTitle: 'Mise en place', heading: 'Limite de construction', text: 'Pendant la partie, seules sept merveilles peuvent être construites. Quand la septième est construite, la dernière merveille non construite retourne dans la boîte.', pages: [11], visualRole: 'wonder-construction', setupStep: { action: 'appliquer la limite de construction des merveilles', componentRefs: ['Wonder Cards'], quantities: { maximumBuilt: 7 }, destination: 'boîte pour la merveille restante', sourceRefs: [{ page: 11 }], confidence: 0.99, reviewState: 'accepted' } },
      { id: 'setup-age-decks', chapterTitle: 'Mise en place', heading: 'Préparer les âges', text: 'Retirez sans les regarder trois cartes de chaque paquet Âge. Ajoutez ensuite trois guildes tirées au hasard au paquet de l’Âge III et remettez les autres guildes dans la boîte.', pages: [7], visualRole: 'age-layouts', setupStep: { action: 'préparer les paquets', componentRefs: ['Age I Cards', 'Age II Cards', 'Age III Cards', 'Guild Cards'], quantities: { 'removed from each Age deck': 3, 'Guilds added to Age III': 3 }, sourceRefs: [{ page: 7 }], confidence: 0.99, reviewState: 'accepted' } },
      { id: 'setup-age-structure', chapterTitle: 'Mise en place', heading: 'Construire la structure de cartes', text: 'Au début de chaque âge, mélangez le paquet correspondant et disposez vingt cartes selon le schéma officiel. Les cartes claires sont face visible et les cartes teintées face cachée. Le livret montre les structures des trois âges.', pages: [10, 20], visualRole: 'age-layouts', pauseCue: true, setupStep: { action: 'disposer la structure de cartes', componentRefs: ['Age I Cards', 'Age II Cards', 'Age III Cards'], quantities: { cardsInStructure: 20 }, state: 'face visible et face cachée selon le schéma', destination: 'structure centrale', sourceRefs: [{ page: 10 }, { page: 20 }], confidence: 0.99, reviewState: 'accepted', pauseCue: 'Pause ici pour reproduire la mise en place' } },
    ]
    : [
      { id: 'components', chapterTitle: 'Les composants', heading: 'Les composants', text: `Voici les composants principaux : ${names.slice(0, 6).join(', ')}.`, pages: fallbackPages, visualRole: 'components', setupStep: null },
      { id: 'setup', chapterTitle: 'Mise en place', heading: 'Mise en place', text: `Pour la mise en place, préparez ${localizedBindings.slice(0, 5).map((binding) => binding.displayLabelFrCa).join(', ')}. Suivez les quantités indiquées par le livret.`, pages: fallbackPages, visualRole: 'setup', setupStep: { action: 'préparer le jeu', componentRefs: bindings.map((binding) => binding.componentName), sourceRefs: fallbackPages.map((page) => ({ page })), confidence: 0.7, reviewState: 'review-required' } },
    ];
  const scenes = rows.map((row) => {
    const spokenText = editorialStandard.normalizeSpokenSymbols(row.text);
    const binding = localizedBindings[0];
    const nativeAsset = chooseNativeVisual(nativeManifest, `${row.id} ${row.heading} ${row.text}`, row.visualRole || 'setup');
    const sourceImage = nativeAsset?.filePath || binding.focusedVisualPath || binding.renderPath;
    const selectedProvenance = nativeAsset
      ? { assetId: nativeAsset.id, componentName: row.heading, sourcePage: nativeAsset.page, extractionMethod: nativeAsset.extractionMethod, confidence: row.setupStep?.confidence || 0.96, reviewState: row.setupStep?.reviewState || 'accepted', nativeMaster: nativeAsset.nativeMaster !== false, sourceRegion: nativeAsset.sourceRegion || null, sourceDimensions: { width: nativeAsset.width, height: nativeAsset.height }, sourcePdfSha256: nativeManifest?.sourcePdfSha256, visualUtility: nativeAsset.visualUtility || 'EXACT_INSTRUCTIONAL' }
      : { assetId: binding.assetId, componentName: binding.displayLabelFrCa, sourcePage: binding.sourcePage, extractionMethod: binding.extractionMethod, confidence: binding.confidence, reviewState: binding.reviewState, visualUtility: 'CONTEXTUAL_INSTRUCTIONAL' };
    const audioFile = path.join(audioManifest.path, `${row.id}.mp3`);
    const textHash = hashValue({ text: spokenText, voiceId, modelId: preset.modelId, profile: 'AMELIE_TEACHING' });
    const prior = audioManifest.assets.find((asset) => asset.sceneId === row.id && asset.sourceTextHash === textHash && exists(asset.filePath));
    const existing = prior?.filePath || null;
    const overlays = [
      { type: 'heading', text: row.heading, position: 'panel-heading', fontColor: '#f7ecd2' },
      { type: 'body', text: row.displayText || row.text, position: 'panel-body', fontColor: '#f7ecd2' },
      { type: 'reference', text: referenceText(row.pages), position: 'reference-bottom-left', fontColor: '#c99b5b' },
    ];
    if (row.pauseCue) overlays.push({ type: 'pause-cue', text: row.setupStep.pauseCue, position: 'pause-cue', fontColor: '#b7ef59' });
    const scene = {
      id: dedupeId(`${game.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${row.id}`, used),
      chapterTitle: row.chapterTitle,
      section: row.chapterTitle,
      majorSection: 'Mise en place',
      type: 'teaching',
      narrationText: editorialStandard.normalizeSpokenSymbols(row.text),
      pauseCue: row.pauseCue ? row.setupStep.pauseCue : null,
      setupStep: row.setupStep,
      background: { image: sourceImage, kind: nativeAsset ? 'source-grounded-instructional' : 'focused-component-visual', provenance: selectedProvenance },
      layout: { mode: 'split-teaching', textSide: 'left', imageSide: 'right', panelVariant: 'WARM_DARK', presentationLayout: { contentType: 'list', minimumFontPx: 48 } },
      overlays,
      sourceRefs: row.pages.map((page) => ({ page, source: 'official-7wd-rulebook', pdfSha256: nativeManifest?.sourcePdfSha256 })),
      visualBinding: { componentName: selectedProvenance.componentName, sourceLabel: row.setupStep?.componentRefs?.join(', ') || binding.sourceLabel, displayLabelFrCa: row.heading, assetId: selectedProvenance.assetId, sourcePage: selectedProvenance.sourcePage, focusedVisualPath: sourceImage, confidence: selectedProvenance.confidence, reviewState: selectedProvenance.reviewState, extractionMethod: selectedProvenance.extractionMethod, visualUtility: selectedProvenance.visualUtility, cropPurity: nativeAsset?.cropPurity || 'unknown' },
      audio: { file: existing || audioFile, ambientFile: sonic, ambientGain: 0.12, ambientFadeOutSec: 0.9, speechRequired: true, provider: 'elevenlabs', providerVoiceId: voiceId, narrationPreset: 'AMELIE_TEACHING', sourceTextHash: textHash },
      generatedNarration: { sceneId: row.id, text: editorialStandard.normalizeSpokenSymbols(row.text), sourceTextHash: textHash, profile: 'AMELIE_TEACHING', reused: Boolean(existing) },
    };
    audioManifest.pending.push({ scene, row: { ...row, text: spokenText }, audioFile, existing });
    return scene;
  });
  return { scenes, setupSteps: rows.map((row) => row.setupStep).filter(Boolean) };
}
async function generateMissingNarration(audioManifest) {
  let generated = 0; let reused = 0;
  for (const item of audioManifest.pending) {
    const target = item.existing || item.audioFile;
    if (!item.existing) {
      await generateNarration(item.row.text, voiceId, target, { modelId: preset.modelId, voiceSettings: item.profile === 'AMELIE_OUTRO' ? (preset.outroVoiceSettings || preset.voiceSettings) : preset.voiceSettings });
      generated += 1;
    } else reused += 1;
    const durationSec = probeDuration(target);
    item.scene.audio.file = target;
    item.scene.durationSec = Math.max(2.5, Number((durationSec + 0.04).toFixed(3)));
    if (item.scene.outroCompletionGuard) {
      const requiredDurationSec = Number((durationSec + item.scene.outroCompletionGuard.safeTailSec + 0.01).toFixed(3));
      item.scene.durationSec = Math.max(item.scene.durationSec, requiredDurationSec);
      item.scene.outroCompletionGuard = { ...item.scene.outroCompletionGuard, narrationDurationSec: durationSec, requiredDurationSec, valid: item.scene.durationSec >= requiredDurationSec };
    }
    item.scene.generatedNarration.durationSec = durationSec;
    item.scene.generatedNarration.filePath = target;
    audioManifest.assets = audioManifest.assets.filter((asset) => !(asset.sceneId === item.row.id && asset.sourceTextHash === item.scene.audio.sourceTextHash));
    audioManifest.assets.push({ sceneId: item.row.id, sourceText: item.row.text, sourceTextHash: item.scene.audio.sourceTextHash, filePath: target, durationSec, reused: Boolean(item.existing) });
  }
  return { generated, reused };
}
function makeChapters(scenes) {
  let start = 0;
  const chapters = [];
  for (const scene of scenes) {
    if (scene.sectionCard) chapters.push({ startSec: Number(start.toFixed(3)), title: scene.chapterTitle || scene.section || scene.id, sceneId: scene.id });
    start += Number(scene.durationSec || 0);
  }
  return chapters;
}
function buildAudit(game) {
  const input = games[game];
  const files = [input.opening, input.components, input.gameplay, input.scoring];
  return {
    schema_version: 'mobius-full-tutorial-assembly-audit-v1',
    generatedAt: new Date().toISOString(),
    currentTruth: { scoringEndgame: 'TECHNICAL_PASS', generatorNative: true, deterministicViolations: 0, twelveLabs: 'ADVISORY' },
    game,
    label: input.label,
    source: { pdfSha256: input.sourcePdfSha256, artifact: input.sourceArtifact, artifactExists: exists(input.sourceArtifact), artifactSha256: exists(input.sourceArtifact) && fs.statSync(input.sourceArtifact).isFile() ? sha(input.sourceArtifact) : null },
    capabilities: files.map((file) => ({ file, exists: exists(file), classification: 'REUSE' })),
    assembly: { classification: 'RECONNECT', canonicalTimeline: ['brand-signature', 'presentation', 'theme', 'objective', 'components', 'setup', 'game-loop', 'actions', 'guidance', 'endgame', 'scoring', 'recap', 'outro'] },
    expensiveAssets: { existingOpening: true, existingGameplay: true, existingScoring: true, missingNarrationOnly: ['components', 'setup'] },
  };
}
async function createReviewSheet(game, config, outputDir) {
  const reviewDir = path.join(outputDir, 'physical-review'); fs.mkdirSync(reviewDir, { recursive: true });
  const targetSpecs = [
    ['intro', 'brand-signature'],
    ['presentation', 'opening-scene-section-01-1'],
    ['objective', 'opening-scene-section-02-2'],
    ['components', '-components'],
    ['wonder-selection', 'setup-wonder-selection'],
    ['wonder-limit', 'setup-wonder-construction-limit'],
    ['age-structure', 'setup-age-structure'],
    ['game-loop', 'gameplay-game-loop'],
    ['choose-card', 'action-choisir-une-carte'],
    ['discard-coins', 'action-defausser-pour-obtenir-des-pieces'],
    ['military-track', 'scoring-scoring-military-points'],
    ['immediate-victory', 'scoring-immediate-victory'],
    ['scoring', 'scoring-scoring-overview'],
    ['outro', 'brand-outro'],
  ];
  const sceneStarts = new Map(); let cursor = 0;
  for (const scene of config.scenes) { sceneStarts.set(scene.id, cursor); cursor += Number(scene.durationSec || 0); }
  const targets = targetSpecs.map(([name, needle]) => {
    const scene = config.scenes.find((candidate) => candidate.id === needle || candidate.id.includes(needle));
    const start = scene ? Number(sceneStarts.get(scene.id) || 0) : 0;
    return { name, time: start + Math.min(0.5, Number(scene?.durationSec || 1) / 2) };
  });
  const frames = [];
  for (const target of targets) {
    const frame = path.join(reviewDir, `${target.name}.png`);
    execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-ss', String(target.time), '-i', config.__renderPath, '-frames:v', '1', '-vf', 'scale=480:-1', frame]);
    if (!exists(frame) || fs.statSync(frame).size === 0) throw new Error(`Review frame missing: ${frame}`);
    frames.push({ ...target, path: frame });
  }
  const metadata = await Promise.all(frames.map((frame) => sharp(frame.path).metadata()));
  const tileW = 480; const tileH = Math.round(metadata[0].height || 270); const cols = 3; const rows = Math.ceil(frames.length / cols);
  const composites = frames.map((frame, index) => ({ input: fs.readFileSync(frame.path), left: (index % cols) * tileW, top: Math.floor(index / cols) * tileH }));
  const board = path.join(outputDir, 'physical-review', 'contact-sheet.png');
  await sharp({ create: { width: tileW * cols, height: tileH * rows, channels: 3, background: '#211a16' } }).composite(composites).png().toFile(board);
  const boardMeta = await sharp(board).metadata();
  if (boardMeta.format !== 'png' || !boardMeta.width || !boardMeta.height) throw new Error(`Invalid review sheet: ${board}`);
  return { board, width: boardMeta.width, height: boardMeta.height, frames };
}
function qaConfig(config, outputDir) {
  const violations = [];
  if (!config.scenes.length) violations.push({ id: 'DET-FULL-001', issue: 'no scenes' });
  const seen = new Set();
  for (const scene of config.scenes) {
    if (seen.has(scene.id)) violations.push({ id: 'DET-FULL-002', sceneId: scene.id, issue: 'duplicate scene id' });
    seen.add(scene.id);
    if (!scene.durationSec || scene.durationSec <= 0) violations.push({ id: 'DET-FULL-003', sceneId: scene.id, issue: 'invalid duration' });
    if (scene.background?.image && !exists(scene.background.image)) violations.push({ id: 'DET-FULL-004', sceneId: scene.id, issue: 'missing visual asset' });
    if (scene.narrationText && scene.audio?.speechRequired !== false && !exists(scene.audio?.file)) violations.push({ id: 'DET-FULL-005', sceneId: scene.id, issue: 'missing narration asset' });
    if (!Array.isArray(scene.sourceRefs) && scene.id !== 'brand-signature' && scene.id !== 'brand-outro') violations.push({ id: 'DET-FULL-006', sceneId: scene.id, issue: 'missing source refs' });
    const badge = (scene.overlays || []).find((overlay) => overlay.type === 'badge');
    if (badge) violations.push({ id: 'DET-FULL-009', sceneId: scene.id, issue: 'redundant floating badge remains after section-card insertion' });
    if (scene.outroCompletionGuard && scene.outroCompletionGuard.valid !== true) violations.push({ id: 'DET-FULL-010', sceneId: scene.id, issue: 'outro narration tail guard failed' });
    if (scene.visualBinding?.sourceLabel && scene.visualBinding.displayLabelFrCa && scene.visualBinding.displayLabelFrCa === scene.visualBinding.sourceLabel && /Age I Cards|Coins/.test(scene.visualBinding.sourceLabel)) violations.push({ id: 'DET-FULL-011', sceneId: scene.id, issue: 'English component label not localized' });
    if (!scene.sectionCard && scene.background?.provenance?.visualUtility && ['DECORATIVE_RULEBOOK_ART', 'IRRELEVANT'].includes(scene.background.provenance.visualUtility)) violations.push({ id: 'DET-FULL-012', sceneId: scene.id, issue: 'decorative or irrelevant visual used for instruction' });
    if (!scene.sectionCard && scene.visualBinding && scene.background?.provenance?.cropPurity === 'contaminated') violations.push({ id: 'DET-FULL-013', sceneId: scene.id, issue: 'instructional crop contains unrelated component' });
    if (scene.sectionCard && (scene.durationSec < 1.8 || scene.durationSec > 2.2)) violations.push({ id: 'DET-FULL-014', sceneId: scene.id, issue: 'major section card is not approximately two seconds' });
  }
  for (let i = 1; i < config.scenes.length; i += 1) {
    const a = String(config.scenes[i - 1].narrationText || '').trim().toLowerCase();
    const b = String(config.scenes[i].narrationText || '').trim().toLowerCase();
    if (a && b && a === b) violations.push({ id: 'DET-FULL-007', from: config.scenes[i - 1].id, to: config.scenes[i].id, issue: 'duplicate adjacent narration' });
  }
  const chapters = config.chapters || [];
  const sectionCards = config.scenes.filter((scene) => scene.sectionCard);
  if (chapters.length !== sectionCards.length) violations.push({ id: 'DET-FULL-008', issue: 'chapter count does not match section-card count' });
  let elapsed = 0;
  const chapterById = new Map(chapters.map((chapter) => [chapter.sceneId, chapter]));
  for (const scene of config.scenes) {
    if (scene.sectionCard) {
      const chapter = chapterById.get(scene.id);
      if (!chapter || Math.abs(Number(chapter.startSec) - elapsed) > 0.01) violations.push({ id: 'DET-FULL-015', sceneId: scene.id, issue: 'chapter start is not aligned to section-card start' });
    }
    elapsed += Number(scene.durationSec || 0);
  }
  for (const step of config.setupModel || []) {
    if (!step || !Array.isArray(step.sourceRefs) || !step.sourceRefs.length) violations.push({ id: 'DET-FULL-016', issue: 'setup step missing source reference' });
    if (!step.reviewState) violations.push({ id: 'DET-FULL-017', issue: 'setup step missing review state' });
  }
  if ((config.setupModel || []).some((step) => /Âge (I|II|III)/.test(String(step?.narrationText || step?.text || '')))) violations.push({ id: 'DET-FULL-018', issue: 'Roman numeral leaked into setup spoken text' });
  return { contract: 'mobius-full-tutorial-qa-v1', namespace: 'DET', status: violations.length ? 'FAIL' : 'PASS', violationCount: violations.length, violations, sceneCount: config.scenes.length, chapterCount: chapters.length, resolution: `${config.video.resolution.width}x${config.video.resolution.height}`, outputDir };
}
async function assemble(game) {
  const input = games[game];
  const outputDir = path.join(outputRoot, game);
  fs.mkdirSync(outputDir, { recursive: true });
  writeJson(path.join(outputRoot, `${game}-assembly-audit.json`), buildAudit(game));
  const opening = readJson(input.opening); const componentEvidence = readJson(input.components); const visualEvidence = exists(input.visualEvidence) ? readJson(input.visualEvidence) : null; const gameplay = readJson(input.gameplay); const scoring = readJson(input.scoring); const nativeManifest = loadNativeManifest(input.nativeVisualManifest);
  const used = new Set();
  const openingScenes = opening.scenes || [];
  const scenes = [makeBrandScene(openingScenes)];
  scenes.push(makeSectionCard('Présentation / But du jeu', 'presentation', used));
  const openingTeaching = cloneTeaching(openingScenes.filter((scene) => ['metadata-card', 'scene-section-01-1', 'scene-section-02-2'].includes(scene.id)), used, 'opening', { 'scene-section-01-1': 'Présentation', 'scene-section-02-2': game === '7-wonders-duel' ? 'Objectifs' : 'Le but du jeu' }).map((scene) => attachNativeVisual(scene, nativeManifest));
  scenes.push(...openingTeaching.map((scene) => scene.id.includes('metadata-card') ? materializeMetadataDelivery(scene, outputDir) : scene));
  const previousNarrationManifest = path.join(outputDir, 'narration-assets.json');
  const cachedNarration = exists(previousNarrationManifest) ? readJson(previousNarrationManifest) : null;
  const audioManifest = { contract: 'mobius-full-tutorial-narration-v1', path: path.join(outputDir, 'audio'), voiceId, modelId: preset.modelId, profile: 'AMELIE_TEACHING', assets: dedupeNarrationAssets(Array.isArray(cachedNarration?.assets) ? cachedNarration.assets : []), pending: [] };
  scenes.push(makeSectionCard('Les composants', 'components', used));
  const generatedSetup = buildGeneratedSetupScenes({ label: input.label }, openingScenes, componentEvidence, visualEvidence, used, audioManifest, nativeManifest);
  const componentScenes = generatedSetup.scenes.filter((scene) => scene.id.includes('-components'));
  const setupScenes = generatedSetup.scenes.filter((scene) => !componentScenes.includes(scene));
  scenes.push(...componentScenes);
  scenes.push(makeSectionCard('Mise en place', 'setup', used));
  scenes.push(...setupScenes);
  const gameplayScenes = cloneTeaching(gameplay.scenes || [], used, 'gameplay', { 'game-loop': 'Comment se déroule le jeu?', 'next-player-or-phase': 'Le tour suivant' }).map(reconcile7wdTeachingScene).map((scene) => attachNativeVisual(scene, nativeManifest));
  const loopScenes = gameplayScenes.filter((scene) => scene.id.includes('gameplay-game-loop'));
  const actionScenes = gameplayScenes.filter((scene) => !loopScenes.includes(scene));
  scenes.push(makeSectionCard('Comment se déroule le jeu?', 'game-loop', used));
  scenes.push(...loopScenes);
  scenes.push(makeSectionCard('Les actions', 'actions', used));
  scenes.push(...actionScenes);
  const scoringScenes = cloneTeaching(scoring.scenes || [], used, 'scoring', { 'endgame-trigger': 'Fin de partie', 'immediate-victory': 'Victoires immédiates', 'final-phase': 'Avant le décompte', 'scoring-overview': 'Calcul des points', 'winner-resolution': 'Qui gagne?' }).map(reconcile7wdTeachingScene).map((scene) => attachNativeVisual(scene, nativeManifest));
  const endgameScenes = scoringScenes.filter((scene) => scene.id.includes('scoring-endgame-trigger') || scene.id.includes('scoring-immediate-victory'));
  const scoringRemainder = scoringScenes.filter((scene) => !endgameScenes.includes(scene));
  scenes.push(makeSectionCard('Fin de partie', 'endgame', used));
  scenes.push(...endgameScenes);
  scenes.push(makeSectionCard('Décompte / Victoire', 'scoring', used));
  scenes.push(...scoringRemainder);
  scenes.push(makeSectionCard('Conclusion', 'conclusion', used));
  scenes.push(makeOutroScene(openingScenes, audioManifest));
  const tts = await generateMissingNarration(audioManifest);
  delete audioManifest.pending;
  audioManifest.generated = tts.generated; audioManifest.reused = tts.reused; audioManifest.generatedAt = new Date().toISOString();
  writeJson(path.join(outputDir, 'narration-assets.json'), audioManifest);
  const config = {
    projectId: `mobius-full-${game}`,
    gameName: input.label,
    language: 'fr-CA',
    video: { resolution: { width: 1920, height: 1080 }, fps: 30 },
    sourceGrounded: true,
    generatorNative: true,
    assemblyContract: 'mobius-full-tutorial-assembly-v1',
    source: { pdfSha256: input.sourcePdfSha256, sourceArtifact: input.sourceArtifact },
    setupModel: generatedSetup.setupSteps,
    scenes,
  };
  config.chapters = makeChapters(scenes);
  config.__renderPath = path.join(outputDir, `${game}-full-tutorial-fr-CA.mp4`);
  const qa = qaConfig(config, outputDir);
  writeJson(path.join(outputDir, 'full-tutorial-qa.json'), qa);
  if (qa.status !== 'PASS') throw new Error(`${game}: deterministic assembly QA failed with ${qa.violationCount} violations.`);
  const configPath = path.join(outputDir, 'full-tutorial-config.json'); delete config.__renderPath; writeJson(configPath, config);
  writeJson(path.join(outputDir, 'chapters.json'), { version: 1, language: 'fr-CA', chapters: config.chapters });
  fs.writeFileSync(path.join(outputDir, 'chapters.txt'), config.chapters.map((chapter) => `${chapter.startSec.toFixed(3)}\t${chapter.title}`).join('\n') + '\n');
  return { game, outputDir, configPath, qa, tts, scenes: config.scenes, chapters: config.chapters };
}

async function main() {
  const parsed = args();
  const selected = parsed.values.game || Object.keys(games);
  const list = Array.isArray(selected) ? selected : String(selected).split(',').map((value) => value.trim()).filter(Boolean);
  fs.mkdirSync(outputRoot, { recursive: true });
  for (const game of list) {
    if (!games[game]) throw new Error(`Unsupported benchmark game: ${game}`);
    const audit = buildAudit(game);
    writeJson(path.join(outputRoot, `${game}-assembly-audit.json`), audit);
  }
  if (parsed.flags.has('audit-only')) {
    console.log(JSON.stringify({ status: 'AUDIT_COMPLETE', outputRoot, games: list }, null, 2));
    return;
  }
  const results = [];
  for (const game of list) results.push(await assemble(game));
  console.log(JSON.stringify({ status: 'ASSEMBLY_COMPLETE', outputRoot, results: results.map((result) => ({ game: result.game, configPath: result.configPath, scenes: result.scenes.length, chapters: result.chapters.length, qa: result.qa.status, tts: result.tts })) }, null, 2));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main().catch((error) => { console.error(`[assemble-full-tutorial-r1] ${error.message}`); process.exitCode = 1; });

export { buildAudit, qaConfig, assemble, createReviewSheet, games };
