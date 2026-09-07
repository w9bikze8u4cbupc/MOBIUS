#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import ffmpegStatic from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';
import sharp from 'sharp';

const ROOT = path.resolve(process.cwd());
const OUT = path.join(ROOT, 'out', 'publishability-r6', '7-wonders-duel');
const VIDEO = path.join(OUT, '7-wonders-duel-full-tutorial-r6.mp4');
const CONFIG = path.join(OUT, 'full-tutorial-config.json');
const R5_CONFIG = path.join(ROOT, 'out', 'publishability-r5', '7-wonders-duel', 'full-tutorial-config.json');
const BASELINE = path.join(ROOT, 'out', 'publishability-r6', 'baseline-r5', 'baseline-manifest.json');
const NARRATION = path.join(OUT, 'narration-assets.json');
const SOURCE = path.join(OUT, 'source-lineage-report.json');
const DET = path.join(OUT, 'deterministic-qa-report.json');
const FOCUS = path.join(OUT, 'focus-transition-proof', 'report.json');
const GENERALIZATION = path.join(ROOT, 'out', 'publishability-r6', 'terraforming-mars', 'generalization-proof.json');
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const hash = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const write = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); };

for (const file of [VIDEO, CONFIG, R5_CONFIG, BASELINE, NARRATION, SOURCE, DET, FOCUS, GENERALIZATION]) {
  if (!fs.existsSync(file)) throw new Error(`Missing R6 closeout input: ${file}`);
}
const config = read(CONFIG); const r5 = read(R5_CONFIG); const baseline = read(BASELINE);
const narration = read(NARRATION); const source = read(SOURCE); const det = read(DET); const focus = read(FOCUS); const generalization = read(GENERALIZATION);
const media = JSON.parse(execFileSync(ffprobeStatic.path, ['-v', 'error', '-show_entries', 'format=duration,size:stream=codec_type,codec_name,width,height,sample_rate,channels', '-of', 'json', VIDEO], { encoding: 'utf8' }));
const videoStream = media.streams.find((stream) => stream.codec_type === 'video');
const audioStream = media.streams.find((stream) => stream.codec_type === 'audio');
const durationSec = Number(media.format.duration);
const timelineDurationSec = Number(config.scenes.reduce((sum, scene) => sum + Number(scene.durationSec || 0), 0).toFixed(3));

const audioRun = spawnSync(ffmpegStatic, ['-hide_banner', '-i', VIDEO, '-af', 'ebur128=peak=true,silencedetect=noise=-48dB:d=0.25', '-f', 'null', 'NUL'], { encoding: 'utf8', windowsHide: true, maxBuffer: 25e6 });
const audioText = audioRun.stderr || '';
const loudness = [...audioText.matchAll(/I:\s+([-+]?\d+(?:\.\d+)?) LUFS/g)].at(-1)?.[1];
const peak = [...audioText.matchAll(/Peak:\s+([-+]?\d+(?:\.\d+)?) dBFS/g)].at(-1)?.[1];
const silences = [...audioText.matchAll(/silence_start:\s*([\d.]+)/g)].map((match) => Number(match[1]));
const silenceEnds = [...audioText.matchAll(/silence_end:\s*([\d.]+) \| silence_duration:\s*([\d.]+)/g)].map((match) => ({ endSec: Number(match[1]), durationSec: Number(match[2]) }));
const r5AudioRun = spawnSync(ffmpegStatic, ['-hide_banner', '-i', baseline.files.video.path, '-af', 'silencedetect=noise=-48dB:d=0.25', '-f', 'null', 'NUL'], { encoding: 'utf8', windowsHide: true, maxBuffer: 25e6 });
const r5SilenceEnds = [...(r5AudioRun.stderr || '').matchAll(/silence_end:\s*([\d.]+) \| silence_duration:\s*([\d.]+)/g)].map((match) => ({ endSec: Number(match[1]), durationSec: Number(match[2]) }));
const silenceSummary = (items) => ({ count: items.length, totalDurationSec: Number(items.reduce((sum, item) => sum + item.durationSec, 0).toFixed(3)), maxDurationSec: Number(Math.max(0, ...items.map((item) => item.durationSec)).toFixed(3)), overOneSecond: items.filter((item) => item.durationSec >= 1).length });
const r5Silence = silenceSummary(r5SilenceEnds); const r6Silence = silenceSummary(silenceEnds);
const audioBedNonRegression = r6Silence.totalDurationSec <= r5Silence.totalDurationSec + 2
  && r6Silence.overOneSecond <= r5Silence.overOneSecond
  && r6Silence.maxDurationSec <= r5Silence.maxDurationSec + 0.25;

