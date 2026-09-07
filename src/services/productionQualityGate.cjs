'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { auditVisualCoverage, assertAssetFiles } = require('./visualPlan.cjs');
const { validatePhysicalGameState } = require('./physicalGameState.cjs');
const { auditNarrationPerformance } = require('./narrationPerformanceQa.cjs');

const PRODUCTION_QA_CONTRACT = 'mobius-normal-production-qa-v1';

function runProductionQualityGate({
  phase = 'canonical-state',
  knowledgeModel,
  coverageMatrix,
  plans = [],
  assets = [],
  physicalStates = [],
  reviewItems = [],
  narrationRecords = [],
  audio = null,
  chapters = null,
  replay = null,
  brand = null,
} = {}) {
  const violations = [];
  const warnings = [];
  const atoms = knowledgeModel?.ruleAtoms || [];
  const acceptedAtoms = atoms.filter((atom) => atom.reviewState === 'accepted');
  for (const atom of acceptedAtoms) {
    if (!(atom.sourceRefs || []).length) violations.push({ code: 'rule-source-grounding-missing', atomId: atom.id });
  }
  for (const domain of coverageMatrix?.missingHighPriorityDomains || []) {
    violations.push({ code: 'high-priority-coverage-missing', domain });
  }
  const visualCoverage = auditVisualCoverage({ atoms, plans, assets });
  for (const scene of visualCoverage.scenes.filter((entry) => entry.qaStatus === 'FAIL')) {
    for (const code of scene.violations) violations.push({ code, atomId: scene.ruleAtomId });
  }
  for (const missing of assertAssetFiles(assets)) violations.push({ code: missing.violation, assetId: missing.assetId });
  for (const state of physicalStates) {
    const result = validatePhysicalGameState(state);
    for (const code of result.violations) violations.push({ code, atomId: state.ruleAtomId });
  }
  for (const item of reviewItems) warnings.push({ code: 'cockpit-review-required', itemId: item.id, atomId: item.ruleAtomId, reason: item.reason });

  const narration = narrationRecords.map((record) => ({
    sceneId: record.sceneId || record.id,
    ...auditNarrationPerformance({
      intendedText: record.intendedText || record.text,
      transcriptText: record.transcriptText || record.transcript,
      durationSec: record.durationSec || Number(record.durationMs || 0) / 1000,
      pauseDurationSec: record.pauseDurationSec || 0,
    }),
  }));
  if (phase === 'final') {
    for (const record of narration.filter((entry) => entry.status === 'FAIL')) {
      for (const code of record.violations) violations.push({ code: `narration-${code}`, sceneId: record.sceneId });
    }
    if (!audio?.loudnessPass) violations.push({ code: 'audio-loudness-contract-failed' });
    if (!audio?.truePeakPass) violations.push({ code: 'audio-true-peak-contract-failed' });
    if (!chapters?.aligned) violations.push({ code: 'chapter-alignment-failed' });
    if (!replay?.idempotent) violations.push({ code: 'replay-idempotency-failed' });
    if (!brand?.sonicContractPass) violations.push({ code: 'intro-sonic-contract-failed' });
  }
  const blockingReviewItems = reviewItems.filter((item) => item.status === 'needs_visual_review' || item.status === 'blocked');
  if (phase === 'final' && blockingReviewItems.length) violations.push({ code: 'unresolved-cockpit-review-items', count: blockingReviewItems.length });
  return {
    contract: PRODUCTION_QA_CONTRACT,
    phase,
    status: violations.length ? 'FAIL' : 'PASS',
    blockingViolationCount: violations.length,
    warningCount: warnings.length,
    violations,
    warnings,
    visualCoverage,
    narrationPerformance: narration,
    reviewQueue: {
      count: reviewItems.length,
      blockingCount: blockingReviewItems.length,
    },
    provenance: {
      knowledgeModel: knowledgeModel?.contract || null,
      coverageMatrix: coverageMatrix?.contract || null,
      visualPlans: plans.length,
      assets: assets.length,
      assetFilesResolved: assets.filter((asset) => {
        const file = asset.displayPath || asset.renderPath || asset.filePath || asset.path || asset.sourceImage;
        return file && fs.existsSync(path.resolve(file));
      }).length,
    },
  };
}

module.exports = { PRODUCTION_QA_CONTRACT, runProductionQualityGate };
