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

function findingKey(finding) { return `${finding.category}|${finding.timestamp}|${finding.severity}`; }
function loadReview(value) { return value.result || value; }
const args = argsToObject();
if (!args.before || !args.after || !args.output) throw new Error('Usage: --before <review.json> --after <review.json> --output <comparison.json>');
const before = loadReview(JSON.parse(await fs.readFile(path.resolve(String(args.before)), 'utf8')));
const after = loadReview(JSON.parse(await fs.readFile(path.resolve(String(args.after)), 'utf8')));
validateReviewResult(before);
validateReviewResult(after);
if (before.rubric_version !== TWELVELABS_RUBRIC_VERSION || after.rubric_version !== TWELVELABS_RUBRIC_VERSION) throw new Error('Review rubric mismatch.');

const categoryNames = Object.keys(before.category_scores);
const categoryScoreDeltas = Object.fromEntries(categoryNames.map((name) => [
  name,
  Number((Number(after.category_scores[name]) - Number(before.category_scores[name])).toFixed(2)),
]));
// Model timestamps often move when an edit changes pacing. Pair findings by
// category and occurrence, then report the actual before/after timestamps and
// severity instead of treating a moved timestamp as a new defect.
const grouped = (findings) => findings.reduce((groups, finding) => {
  const list = groups.get(finding.category) || [];
  list.push(finding);
  groups.set(finding.category, list);
  return groups;
}, new Map());
const beforeGroups = grouped(before.findings);
const afterGroups = grouped(after.findings);
const persistent = [];
const resolved = [];
const introduced = [];
const categoryNamesForFindings = new Set([...beforeGroups.keys(), ...afterGroups.keys()]);
for (const category of categoryNamesForFindings) {
  const beforeList = beforeGroups.get(category) || [];
  const afterList = afterGroups.get(category) || [];
  const matchedCount = Math.min(beforeList.length, afterList.length);
  for (let index = 0; index < matchedCount; index += 1) {
    persistent.push({ category, before: findingKey(beforeList[index]), after: findingKey(afterList[index]), severityChanged: beforeList[index].severity !== afterList[index].severity });
  }
  for (let index = matchedCount; index < beforeList.length; index += 1) resolved.push(findingKey(beforeList[index]));
  for (let index = matchedCount; index < afterList.length; index += 1) introduced.push(findingKey(afterList[index]));
}
const countBySeverity = (review, severity) => review.findings.filter((finding) => finding.severity === severity).length;
const comparison = {
  comparison_version: 'mobius-twelvelabs-comparison-v1',
  rubric_version: TWELVELABS_RUBRIC_VERSION,
  before: { overallScore10: before.overall_score_10, releaseVerdict: before.release_verdict, p0: countBySeverity(before, 'P0'), p1: countBySeverity(before, 'P1'), p2: countBySeverity(before, 'P2') },
  after: { overallScore10: after.overall_score_10, releaseVerdict: after.release_verdict, p0: countBySeverity(after, 'P0'), p1: countBySeverity(after, 'P1'), p2: countBySeverity(after, 'P2') },
  overallScoreDelta: Number((after.overall_score_10 - before.overall_score_10).toFixed(2)),
  categoryScoreDeltas,
  resolvedFindingKeys: resolved,
  persistentFindingKeys: persistent,
  introducedFindingKeys: introduced,
  generatedAt: new Date().toISOString(),
};
const outputPath = path.resolve(String(args.output));
await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${JSON.stringify(comparison, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(comparison, null, 2));