const r5ByAtom = new Map(r5.scenes.filter((scene) => scene.atomId).map((scene) => [scene.atomId, scene]));
const rulesChanged = config.scenes.filter((scene) => scene.atomId).some((scene) => r5ByAtom.get(scene.atomId)?.narrationText !== scene.narrationText);
const expectedSonic = baseline.files.sonicMaster.sha256;
const baselinePreserved = baseline.files.video.sha256 === hash(baseline.files.video.path)
  && baseline.files.configuration.sha256 === hash(baseline.files.configuration.path)
  && baseline.files.narrationManifest.sha256 === hash(baseline.files.narrationManifest.path)
  && baseline.files.visualPlanManifest.sha256 === hash(baseline.files.visualPlanManifest.path)
  && baseline.files.componentLibraryManifest.sha256 === hash(baseline.files.componentLibraryManifest.path);
const chapterAlignment = config.chapters.every((chapter) => {
  let cursor = 0;
  for (const scene of config.scenes) {
    if (scene.id === chapter.sceneId) return Math.abs(cursor - Number(chapter.startSec)) < 0.01;
    cursor += Number(scene.durationSec || 0);
  }
  return false;
});
const outro = config.scenes.at(-1);

const violations = [];
const fail = (code, evidence) => violations.push({ id: `DET-R6-FULL-${String(violations.length + 1).padStart(3, '0')}`, code, evidence });
if (!baselinePreserved) fail('R5_BASELINE_MUTATED', baseline.files);
if (rulesChanged) fail('RULE_OR_SCRIPT_SEMANTICS_CHANGED', null);
if (hash(config.approvedSonicMaster.path) !== expectedSonic || config.approvedSonicMaster.sha256 !== expectedSonic) fail('SONIC_IDENTITY_CHANGED', null);
if (videoStream?.width !== 1920 || videoStream?.height !== 1080 || videoStream?.codec_name !== 'h264') fail('VIDEO_STREAM_INVALID', videoStream);
if (audioStream?.codec_name !== 'aac' || Number(audioStream?.sample_rate) !== 48000 || Number(audioStream?.channels) !== 2) fail('AUDIO_STREAM_INVALID', audioStream);
if (Math.abs(durationSec - timelineDurationSec) > 0.05) fail('TIMELINE_DURATION_MISMATCH', { durationSec, timelineDurationSec });
if (!chapterAlignment) fail('CHAPTER_ALIGNMENT', config.chapters);
if (source.status !== 'PASS' || source.metrics.trueSourceDetailViolations !== 0) fail('SOURCE_DETAIL', source.metrics);
if (det.status !== 'PASS') fail('VISUAL_DETERMINISTIC_QA', det.metrics);
if (focus.status !== 'PASS' || focus.captureCount !== 20) fail('FOCUS_RENDER_PROOF', { status: focus.status, captures: focus.captureCount });
if (generalization.status !== 'PASS') fail('TM_GENERALIZATION', generalization.checks);
if (narration.assets.length !== 30 || narration.assets.some((asset) => asset.profile !== 'AMELIE_TEACHING_WARM_R6')) fail('WARM_PROFILE_NOT_APPLIED', { count: narration.assets.length });
if (narration.voiceId !== read(path.join(ROOT, 'out', 'publishability-r5', '7-wonders-duel', 'narration-assets.json')).voiceId) fail('VOICE_IDENTITY_CHANGED', null);
if (!outro.outroCompletionGuard?.valid || outro.durationSec < outro.outroCompletionGuard.requiredDurationSec) fail('OUTRO_COMPLETION_GUARD', outro.outroCompletionGuard);
if (!Number.isFinite(Number(loudness)) || Number(loudness) < -20 || Number(loudness) > -14) fail('LOUDNESS_RANGE', loudness);
if (!Number.isFinite(Number(peak)) || Number(peak) > -1) fail('TRUE_PEAK', peak);
if (!audioBedNonRegression) fail('AUDIO_BED_CONTINUITY_REGRESSION', { r5: r5Silence, r6: r6Silence });

