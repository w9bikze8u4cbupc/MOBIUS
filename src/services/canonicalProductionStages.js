import fs from 'node:fs';

export const CANONICAL_PRODUCTION_STAGE_ORDER = Object.freeze([
  'source',
  'ai-provider',
  'extraction',
  'hephaestus',
  'rulebook-knowledge',
  'coverage',
  'physical-state',
  'visual-plan',
  'storyboard',
  'narration',
  'render',
  'qa',
]);

export const PRODUCTION_STAGE_STATUS = Object.freeze({
  READY: 'READY',
  DRAFT_PRE_EVIDENCE: 'DRAFT_PRE_EVIDENCE',
  INVALID: 'INVALID',
});

function exists(filePath) {
  return Boolean(filePath && fs.existsSync(filePath));
}

export function canonicalStageReady(checkpoint, name, inputHash, outputs = []) {
  const stage = checkpoint?.stages?.[name];
  return stage?.status === PRODUCTION_STAGE_STATUS.READY
    && stage.inputHash === inputHash
    && outputs.every(exists);
}

export function preEvidenceDraftReady(checkpoint, name, inputHash, outputs = []) {
  const stage = checkpoint?.stages?.[name];
  return stage?.status === PRODUCTION_STAGE_STATUS.DRAFT_PRE_EVIDENCE
    && stage.inputHash === inputHash
    && outputs.every(exists);
}

export function markCanonicalStage(checkpoint, name, inputHash, outputs = [], extra = {}) {
  if (CANONICAL_PRODUCTION_STAGE_ORDER.includes(name)) {
    const missingOutputs = outputs.filter((filePath) => !exists(filePath));
    if (missingOutputs.length) {
      const error = new Error(`PRODUCTION_STAGE_OUTPUT_MISSING: ${name} did not materialize ${missingOutputs.join(', ')}`);
      error.code = 'PRODUCTION_STAGE_OUTPUT_MISSING';
      error.stage = name;
      error.missingOutputs = missingOutputs;
      throw error;
    }
  }
  checkpoint.stages = checkpoint.stages || {};
  checkpoint.stages[name] = {
    inputHash,
    outputs,
    status: PRODUCTION_STAGE_STATUS.READY,
    ...extra,
  };
  return checkpoint.stages[name];
}

export function markPreEvidenceDraft(checkpoint, name, inputHash, outputs = [], extra = {}) {
  checkpoint.stages = checkpoint.stages || {};
  checkpoint.stages[name] = {
    inputHash,
    outputs,
    status: PRODUCTION_STAGE_STATUS.DRAFT_PRE_EVIDENCE,
    ...extra,
  };
  return checkpoint.stages[name];
}

// Contract upgrades must invalidate only the dependent production slice.  The
// previous output metadata remains in the checkpoint history for provenance;
// compatible source and HEPHAESTUS evidence are deliberately untouched.
export function invalidateCanonicalStages(checkpoint, names = [], reason = 'contract-changed') {
  checkpoint.stages = checkpoint.stages || {};
  checkpoint.invalidationHistory = checkpoint.invalidationHistory || [];
  const invalidated = [];
  for (const name of names) {
    const previous = checkpoint.stages[name];
    if (!previous) continue;
    checkpoint.invalidationHistory.push({
      stage: name,
      reason,
      at: new Date().toISOString(),
      previous: { inputHash: previous.inputHash || null, status: previous.status || null, outputs: previous.outputs || [] },
    });
    checkpoint.stages[name] = { ...previous, status: PRODUCTION_STAGE_STATUS.INVALID, invalidatedReason: reason };
    invalidated.push(name);
  }
  return invalidated;
}

export function assertCanonicalStagePrerequisites(checkpoint, targetStage) {
  const index = CANONICAL_PRODUCTION_STAGE_ORDER.indexOf(targetStage);
  if (index < 0) throw new Error(`Unknown canonical production stage: ${targetStage}`);
  const missing = CANONICAL_PRODUCTION_STAGE_ORDER.slice(0, index)
    .filter((name) => checkpoint?.stages?.[name]?.status !== PRODUCTION_STAGE_STATUS.READY);
  if (missing.length) {
    const error = new Error(`PRODUCTION_STAGE_ORDER_INVALID: ${targetStage} requires ${missing.join(', ')}`);
    error.code = 'PRODUCTION_STAGE_ORDER_INVALID';
    error.missingStages = missing;
    throw error;
  }
  return true;
}
