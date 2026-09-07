#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import ffprobeStatic from 'ffprobe-static';

const root = path.resolve(process.cwd());
const game = process.argv[2] || '7-wonders-duel';
const configPath = path.resolve(process.argv[3]);
const videoPath = path.resolve(process.argv[4]);
const outputPath = path.resolve(process.argv[5]);
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const probe = JSON.parse(execFileSync(ffprobeStatic.path, ['-v', 'error', '-show_entries', 'format=duration:stream=width,height', '-of', 'json', videoPath], { encoding: 'utf8' }));
const videoSha256 = crypto.createHash('sha256').update(fs.readFileSync(videoPath)).digest('hex');
let start = 0;
const scenes = (config.scenes || []).map((scene) => {
  const end = Number((start + Number(scene.durationSec || 0)).toFixed(3));
  const row = { scene_id: scene.id, start_sec: Number(start.toFixed(3)), end_sec: end, purpose: scene.chapterTitle || scene.section || scene.id, exact_narration_text: scene.narrationText || 'NONE', expected_visual_role: scene.background?.kind || (scene.id === 'brand-signature' || scene.id === 'brand-outro' ? 'brand-banner' : 'presentation-teaching-visual') };
  start = end;
  return row;
});
const context = { video: { path: videoPath, sha256: videoSha256, duration_sec: Number(probe.format?.duration || start), resolution: `${probe.streams?.find((s) => s.width)?.width}x${probe.streams?.find((s) => s.height)?.height}` }, identity: { display_title: game === '7-wonders-duel' ? '7 Wonders Duel' : 'Terraforming Mars', spoken_title: game === '7-wonders-duel' ? 'Seven Wonders Duel' : 'Terraforming Mars', pronunciation_guidance: 'Les noms anglais restent reconnaissables et sont prononcés naturellement dans une phrase en français québécois, sans accent anglais théâtral.', edition: null }, scenes, intentional_intro_silence: { start_sec: 0, end_sec: 3.6, reason: 'La signature de marque est volontairement sans narration Amélie.' }, director_context: { brand_rules: ['La signature sonore et visuelle approuvée doit être préservée.', 'Les visuels d’enseignement doivent être nets, pertinents et lisibles sur mobile.', 'Les labels user-facing doivent être naturels en fr-CA.'], approved_strengths: ['Timeline sémantique unique.', 'Système de présentation chaleureux.', 'Identité visuelle exacte.'], suspected_defects: [] }, deterministic_findings: [{ id: 'DET-001', category: 'media_integrity', observation: 'Le contexte décrit le rendu courant; les mesures géométriques et audio déterministes sont conservées séparément du jugement fournisseur.' }] };
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(context, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, videoSha256, sceneCount: scenes.length }, null, 2));
