#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import ffprobeStatic from 'ffprobe-static';
import { solvePresentationLayout } from '../src/services/presentationDesignSystem.cjs';

const require = createRequire(import.meta.url);
const Ajv2020 = require('ajv/dist/2020').default;
const root = process.cwd();
const outRoot = path.join(root, 'out', 'scoring-endgame-r1');
const schemaPath = path.join(root, 'config', 'scoring-endgame.schema.json');
const ffprobe = process.env.MOBIUS_FFPROBE_PATH || ffprobeStatic.path || 'ffprobe';
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const violations = [];
const add = (game, code, message, sceneId = null) => violations.push({ id: `DET-${String(violations.length + 1).padStart(3, '0')}`, game, code, sceneId, message });
const wrappedLines = (text, maxChars) => String(text || '').split(/\r?\n/).flatMap((line) => { const words = line.trim().split(/\s+/).filter(Boolean); if (!words.length) return ['']; const lines = []; let current = ''; for (const word of words) { if (current && `${current} ${word}`.length > maxChars) { lines.push(current); current = word; } else current = current ? `${current} ${word}` : word; } if (current) lines.push(current); return lines; });
const probe = (file) => { const json = JSON.parse(execFileSync(ffprobe, ['-v', 'error', '-show_entries', 'format=duration:stream=index,codec_name,codec_type,width,height,sample_rate,channels', '-of', 'json', file], { encoding: 'utf8' })); const video = json.streams?.find((stream) => stream.codec_type === 'video'); return { durationSec: Number(json.format?.duration || 0), resolution: `${video?.width}x${video?.height}`, videoCodec: video?.codec_name || null, streams: json.streams || [] }; };

