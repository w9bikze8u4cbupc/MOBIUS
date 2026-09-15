#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import ffmpegStatic from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';

const root = path.resolve(process.cwd());
const packetRoot = path.join(root, 'out', 'mission-01', 'twelve-labs-calibration', 'gold-r1');
const r4Root = path.join(root, 'out', 'mission-01', 'twelve-labs-calibration', 'r4');
const ffmpeg = process.env.MOBIUS_FFMPEG_PATH || ffmpegStatic;
const ffprobe = process.env.MOBIUS_FFPROBE_PATH || ffprobeStatic.path;
const games = {
  'terraforming-mars': {
    video: path.join(root, 'out', 'mission-01', 'terraforming-mars', 'terraforming-mars-opening-preview.mp4'),
    sha256: '8d77e92916f7d97dc2d2864cb87eee8a66d8fbab94d478b595c4eafe1e4cb493',
  },
  '7-wonders-duel': {
    video: path.join(root, 'out', 'mission-01', '7-wonders-duel', '7-wonders-duel-opening-preview.mp4'),
    sha256: 'dbeb494e42e5c3c637a5824df296a3bca9640f90ea0b0e60250836fa9c587e3e',
  },
};
const hashFile = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const writeJson = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8'); };
const run = (args) => execFileSync(ffmpeg, args, { stdio: 'ignore', windowsHide: true });
const mediaInfo = (file) => JSON.parse(execFileSync(ffprobe, ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,width,height,sample_rate,channels', '-of', 'json', file], { encoding: 'utf8' }));

fs.mkdirSync(packetRoot, { recursive: true });
const r4 = Object.fromEntries(Object.entries(games).map(([game, info]) => [game, {
  parsed: readJson(path.join(r4Root, game, 'provider-response.parsed.json')),
  sourceVideo: info.video,
  sourceSha256: hashFile(info.video),
}]));
for (const [game, info] of Object.entries(games)) {
  if (r4[game].sourceSha256 !== info.sha256) throw new Error(`${game}: current video SHA differs from the R4 immutable SHA.`);
}

const items = [
  { itemId: 'GOLD-TM-INTRO-SONIC', findingId: 'TL-001', game: 'terraforming-mars', sourceFindingId: 'TL-001', type: 'audio_video', originalStartSec: 0, originalEndSec: 3.6, clipStartSec: 0, clipEndSec: 3.6, output: 'terraforming-mars-intro-sonic.mp4', question: 'Entendez-vous une signature café-ludique identifiable et suffisamment présente dans cette intro ?', severityIfConfirmed: 'P2' },
  { itemId: 'GOLD-7WD-INTRO-SONIC', findingId: 'TL-001', game: '7-wonders-duel', sourceFindingId: 'TL-001', type: 'audio_video', originalStartSec: 0, originalEndSec: 3.6, clipStartSec: 0, clipEndSec: 3.6, output: '7-wonders-duel-intro-sonic.mp4', question: 'Entendez-vous une signature café-ludique identifiable et suffisamment présente dans cette intro ?', severityIfConfirmed: 'P2' },
  { itemId: 'GOLD-7WD-MOBILE-MARGINS', findingId: 'TL-002', game: '7-wonders-duel', sourceFindingId: 'TL-002', type: 'audio_video_frame', originalStartSec: 3.6, originalEndSec: 24.68, clipStartSec: 3.6, clipEndSec: 8.0, frameSec: 5.0, output: '7-wonders-duel-metadata-margins.mp4', frameOutput: '7-wonders-duel-metadata-margins-frame.png', question: 'Les marges latérales du panneau de métadonnées sont-elles trop étroites pour une lecture confortable sur téléphone ?', severityIfConfirmed: 'P2' },
  { itemId: 'GOLD-7WD-PRONUNCIATION-CHECK', findingId: null, game: '7-wonders-duel', sourceFindingId: null, sourceCheck: 'pronunciation_checks[0]', type: 'audio_video', originalStartSec: 7.0, originalEndSec: 12.5, clipStartSec: 6.5, clipEndSec: 12.5, output: '7-wonders-duel-title-pronunciation.mp4', question: 'La prononciation de « Seven Wonders Duel » est-elle naturelle, fluide et reconnaissable en français québécois ?', severityIfConfirmed: 'P2' },
];

const manifestItems = items.map((item) => {
  const source = r4[item.game];
  const finding = item.sourceFindingId ? source.parsed.findings.find((entry) => entry.id === item.sourceFindingId) : null;
  const pronunciation = !finding ? source.parsed.pronunciation_checks?.[0] : null;
  const outputPath = path.join(packetRoot, item.output);
  const duration = item.clipEndSec - item.clipStartSec;
  const args = ['-y', '-hide_banner', '-loglevel', 'error', '-ss', String(item.clipStartSec), '-i', source.sourceVideo, '-t', String(duration), '-map', '0:v:0', '-map', '0:a:0?', '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-ar', '48000', '-ac', '2', outputPath];
  run(args);
  let framePath = null;
  if (item.frameOutput) {
    framePath = path.join(packetRoot, item.frameOutput);
    run(['-y', '-hide_banner', '-loglevel', 'error', '-ss', String(item.frameSec), '-i', source.sourceVideo, '-frames:v', '1', '-q:v', '2', framePath]);
  }
  const media = mediaInfo(outputPath);
  return {
    calibration_item_id: item.itemId,
    finding_id: item.findingId,
    provider_record_type: item.sourceFindingId ? 'finding' : 'pronunciation_check',
    source_finding_id: item.sourceFindingId,
    source_check: item.sourceCheck || null,
    game: item.game,
    source_video_path: source.sourceVideo,
    source_video_sha256: source.sourceSha256,
    original_timestamp: { start_sec: item.originalStartSec, end_sec: item.originalEndSec },
    packet_clip_timestamp: { start_sec: item.clipStartSec, end_sec: item.clipEndSec },
    exact_twelve_labs_observation: finding?.observation || `Contrôle fournisseur: ${pronunciation?.term || 'Seven Wonders Duel'} — ${pronunciation?.heard_as || 'UNASSESSABLE'}.`,
    exact_twelve_labs_evidence: finding?.evidence || 'Le contrôle de prononciation fournisseur indique que le titre est reconnaissable et sans pause interne notable.',
    question_for_director: item.question,
    clip_path: outputPath,
    clip_sha256: hashFile(outputPath),
    clip_duration_sec: Number(media.format?.duration || duration),
    frame_path: framePath,
    frame_sha256: framePath ? hashFile(framePath) : null,
    frame_timestamp_sec: item.frameSec || null,
    review_seconds: Number((item.clipEndSec - item.clipStartSec).toFixed(2)),
    severity_if_confirmed_default: item.severityIfConfirmed,
  };
});

const totalReviewSeconds = Number(manifestItems.reduce((sum, item) => sum + item.review_seconds, 0).toFixed(2));
const manifest = {
  packet: 'MOBIUS_TWELVE_LABS_GOLD_CALIBRATION_R1',
  sourceRoot: r4Root,
  sourceVideoHashesVerified: true,
  sourceVideosModified: false,
  providerCallsInThisMission: 0,
  totalDirectorReviewSeconds: totalReviewSeconds,
  itemCount: manifestItems.length,
  items: manifestItems,
  excludedPositiveProviderRecords: [
    'Terraforming Mars TL-002 through TL-008: positive validation statements, not defects.',
    '7 Wonders Duel positive scene-boundary and pronunciation checks are represented only as the requested pronunciation check, not as findings.',
  ],
};
writeJson(path.join(packetRoot, 'calibration-packet-manifest.json'), manifest);
writeJson(path.join(packetRoot, 'gold-labels.template.json'), {
  schema_version: 'mobius-twelvelabs-gold-labels-v1',
  instructions: 'Director: set one verdict per item. Do not infer labels from the provider result.',
  labels: manifestItems.map((item) => ({ calibration_item_id: item.calibration_item_id, finding_id: item.finding_id, director_verdict: null, severity_if_confirmed: null, note: '' })),
});

const lines = [
  '# Director calibration sheet — Twelve Labs Gold R1',
  '',
  `Review target: ${totalReviewSeconds} seconds of media across ${manifestItems.length} items (PNG frame is optional and adds no playback time).`,
  '',
  'Répondre à chaque question par **YES**, **NO** ou **UNSURE** dans `gold-labels.template.json`.',
  '',
  ...manifestItems.map((item, index) => [
    `## ${index + 1}. ${item.calibration_item_id}`,
    '',
    `- Jeu: ${item.game}`,
    `- Extrait: ${item.clip_path}`,
    item.frame_path ? `- Frame représentative à ${item.frame_timestamp_sec} s: ${item.frame_path}` : null,
    `- Timestamp source: ${item.original_timestamp.start_sec}–${item.original_timestamp.end_sec} s`,
    `- Claim Twelve Labs: ${item.exact_twelve_labs_observation}`,
    `- Question: **${item.question_for_director}** (YES / NO / UNSURE)`,
    '',
  ].filter(Boolean).join('\n')),
  '## Exclusions',
  '',
  'Les records TL positifs (continuité vocale, prononciation claire, lisibilité confirmée, transitions satisfaisantes) ne sont pas soumis comme findings à étiqueter.',
];
fs.writeFileSync(path.join(packetRoot, 'director-calibration-sheet.md'), `${lines.join('\n')}\n`, 'utf8');
console.log(JSON.stringify({ packetRoot, totalReviewSeconds, itemCount: manifestItems.length, providerCallsInThisMission: 0, items: manifestItems.map((item) => ({ id: item.calibration_item_id, findingId: item.finding_id, clip: item.clip_path, question: item.question_for_director })) }, null, 2));