let cursor = 0;
const reviewDir = path.join(OUT, 'rendered-review-sheets');
fs.mkdirSync(reviewDir, { recursive: true });
const captures = [];
for (const scene of config.scenes) {
  const local = Math.min(Math.max(0.12, Number(scene.durationSec) * 0.5), Math.max(0.12, Number(scene.durationSec) - 0.12));
  const globalSec = Number((cursor + local).toFixed(3));
  const filePath = path.join(reviewDir, `${String(captures.length + 1).padStart(2, '0')}-${scene.id}.png`);
  const seekStart = Math.max(0, globalSec - 1.5);
  execFileSync(ffmpegStatic, ['-y', '-hide_banner', '-loglevel', 'error', '-ss', String(seekStart), '-i', VIDEO, '-ss', String(globalSec - seekStart), '-frames:v', '1', filePath], { windowsHide: true });
  const meta = await sharp(filePath).metadata();
  captures.push({ sceneId: scene.id, atomId: scene.atomId || null, globalSec, filePath, sha256: hash(filePath), width: meta.width, height: meta.height });
  cursor += Number(scene.durationSec || 0);
}
const sheets = [];
for (let offset = 0; offset < captures.length; offset += 6) {
  const group = captures.slice(offset, offset + 6); const composite = [];
  for (let index = 0; index < group.length; index += 1) {
    const image = await sharp(group[index].filePath).resize(960, 540, { fit: 'contain', background: '#120b08' }).png().toBuffer();
    const label = Buffer.from(`<svg width="960" height="50"><rect width="960" height="50" fill="#21150f"/><text x="18" y="33" fill="#f7ecd2" font-family="Arial" font-size="21">${group[index].sceneId}</text></svg>`);
    const tile = await sharp({ create: { width: 960, height: 590, channels: 3, background: '#120b08' } }).composite([{ input: image, left: 0, top: 0 }, { input: label, left: 0, top: 540 }]).png().toBuffer();
    composite.push({ input: tile, left: (index % 2) * 960, top: Math.floor(index / 2) * 590 });
  }
  const filePath = path.join(reviewDir, `rendered-review-sheet-${String(sheets.length + 1).padStart(2, '0')}.png`);
  await sharp({ create: { width: 1920, height: 1770, channels: 3, background: '#120b08' } }).composite(composite).png().toFile(filePath);
  sheets.push({ filePath, sha256: hash(filePath), sceneIds: group.map((item) => item.sceneId) });
}

