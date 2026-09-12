#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.cwd());
const r7ManifestPath = path.join(ROOT, 'out/publishability-r7/7-wonders-duel/narration-assets.json');
const manifestPath = fs.existsSync(r7ManifestPath)
  ? r7ManifestPath
  : path.join(ROOT, 'out/publishability-r6/7-wonders-duel/narration-assets.json');
const transcriptRoot = path.join(ROOT, 'out/publishability-r7/7-wonders-duel/audio-audit/whisper-small');
const regeneratedTranscriptRoot = path.join(ROOT, 'out/publishability-r7/7-wonders-duel/audio-audit/r7-regenerated');
const outputPath = path.join(ROOT, 'out/publishability-r7/7-wonders-duel/audio-audit/report.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

const normalize = (value) => String(value || '')
  .normalize('NFD').replace(/\p{Diacritic}/gu, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const tokens = (value) => normalize(value).split(/\s+/).filter(Boolean);
function similarity(left, right) {
  const a = tokens(left); const b = tokens(right);
  const matrix = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j += 1) matrix[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) for (let j = 1; j <= b.length; j += 1) {
    matrix[i][j] = Math.min(matrix[i - 1][j] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  }
  return Number((1 - matrix[a.length][b.length] / Math.max(1, a.length, b.length)).toFixed(3));
}
function adjacentRepeats(value) {
  const words = tokens(value);
  return words.flatMap((word, index) => index && word.length > 2 && word === words[index - 1] ? [word] : []);
}

const entries = manifest.assets.map((asset) => {
  const base = path.basename(asset.filePath, path.extname(asset.filePath));
  const regeneratedTranscriptPath = path.join(regeneratedTranscriptRoot, `${base}.json`);
  const transcriptPath = fs.existsSync(regeneratedTranscriptPath)
    ? regeneratedTranscriptPath
    : path.join(transcriptRoot, `${base}.json`);
  if (!fs.existsSync(transcriptPath)) return { sceneId: asset.sceneId, status: 'FAIL', reason: 'missing-transcript' };
  const transcript = JSON.parse(fs.readFileSync(transcriptPath, 'utf8'));
  const expectedRepeats = adjacentRepeats(asset.sourceText);
  const heardRepeats = adjacentRepeats(transcript.text).filter((word) => !expectedRepeats.includes(word));
  const semanticSimilarity = similarity(asset.sourceText, transcript.text);
  const suspect = heardRepeats.length > 0 || semanticSimilarity < 0.72;
  return {
    sceneId: asset.sceneId,
    audioPath: asset.filePath,
    transcriptPath,
    sourceTextHash: asset.sourceTextHash,
    audioSha256: asset.sha256,
    semanticSimilarity,
    unexpectedAdjacentWordRepeats: heardRepeats,
    suspectRestart: suspect,
    status: suspect ? 'REVIEW' : 'PASS',
  };
});
const suspects = entries.filter((entry) => entry.suspectRestart);
const regeneratedSegments = entries
  .filter((entry) => entry.transcriptPath?.startsWith(regeneratedTranscriptRoot))
  .map((entry) => entry.sceneId);
const report = {
  contract: 'mobius-amelie-segment-audit-v1',
  generatedAt: new Date().toISOString(),
  method: 'local-whisper-small-transcript-vs-frozen-source-plus-adjacent-repeat-check',
  segmentCount: entries.length,
  suspectCount: suspects.length,
  regenerationAuthorized: suspects.length > 0,
  targetedRegenerationPerformed: regeneratedSegments.length > 0,
  regeneratedSegments,
  decision: suspects.length
    ? 'TARGETED_PHYSICAL_REVIEW_REQUIRED'
    : regeneratedSegments.length
      ? 'TARGETED_REGENERATION_VERIFIED_NO_RESTART_REMAINS'
      : 'PRESERVE_R6_AUDIO_NO_SPECULATIVE_REGENERATION',
  entries,
};
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify({ status: suspects.length ? 'WARN' : 'PASS', outputPath, segmentCount: entries.length, suspectCount: suspects.length, suspects: suspects.map((entry) => entry.sceneId) }, null, 2)}\n`);
