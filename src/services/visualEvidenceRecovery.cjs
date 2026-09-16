const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const VISUAL_EVIDENCE_RECOVERY_CONTRACT = 'mobius-recoverable-visual-evidence-v1';

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function validSha(value) {
  return /^[a-f0-9]{64}$/i.test(String(value || ''));
}

function sourcePdfSha256(asset = {}) {
  return asset.sourcePdfSha256 || asset.provenance?.sourcePdfSha256 || asset.provenance?.sourceRegion?.sourcePdfSha256 || null;
}

function sourceImageSha256(asset = {}) {
  return asset.contentHash || asset.imageSha256 || asset.provenance?.sourceRegion?.sha256 || asset.nativeSourceEvidence?.assetSha256 || null;
}

function hasRecoverableEvidence(asset = {}) {
  return (asset.objectVisualEvidence || []).some((evidence) => evidence?.present === true
    && evidence.complete === true && evidence.isolated === true
    && ['COMPONENT', 'TRACK'].includes(evidence.visualRole));
}

function reportAssets(report = {}) {
  const seen = new Set();
  const assets = [];
  for (const scene of report.scenes || []) {
    for (const asset of scene?.planValidation?.selectedAssets || []) {
      const key = `${asset?.id || ''}:${sourceImageSha256(asset) || ''}`;
      if (!asset?.id || seen.has(key) || !hasRecoverableEvidence(asset)) continue;
      seen.add(key);
      assets.push(asset);
    }
  }
  return assets;
}

function buildRecovery({ projectId, sourceSha256, inputPath }) {
  if (!projectId || !validSha(sourceSha256)) throw new Error('RECOVERABLE_VISUAL_EVIDENCE_IDENTITY_INVALID');
  const absoluteInput = path.resolve(inputPath || '');
  const report = JSON.parse(fs.readFileSync(absoluteInput, 'utf8'));
  const assets = reportAssets(report).filter((asset) => sourcePdfSha256(asset) === sourceSha256
    && validSha(sourceImageSha256(asset)));
  if (!assets.length) throw new Error('RECOVERABLE_VISUAL_EVIDENCE_NOT_FOUND');
  return {
    contract: VISUAL_EVIDENCE_RECOVERY_CONTRACT,
    projectId,
    sourceSha256,
    generatedAt: new Date().toISOString(),
    reports: [{
      path: absoluteInput,
      sha256: sha256File(absoluteInput),
      assets,
    }],
  };
}

function writeRecovery({ outputPath, recovery }) {
  const target = path.resolve(outputPath || '');
  if (!target || !recovery?.contract) throw new Error('RECOVERABLE_VISUAL_EVIDENCE_OUTPUT_INVALID');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(recovery, null, 2));
  fs.renameSync(temporary, target);
  return target;
}

function loadRecovery({ recoveryPath, projectId, sourceSha256 }) {
  try {
    const recovery = JSON.parse(fs.readFileSync(path.resolve(recoveryPath), 'utf8'));
    if (recovery.contract !== VISUAL_EVIDENCE_RECOVERY_CONTRACT || recovery.projectId !== projectId
      || recovery.sourceSha256 !== sourceSha256 || !Array.isArray(recovery.reports)) return [];
    return recovery.reports.flatMap((report) => report.assets || []).filter((asset) => sourcePdfSha256(asset) === sourceSha256
      && validSha(sourceImageSha256(asset)) && hasRecoverableEvidence(asset));
  } catch {
    return [];
  }
}

module.exports = {
  VISUAL_EVIDENCE_RECOVERY_CONTRACT,
  buildRecovery,
  loadRecovery,
  reportAssets,
  sourceImageSha256,
  sourcePdfSha256,
  writeRecovery,
};
