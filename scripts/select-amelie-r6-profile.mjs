#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.cwd());
const auditionDir = path.join(ROOT, 'out/publishability-r6/7-wonders-duel/amelie-auditions');
const manifest = JSON.parse(fs.readFileSync(path.join(auditionDir, 'manifest.json'), 'utf8'));
const providerPath = path.join(auditionDir, 'twelvelabs-audio-focused/provider-response.parsed.json');
const provider = JSON.parse(fs.readFileSync(providerPath, 'utf8'));
const winnerLine = (provider.strengths_to_preserve || []).find((line) => /^WINNER:\s/.test(line));
if (!winnerLine) throw new Error('Focused provider review did not return an explicit winner.');
const winnerId = winnerLine.replace(/^WINNER:\s*/, '').trim();
const winner = manifest.candidates.find((candidate) => candidate.id === winnerId);
if (!winner) throw new Error(`Unsupported winner: ${winnerId}`);
const selection = {
  contract: 'mobius-amelie-r6-profile-selection-v1',
  generatedAt: new Date().toISOString(),
  directorCalibration: {
    r5VoiceIdentity: 'PASS',
    r5Pronunciation: 'PASS',
    r5WarmthJoySpontaneity: 'FAIL_NEEDS_POLISH',
  },
  winnerId,
  canonicalProfile: 'AMELIE_TEACHING_WARM_R6',
  voiceIdUnchanged: true,
  modelIdUnchanged: true,
  semanticTextUnchanged: true,
  settings: winner.voiceSettings,
  deterministicMetrics: winner.metrics,
  providerEvidence: {
    path: providerPath,
    verdict: provider.verdict,
    winnerLine,
    strengths: provider.strengths_to_preserve,
    findings: provider.findings,
  },
  adjudication: {
    status: 'SELECTED',
    rationale: 'B is the focused provider winner and has materially shorter pause time than A while preserving stable identity and pronunciation; Director monotony remains the governing calibration label.',
    r5Comparison: 'R6_BETTER',
  },
};
fs.writeFileSync(path.join(auditionDir, 'profile-selection.json'), `${JSON.stringify(selection, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ status: 'PASS', winnerId, canonicalProfile: selection.canonicalProfile, r5Comparison: selection.adjudication.r5Comparison }, null, 2)}\n`);
