#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import ffprobeStatic from 'ffprobe-static';

const root = process.cwd();
const outRoot = path.join(root, 'out', 'hephaestus-recovery-r1');
const ffprobe = process.env.MOBIUS_FFPROBE_PATH || ffprobeStatic.path || 'ffprobe';
function sha(p) { return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'); }
function media(p) { return JSON.parse(execFileSync(ffprobe, ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,width,height', '-of', 'json', p], { encoding: 'utf8' })); }
for (const [game, title] of [['terraforming-mars', 'Terraforming Mars'], ['7-wonders-duel', '7 Wonders Duel']]) {
  const dir = path.join(outRoot, game); const video = path.join(dir, 'components-setup-preview.mp4'); const probe = media(video); const stream = probe.streams.find((s) => s.codec_type === 'video');
  const duration = Number(probe.format?.duration || 19.2); const scenes = [
    { scene_id: 'brand-signature', start_sec: 0, end_sec: 3.6, exact_narration_text: 'NONE', purpose: 'HEPHAESTUS bounded preview brand signature; intentional no-Amélie interval.', expected_visual_role: 'Canonical Les Jeux Mobius brand signature; no teaching text.' },
    { scene_id: 'components-focused-visuals', start_sec: 3.6, end_sec: 9.6, exact_narration_text: 'NONE', purpose: 'Show accepted source-grounded component visuals and their page references.', expected_visual_role: 'Focused component visual selected from the HEPHAESTUS evidence contract.' },
    { scene_id: 'setup-binding', start_sec: 9.6, end_sec: 15.6, exact_narration_text: 'NONE', purpose: 'Show a setup instruction bound to a source-grounded component visual.', expected_visual_role: 'Focused component visual bound to a setup step; source page remains visible as reference.' },
    { scene_id: 'end-card', start_sec: 15.6, end_sec: duration, exact_narration_text: 'NONE', purpose: 'Close the bounded visual proof.', expected_visual_role: 'Canonical brand anchor.' },
  ];
  const context = {
    schema_version: 'mobius-twelvelabs-expected-context-v1',
    video: { path: video, sha256: sha(video), duration_sec: duration, resolution: `${stream.width}x${stream.height}` },
    identity: { display_title: title, spoken_title: title, locale: 'fr-CA', pronunciation_guidance: 'Prononcer naturellement dans une phrase en français québécois; ne pas théâtraliser un accent anglais.' },
    scenes,
    intentional_intro_silence: { start_sec: 0, end_sec: 3.6, reason: 'Brand signature is intentionally speech-free.' },
    expected_visual_role: 'Evaluate the actual source-grounded focused visual, setup binding, page reference and mobile readability.',
    director_approved_strengths: ['source-grounded evidence', 'focused visuals preferred over whole-page fallback', 'operator review remains authoritative'],
    director_rules: ['Do not infer rule truth from the provider; evaluate observable audiovisual correspondence.', 'Pixel containment remains local deterministic QA.'],
    deterministic_namespace: 'DET',
  };
  fs.writeFileSync(path.join(dir, 'expected-context-twelvelabs.json'), `${JSON.stringify(context, null, 2)}\n`, 'utf8');
}
