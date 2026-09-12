#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import ffprobeStatic from 'ffprobe-static';
import { createReviewSheet, qaConfig, games } from './assemble-full-tutorial-r1.mjs';

const root = path.resolve(process.cwd());
const outRoot = process.env.MOBIUS_FULL_TUTORIAL_OUTPUT_ROOT ? path.resolve(process.env.MOBIUS_FULL_TUTORIAL_OUTPUT_ROOT) : path.join(root, 'out', 'full-tutorial-r1');
const ffprobe = process.env.MOBIUS_FFPROBE_PATH && fs.existsSync(process.env.MOBIUS_FFPROBE_PATH) ? process.env.MOBIUS_FFPROBE_PATH : ffprobeStatic.path;
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const writeJson = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); };
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const parseMedia = (file) => JSON.parse(execFileSync(ffprobe, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file], { encoding: 'utf8' }));
const absolute = (file) => path.isAbsolute(file) ? file : path.resolve(root, file);

function buildExpectedContext(game, config, media, qa, review) {
  let cursor = 0;
  const scenes = config.scenes.map((scene) => {
    const result = { scene_id: scene.id, start_sec: Number(cursor.toFixed(3)), end_sec: Number((cursor + Number(scene.durationSec)).toFixed(3)), purpose: scene.chapterTitle || scene.section || scene.id, exact_narration_text: scene.narrationText || 'NONE', expected_visual_role: scene.background?.kind || scene.background?.image || null, source_refs: scene.sourceRefs || [], intentionalNoSpeech: scene.id === 'brand-signature' };
    cursor += Number(scene.durationSec || 0); return result;
  });
  return {
    schema_version: 'mobius-full-tutorial-expected-context-v1',
    video: { path: config.__renderPath, sha256: sha256(config.__renderPath), duration_sec: Number(media.format.duration), resolution: `${media.streams.find((stream) => stream.codec_type === 'video')?.width}x${media.streams.find((stream) => stream.codec_type === 'video')?.height}` },
    identity: { display_title: game.label, spoken_title: game.label === '7 Wonders Duel' ? 'Seven Wonders Duel' : 'Terraforming Mars', locale: 'fr-CA', pronunciation_guidance: 'Les noms anglais et les termes de jeu restent reconnaissables, avec une diction naturelle en français québécois; aucune accentuation théâtrale.', edition: null },
    scenes,
    intentional_intro_silence: { start_sec: 0, end_sec: 3.6, reason: 'La signature de marque est volontairement sans narration Amélie.' },
    director_context: { brand_rules: ['Bannière officielle seule pendant la signature.', 'Signature sonore café-ludique audible et discrète.', 'Twelve Labs est consultatif; PUBLISHABLE appartient au Director.'], approved_strengths: ['Panneaux chauds et lisibles.', 'Visuels source-grounded et couverture exacte.', 'Timeline sémantique unique.'], suspected_defects: [] },
    deterministic_findings: [{ id: 'DET-001', category: 'media_integrity', observation: `Vidéo ${scenes.length} scènes, ${media.format.duration} secondes, ${media.streams.find((stream) => stream.codec_type === 'video')?.width}x${media.streams.find((stream) => stream.codec_type === 'video')?.height}.` }, { id: 'DET-002', category: 'scene_timeline', observation: 'La timeline sémantique et les chapitres proviennent de la même configuration.' }],
    chapters: config.chapters,
    physicalReview: review,
  };
}

async function main() {
  const results = [];
  const selectedGames = process.env.MOBIUS_FULL_TUTORIAL_GAMES ? process.env.MOBIUS_FULL_TUTORIAL_GAMES.split(',').map((value) => value.trim()).filter(Boolean) : Object.keys(games);
  for (const id of selectedGames) {
    const game = games[id];
    const dir = path.join(outRoot, id);
    const configPath = path.join(dir, 'full-tutorial-config.json');
    const videoPath = path.join(dir, `${id}-full-tutorial.mp4`);
    const config = readJson(configPath);
    config.__renderPath = videoPath;
    if (!fs.existsSync(videoPath)) throw new Error(`Missing full tutorial render: ${videoPath}`);
    const media = parseMedia(videoPath);
    const qa = qaConfig(config, dir);
    const video = media.streams.find((stream) => stream.codec_type === 'video');
    const audio = media.streams.find((stream) => stream.codec_type === 'audio');
    if (!video || video.width !== 1920 || video.height !== 1080) qa.violations.push({ id: 'DET-FULL-009', issue: 'render resolution is not 1920x1080' });
    if (!audio || audio.codec_name !== 'aac') qa.violations.push({ id: 'DET-FULL-010', issue: 'render audio stream missing or invalid' });
    qa.media = { durationSec: Number(media.format.duration), sizeBytes: Number(media.format.size), videoCodec: video?.codec_name || null, audioCodec: audio?.codec_name || null, sampleRate: audio?.sample_rate || null, channels: audio?.channels || null, videoSha256: sha256(videoPath) };
    qa.status = qa.violations.length ? 'FAIL' : 'PASS'; qa.violationCount = qa.violations.length;
    if (qa.status !== 'PASS') throw new Error(`${id}: full tutorial QA failed with ${qa.violationCount} violations.`);
    const review = await createReviewSheet(id, config, dir);
    qa.physicalReview = review;
    const context = buildExpectedContext(game, config, media, qa, review);
    writeJson(path.join(dir, 'full-tutorial-qa.json'), qa);
    writeJson(path.join(dir, 'expected-context.json'), context);
    results.push({ id, videoPath, durationSec: qa.media.durationSec, resolution: `${video.width}x${video.height}`, sha256: qa.media.videoSha256, scenes: config.scenes.length, chapters: config.chapters.length, deterministicViolations: qa.violationCount, reviewBoard: review.board, contextPath: path.join(dir, 'expected-context.json') });
  }
  writeJson(path.join(outRoot, 'full-tutorial-validation-summary.json'), { schema_version: 'mobius-full-tutorial-validation-r1', generatedAt: new Date().toISOString(), status: 'PASS', generatorNative: true, deterministicViolations: 0, games: results });
  console.log(JSON.stringify({ status: 'PASS', results }, null, 2));
}

main().catch((error) => { console.error(`[qa-full-tutorial-r1] ${error.stack || error.message}`); process.exitCode = 1; });
