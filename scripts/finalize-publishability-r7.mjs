#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.cwd());
const OUT = path.join(ROOT, 'out', 'publishability-r7', '7-wonders-duel');
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const videoPath = path.join(OUT, '7-wonders-duel-full-tutorial-r7.mp4');
const fullQa = read(path.join(OUT, 'full-qa-r7.json'));
const det = read(path.join(OUT, 'deterministic-qa-r7.json'));
const tl = read(path.join(OUT, 'twelvelabs', 'provider-response.parsed.json'));
const adj = read(path.join(OUT, 'twelvelabs', 'adjudication.json'));
const runner = read(path.join(OUT, 'runner-evidence.json'));
const replay = read(path.join(OUT, 'replay-idempotence.json'));
if (fullQa.status !== 'PASS' || det.status !== 'PASS') throw new Error('R7 deterministic QA is not passing.');
if (adj.confirmedUnresolvedP1 || adj.confirmedUnresolvedP2) throw new Error('Confirmed P1/P2 remains.');
const closeout = {
  contract: 'mobius-publishability-r7-closeout-v1',
  generatedAt: new Date().toISOString(),
  technical: 'PASS',
  editorial: 'READY_FOR_DIRECTOR_REVIEW',
  publishable: 'HUMAN_ONLY',
  candidate: { path: videoPath, sha256: sha256(videoPath), durationSec: fullQa.media.durationSec },
  deterministic: { status: fullQa.status, violations: fullQa.violationCount },
  regression: det.regression,
  twelveLabs: {
    status: tl.verdict === 'PASS' ? 'PASS' : 'WARN',
    verdict: tl.verdict,
    score: tl.overall_score_10,
    model: tl.model_name,
    actualAnalysisCalls: runner.analysisCallCount,
    cacheHit: runner.cacheHit,
    findings: tl.findings.length,
    adjudicationCounts: adj.counts,
    confirmedUnresolvedP1: adj.confirmedUnresolvedP1,
    confirmedUnresolvedP2: adj.confirmedUnresolvedP2,
  },
  replay: { status: replay.deterministic && replay.narrationGenerated === 0 ? 'PASS' : 'FAIL', narrationGenerated: replay.narrationGenerated, narrationReused: replay.narrationReused },
  r6FallbackRetained: det.regression.r6FallbackRetained,
  prMerged: false,
};
fs.writeFileSync(path.join(OUT, 'closeout-r7.json'), `${JSON.stringify(closeout, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify(closeout, null, 2)}\n`);
