#!/usr/bin/env node

import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
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

export function buildTutorialReviewContext({config,videoPath,media=mediaInfo(videoPath)}) {
let cursor = 0;
const scenes = config.scenes.map(scene => {
  const start=cursor; cursor+=Number(scene.durationSec||0);
  return {scene_id:scene.id,start_sec:Number(start.toFixed(3)),end_sec:Number(cursor.toFixed(3)),purpose:purposeFor(scene),
    exact_narration_text:String(scene.narrationText||'').trim()||'NONE',expected_visual_role:visualRoleFor(scene),source_pages:scene.sourcePages||scene.source_pages||[]};
});
if(Math.abs(cursor-media.durationSec)>0.08)throw new Error('Rendered timeline does not match actual media duration');
return {video:{path:videoPath,sha256:sha256(videoPath),duration_sec:media.durationSec,resolution:media.resolution},
  identity:{display_title:config.gameName,spoken_title:config.identity?.spokenName||config.gameName,edition:config.source?.edition||null},scenes,
  intentional_intro_silence:config.scenes[0]?.type==='brand_intro'?{start_sec:0,end_sec:config.scenes[0].durationSec,reason:'Signature sans narration intentionnelle; vérifier le son et la marque effectivement présents.'}:null,
  director_context:{authority:'Twelve Labs is advisory; no human publication verdict has been supplied.',approved_strengths:[],suspected_defects:[]}};
}

function main(){
const args = parseArgs();
const configPath = requirePath(args, 'config');
const videoPath = requirePath(args, 'video');
const outPath = requirePath(args, 'out');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const media = mediaInfo(videoPath);

const context = buildTutorialReviewContext({config,videoPath,media});

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(context, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify({ status: 'PASS', outPath, videoSha256: context.video.sha256, durationSec: media.durationSec, sceneCount: context.scenes.length }, null, 2)}\n`);
}
if(pathToFileURL(path.resolve(process.argv[1]||'')).href===import.meta.url)main();
