#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { validateReviewResult, TWELVELABS_RUBRIC_VERSION } from '../src/services/twelveLabsVideoReview.js';

function argsToObject(argv = process.argv.slice(2)) {
  const values = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith('--')) continue;
    const key = argv[i].slice(2);
    values[key] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
  }
  return values;
}

function required(args, name) {
  if (!args[name]) throw new Error(`Missing required option --${name}`);
  return path.resolve(String(args[name]));
}

const args = argsToObject();
const reviewPath = required(args, 'review');
const outputPath = required(args, 'output');
const verification = args.verification
  ? JSON.parse(await fs.readFile(path.resolve(String(args.verification)), 'utf8'))
  : (args['verification-json'] ? JSON.parse(String(args['verification-json'])) : {});
const wrapper = JSON.parse(await fs.readFile(reviewPath, 'utf8'));
const review = wrapper.result || wrapper;
validateReviewResult(review);

const checks = new Map((verification.findings || []).map((finding) => [
  `${finding.timestamp}|${finding.category}|${finding.severity}`,
  finding,
]));
const calibratedFindings = review.findings.map((finding) => {
  const check = checks.get(`${finding.timestamp}|${finding.category}|${finding.severity}`) || {};
  return {
    ...finding,
    physicalVerification: {
      status: check.status || 'unable_to_verify',
      evidence: check.evidence || null,
      correctiveAction: check.correctiveAction || null,
    },
  };
});

const scoreEntries = Object.entries(verification.verifiedCategoryScores || {})
  .filter(([, score]) => Number.isFinite(Number(score)) && Number(score) >= 0 && Number(score) <= 10)
  .map(([, score]) => Number(score));
const verifiedScore = scoreEntries.length
  ? Number((scoreEntries.reduce((sum, score) => sum + score, 0) / scoreEntries.length).toFixed(2))
  : null;
const statusCounts = Object.fromEntries(['confirmed', 'partially_confirmed', 'rejected', 'unable_to_verify'].map((status) => [
  status,
  calibratedFindings.filter((finding) => finding.physicalVerification.status === status).length,
]));

const result = {
  calibration_version: 'mobius-twelvelabs-calibration-v1',
  rubric_version: TWELVELABS_RUBRIC_VERSION,
  video_sha256: wrapper.videoSha256 || verification.videoSha256 || null,
  model: wrapper.model || verification.model || null,
  raw_review_path: reviewPath,
  raw_overall_score_10: review.overall_score_10,
  verified_external_qa_score_10: verifiedScore,
  finding_status_counts: statusCounts,
  findings: calibratedFindings,
  known_mobius_concerns: verification.knownMobiusConcerns || [],
  three_highest_impact_verified_changes: verification.topVerifiedChanges || [],
  physical_verification_method: verification.method || 'ffprobe, rendered-frame inspection, and scene-contract comparison',
  generatedAt: new Date().toISOString(),
};
await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ outputPath, rubricVersion: result.rubric_version, verifiedScore, findingStatusCounts: statusCounts }, null, 2));
