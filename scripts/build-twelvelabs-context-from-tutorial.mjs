#!/usr/bin/env node

import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import ffprobeStatic from 'ffprobe-static';

function parseArgs(argv = process.argv.slice(2)) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (!argv[index].startsWith('--')) continue;
    const key = argv[index].slice(2);
    result[key] = argv[index + 1] && !argv[index + 1].startsWith('--') ? argv[++index] : true;
  }
  return result;
}

function requirePath(args, name) {
  if (!args[name] || args[name] === true) throw new Error(`Missing --${name}.`);
  const resolved = path.resolve(String(args[name]));
  if (!fs.existsSync(resolved) && name !== 'out') throw new Error(`Missing ${name}: ${resolved}`);
  return resolved;
}

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function mediaInfo(videoPath) {
  const ffprobe = process.env.MOBIUS_FFPROBE_PATH || ffprobeStatic.path || 'ffprobe';
  const output = execFileSync(ffprobe, [
    '-v', 'error', '-show_entries', 'format=duration:stream=codec_type,width,height', '-of', 'json', videoPath,
  ], { encoding: 'utf8' });
  const parsed = JSON.parse(output);
  const video = parsed.streams.find((stream) => stream.codec_type === 'video');
  return {
    durationSec: Number(parsed.format.duration),
    resolution: `${video.width}x${video.height}`,
  };
}

function purposeFor(scene) {
  return scene.majorSection || scene.chapterTitle || scene.section || scene.displayText || scene.id;
}

function visualRoleFor(scene) {
  if (scene.type === 'brand_intro' || scene.layout?.brandBanner) return 'canonical-brand-banner';
  if (scene.sectionCard) return 'major-semantic-section-card';
  return scene.background?.kind || scene.visualBinding?.visualUtility || scene.layout?.mode || 'source-grounded-instructional';
}

const args = parseArgs();
const configPath = requirePath(args, 'config');
const videoPath = requirePath(args, 'video');
const outPath = requirePath(args, 'out');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const media = mediaInfo(videoPath);

let cursor = 0;
const scenes = config.scenes.map((scene) => {
  const start = Number(cursor.toFixed(3));
  cursor += Number(scene.durationSec || 0);
  const end = Number(cursor.toFixed(3));
  return {
    scene_id: scene.id,
    start_sec: start,
    end_sec: end,
    purpose: purposeFor(scene),
    exact_narration_text: String(scene.narrationText || '').trim() || 'NONE',
    expected_visual_role: visualRoleFor(scene),
  };
});

if (Math.abs(cursor - media.durationSec) > 0.08) {
  throw new Error(`Timeline duration ${cursor.toFixed(3)} does not match media duration ${media.durationSec.toFixed(3)}.`);
}

const context = {
  video: {
    path: videoPath,
    sha256: sha256(videoPath),
    duration_sec: media.durationSec,
    resolution: media.resolution,
  },
  identity: {
    display_title: config.gameName,
    spoken_title: config.gameName === '7 Wonders Duel' ? 'Seven Wonders Duel' : config.gameName,
    pronunciation_guidance: 'Les noms anglais restent reconnaissables et fluides dans une phrase en français québécois, sans accent anglophone théâtral. Les numéros d’Âge affichés en chiffres romains sont prononcés un, deux et trois.',
    edition: config.source?.edition || null,
  },
  scenes,
  intentional_intro_silence: {
    start_sec: 0,
    end_sec: Number(config.scenes[0]?.durationSec || 3.6),
    reason: 'La signature de marque est volontairement sans narration Amélie.',
  },
  director_context: {
    brand_rules: [
      'La signature sonore café-ludique actuelle est approuvée et doit être évaluée comme identité de marque intentionnelle.',
      'Les cartes de section majeures durent environ deux secondes et ne contiennent pas de narration.',
      'Twelve Labs est consultatif et ne détient aucune autorité PUBLISHABLE.',
    ],
    approved_strengths: [
      'Identité sonore canonique approuvée.',
      'Transitions de sections majeures approuvées.',
      'Direction visuelle chaude Les Jeux Mobius approuvée.',
    ],
    suspected_defects: [],
  },
  deterministic_findings: [
    {
      id: 'DET-001',
      category: 'media_integrity',
      observation: `Vidéo ${media.resolution}, ${media.durationSec.toFixed(3)} secondes; intégrité technique mesurée localement.`,
    },
    {
      id: 'DET-002',
      category: 'timeline',
      observation: `${scenes.length} scènes avec limites temporelles dérivées de la configuration rendue.`,
    },
  ],
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(context, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify({ status: 'PASS', outPath, videoSha256: context.video.sha256, durationSec: media.durationSec, sceneCount: scenes.length }, null, 2)}\n`);