const contextScenes = []; cursor = 0;
for (const scene of config.scenes) {
  contextScenes.push({ scene_id: scene.id, start_sec: Number(cursor.toFixed(3)), end_sec: Number((cursor + Number(scene.durationSec)).toFixed(3)), purpose: scene.chapterTitle || scene.majorSection || scene.id, exact_narration_text: scene.narrationText || 'NONE', expected_visual_role: scene.background?.kind || null, source_refs: scene.sourceRefs || [] });
  cursor += Number(scene.durationSec || 0);
}
const context = {
  schema_version: 'mobius-full-tutorial-expected-context-v1',
  video: { path: VIDEO, sha256: hash(VIDEO), duration_sec: durationSec, resolution: '1920x1080' },
  identity: { display_title: '7 Wonders Duel', spoken_title: 'Seven Wonders Duel', locale: 'fr-CA', pronunciation_guidance: 'Prononciation naturelle en français québécois; ne pas exiger un accent anglophone théâtral.', edition: 'Repos Production, 2015' },
  scenes: contextScenes,
  intentional_intro_silence: { start_sec: 0, end_sec: 3.6, reason: 'Signature café-ludique sans Amélie, verrouillée et approuvée.' },
  director_context: { brand_rules: ['R5 est la référence humaine publiable; R6 doit préserver règles, identité sonore et structure.', 'Les repères doivent suivre la clause narrée.', 'Les composants coupés et les faibles rasters agrandis sont des défauts.', 'La chaleur vocale est évaluée en plus de la stabilité.'], approved_strengths: ['Couverture source-grounded complète.', 'Identité sonore verrouillée.', 'Transitions et chapitres approuvés.'], suspected_defects: [] },
  deterministic_findings: [{ id: 'DET-R6-001', category: 'scope', observation: 'Les preuves déterministes de résolution native, coupe, centrage, référence et repères sont conservées séparément.' }],
  chapters: config.chapters,
};
write(path.join(OUT, 'expected-context-full.json'), context);
const report = {
  contract: 'mobius-publishability-r6-full-qa-v1', generatedAt: new Date().toISOString(), status: violations.length ? 'FAIL' : 'PASS', violationCount: violations.length, violations,
  media: { videoPath: VIDEO, videoSha256: hash(VIDEO), durationSec, timelineDurationSec, videoStream, audioStream, integratedLufs: Number(loudness), truePeakDbfs: Number(peak), silenceEvents: silences.length, audioBedNonRegression, silenceComparison: { r5: r5Silence, r6: r6Silence } },
  safeguards: { r5BaselinePreserved: baselinePreserved, rulesChanged, sonicIdentityUnchanged: hash(config.approvedSonicMaster.path) === expectedSonic, voiceIdentityPreserved: narration.voiceId === read(path.join(ROOT, 'out', 'publishability-r5', '7-wonders-duel', 'narration-assets.json')).voiceId, warmProfileApplied: narration.assets.every((asset) => asset.profile === 'AMELIE_TEACHING_WARM_R6'), outroGuardPass: Boolean(outro.outroCompletionGuard?.valid), chapterAlignment },
  upstream: { sourceDetail: source.metrics, visualQa: det.metrics, focusProof: { status: focus.status, captureCount: focus.captureCount }, tmGeneralization: generalization.status },
  physicalReview: { status: captures.every((item) => item.width === 1920 && item.height === 1080) ? 'PASS' : 'FAIL', everySceneCaptured: captures.length === config.scenes.length, captures, sheets },
  expectedContextPath: path.join(OUT, 'expected-context-full.json'),
};
if (report.physicalReview.status !== 'PASS' || !report.physicalReview.everySceneCaptured) { report.violations.push({ id: `DET-R6-FULL-${String(report.violations.length + 1).padStart(3, '0')}`, code: 'PHYSICAL_REVIEW_ARTIFACT', evidence: report.physicalReview }); report.violationCount = report.violations.length; report.status = 'FAIL'; }
write(path.join(OUT, 'full-tutorial-qa.json'), report);
write(path.join(reviewDir, 'manifest.json'), report.physicalReview);
process.stdout.write(`${JSON.stringify({ status: report.status, violations: report.violationCount, media: report.media, safeguards: report.safeguards, reviewSheets: sheets.length }, null, 2)}\n`);
if (report.status !== 'PASS') process.exitCode = 1;
