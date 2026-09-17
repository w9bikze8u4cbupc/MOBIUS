#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import ffmpegStatic from 'ffmpeg-static';

const ROOT = path.resolve(process.cwd());
const manifestPath = path.resolve(process.argv[2] || 'out/publishability-r5/7-wonders-duel/visual-storyboard/manifest.json');
const outputRoot = path.resolve(process.argv[3] || 'out/publishability-r5/7-wonders-duel/twelvelabs-visual-montage');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const writeJson = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); };

if (manifest.qa?.status !== 'PASS') throw new Error('Visual storyboard must pass before the advisory montage is built.');
const durationPerScene = 1.5;
const scenes = manifest.frames.map((frame) => ({
  id: `visual-review-${frame.ruleAtomId}`,
  atomId: frame.ruleAtomId,
  durationSec: durationPerScene,
  background: { image: frame.filePath, kind: 'source-grounded-visual-storyboard-frame' },
  layout: { mode: 'visual-first-full-frame' },
  narrationText: '',
  expectedPurpose: 'Targeted visual-only review; no narration is intended in this calibration montage.',
}));
const config = {
  contract: 'mobius-visual-first-advisory-montage-v1',
  projectId: manifest.projectId,
  gameName: '7 Wonders Duel — visual-first storyboard calibration',
  language: 'fr-CA',
  video: { resolution: { width: 1920, height: 1080 }, fps: 30 },
  scenes,
};
fs.mkdirSync(outputRoot, { recursive: true });
const configPath = path.join(outputRoot, 'montage-config.json');
const videoPath = path.join(outputRoot, 'visual-storyboard-montage.mp4');
writeJson(configPath, config);
execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'render-storyboard-ffmpeg.mjs'), '--config', configPath, '--out', videoPath], { cwd: ROOT, stdio: 'inherit' });
const context = {
  video: { path: videoPath, sha256: sha256(videoPath), duration_sec: Number((scenes.length * durationPerScene).toFixed(3)), resolution: '1920x1080' },
  identity: { display_title: '7 Wonders Duel', spoken_title: 'UNASSESSABLE', pronunciation_guidance: 'Montage visuel sans narration.', edition: 'Repos Production, 2015' },
  scenes: scenes.map((scene, index) => ({ scene_id: scene.id, start_sec: Number((index * durationPerScene).toFixed(3)), end_sec: Number(((index + 1) * durationPerScene).toFixed(3)), purpose: scene.expectedPurpose, exact_narration_text: 'NONE', expected_visual_role: 'source-grounded actual-game visual plan' })),
  intentional_intro_silence: { start_sec: 0, end_sec: Number((scenes.length * durationPerScene).toFixed(3)), reason: 'This is an intentionally silent visual-only calibration montage; assess only imagery, composition, real-component coverage, recognizability, empty space, and instructional visual relevance.' },
  director_context: {
    brand_rules: [
      'This calibration montage is intentionally silent; do not create audio or narration findings.',
      'Physical instructional scenes require recognizable actual game imagery; generic text boxes or abstract proxies are failures.',
      'Human Director authority supersedes aggregate advisory scores.'
    ],
    approved_strengths: [],
    suspected_defects: []
  },
  deterministic_findings: [
    { id: 'DET-VIS-001', category: 'scope', observation: 'The montage contains every instructional storyboard frame exactly once; silence is intentional and must not be evaluated as a defect.' }
  ]
};
const contextPath = path.join(outputRoot, 'expected-context.json');
writeJson(contextPath, context);
writeJson(path.join(outputRoot, 'manifest.json'), { contract: 'mobius-visual-first-advisory-montage-v1', status: 'PASS', sourceManifest: manifestPath, frameCount: scenes.length, durationSec: context.video.duration_sec, videoPath, videoSha256: context.video.sha256, contextPath });
process.stdout.write(`${JSON.stringify({ status: 'PASS', frameCount: scenes.length, durationSec: context.video.duration_sec, videoPath, contextPath }, null, 2)}\n`);
