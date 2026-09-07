#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { runProductionQualityGate } = require('../src/services/productionQualityGate.cjs');

function arg(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : null;
}

function readJson(filePath, fallback = null) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { return fallback; }
}

const root = path.resolve(arg('root') || process.cwd());
const projectId = arg('project-id');
const statePath = path.resolve(arg('state') || (projectId ? path.join(root, 'data', projectId, 'production', 'canonical-production-state.json') : ''));
if (!statePath || !fs.existsSync(statePath)) throw new Error('Use --state <canonical-production-state.json> or --project-id <id>.');
const state = readJson(statePath);
const phase = arg('phase') || 'canonical-state';
const report = runProductionQualityGate({
  phase,
  knowledgeModel: state.knowledgeModel || readJson(state.knowledgeModelPath),
  coverageMatrix: state.coverageMatrix || readJson(state.coverageMatrixPath),
  plans: state.visualPlans || [],
  assets: state.assets || [],
  physicalStates: state.physicalStates || [],
  reviewItems: state.reviewItems || [],
  narrationRecords: state.narrationRecords || [],
  audio: state.audio || null,
  chapters: state.chapters || null,
  replay: state.replay || null,
  brand: state.brand || null,
});
const outputPath = path.resolve(arg('out') || path.join(path.dirname(statePath), 'production-qa.json'));
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ status: report.status, blockingViolations: report.blockingViolationCount, report: outputPath }, null, 2));
if (report.status !== 'PASS') process.exitCode = 1;