const ajv = new Ajv2020({ allErrors: true, strict: false });
const validateModel = ajv.compile(read(schemaPath));
const games = {};
for (const game of ['terraforming-mars', '7-wonders-duel']) {
  const dir = path.join(outRoot, game);
  const model = read(path.join(dir, 'scoring-endgame.json'));
  const config = read(path.join(dir, 'preview-config.json'));
  const video = path.join(dir, 'scoring-endgame-preview.mp4');
  if (!validateModel(model)) add(game, 'schema-invalid', JSON.stringify(validateModel.errors));
  if (!fs.existsSync(video)) add(game, 'missing-preview', video);
  const media = fs.existsSync(video) ? probe(video) : { durationSec: 0, resolution: null, streams: [] };
  if (media.resolution !== '1920x1080') add(game, 'wrong-resolution', media.resolution);
  if (model.endGameModel.sourceRefs.length === 0) add(game, 'missing-endgame-source');
  const victoryIds = new Set(model.endGameModel.immediateVictoryConditions.map((condition) => condition.id));
  const scoringIds = new Set(model.scoringCategories.map((category) => category.id));
  for (const condition of model.endGameModel.immediateVictoryConditions) {
    if (!condition.sourceRefs.length) add(game, 'victory-without-source', condition.id);
    if (scoringIds.has(condition.id)) add(game, 'victory-scoring-id-collision', condition.id);
  }
  for (const category of model.scoringCategories) {
    if (!category.sourceRefs.length) add(game, 'category-without-source', category.id);
    const binding = model.visualBindings.find((candidate) => candidate.scoringCategoryId === category.id);
    if (!binding || binding.reviewState !== 'accepted') add(game, 'category-without-accepted-visual', category.id);
    for (const ref of category.sourceRefs) if (!ref.page && !(ref.section && ref.startOffset !== null && ref.endOffset !== null)) add(game, 'invalid-category-source', category.id);
  }
  for (const binding of [...(model.visualBindings || []), ...(model.victoryVisualBindings || [])]) {
    if (binding.reviewState !== 'accepted') add(game, 'accepted-binding-state-mismatch', binding.scoringCategoryId);
    const file = binding.provenance?.renderPath || binding.provenance?.sourceImage;
    if (!file || !fs.existsSync(file)) add(game, 'binding-file-missing', binding.scoringCategoryId);
    if (!binding.sourceRefs?.length || !binding.provenance) add(game, 'binding-provenance-incomplete', binding.scoringCategoryId);
  }
  const planIds = new Set((config.endgameTeachingPlan?.scenes || []).map((scene) => scene.id));
  for (const scene of config.scenes || []) {
    if (scene.id === 'brand-signature' || scene.id === 'end-card') continue;
    if (!planIds.has(scene.id)) add(game, 'scene-not-in-semantic-plan', scene.id);
    if (scene.overlays?.some((overlay) => /pp\./i.test(overlay.text || ''))) add(game, 'noncanonical-reference-format', scene.id);
    if (scene.layout?.mode !== 'split-teaching') continue;
    const heading = scene.overlays?.find((overlay) => overlay.type === 'heading')?.text || '';
    const body = scene.overlays?.find((overlay) => overlay.type === 'body')?.text || '';
    const reference = scene.overlays?.find((overlay) => overlay.type === 'reference')?.text || '';
    const solved = solvePresentationLayout({ width: 1920, height: 1080, sceneType: scene.layout.presentationLayout?.contentType === 'list' ? 'list' : 'teaching', heading, body, reference, itemCount: Math.max(1, body.split(/\r?\n/).filter(Boolean).length), preferredImageProminence: Number(scene.layout.visualWidthRatio) || 0.56, preferredFontPx: scene.layout.presentationLayout?.preferredFontPx || null, minimumFontPx: scene.layout.presentationLayout?.minimumFontPx || 48, textSide: scene.layout.textSide || 'left', imageSide: scene.layout.imageSide || 'right' });
    if (solved.failedHardConstraints) add(game, 'layout-hard-constraint-failed', 'No valid candidate', scene.id);
    const bodyChars = Math.max(15, Math.floor(solved.textWidth / (solved.bodyFontPx * 0.52)));
    const bodyLineCount = wrappedLines(body, bodyChars).length;
    const lineHeight = solved.bodyLineHeightPx;
    const bodyTop = solved.bodyY;
    const bodyBottom = bodyTop + (bodyLineCount * lineHeight);
    const referenceTop = reference ? bodyBottom + 18 : bodyBottom;
    const ownedBottom = reference ? referenceTop + solved.referenceFontPx * 1.2 : bodyBottom;
    if (solved.panelX < solved.safeMargins.x || solved.panelX + solved.panelWidth > 1920 - solved.safeMargins.x || solved.panelY < solved.safeMargins.y || solved.panelY + solved.panelHeight > 1080 - solved.safeMargins.y) add(game, 'panel-outside-safe-frame', 'panel bounds', scene.id);
    if (bodyTop < solved.panelY || ownedBottom > solved.panelY + solved.panelHeight) add(game, 'owned-content-outside-panel', `body/reference bottom ${ownedBottom} > ${solved.panelY + solved.panelHeight}`, scene.id);
    if (solved.bodyFontPx < (scene.layout.presentationLayout?.minimumFontPx || 48)) add(game, 'font-below-minimum', `${solved.bodyFontPx}px`, scene.id);
    if (scene.narrationText && !scene.audio?.file) add(game, 'narration-file-missing', scene.id);
  }
  const narrated = (config.scenes || []).filter((scene) => scene.narrationText).map((scene) => scene.narrationText.replace(/\s+/g, ' ').trim());
  for (let i = 1; i < narrated.length; i += 1) if (narrated[i] && narrated[i] === narrated[i - 1]) add(game, 'duplicate-adjacent-narration', narrated[i]);
  games[game] = { modelPath: path.join(dir, 'scoring-endgame.json'), previewPath: video, previewSha256: fs.existsSync(video) ? sha256(video) : null, media, contractValid: validateModel(model), sceneCount: config.scenes.length, semanticSceneCount: config.endgameTeachingPlan.scenes.length, immediateVictoryCount: model.endGameModel.immediateVictoryConditions.length, scoringCategoryCount: model.scoringCategories.length, acceptedScoringBindings: model.visualBindings.filter((binding) => binding.reviewState === 'accepted').length, acceptedVictoryBindings: model.victoryVisualBindings.filter((binding) => binding.reviewState === 'accepted').length };
}

const report = { contract: 'mobius-scoring-endgame-qa-v1', generatedBy: 'scripts/qa-scoring-endgame-r1.mjs', namespace: 'DET', status: violations.length ? 'FAIL' : 'PASS', violationCount: violations.length, violations, games };
const output = path.join(outRoot, 'qa-report.json');
fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ output, status: report.status, violations: violations.length, games: Object.fromEntries(Object.entries(games).map(([game, value]) => [game, { resolution: value.media.resolution, durationSec: value.media.durationSec, contractValid: value.contractValid }])) }, null, 2));
if (violations.length) process.exitCode = 1;
