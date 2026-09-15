'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { deriveEvidenceBoundObjectCrop } = require('./objectAwareCrop.cjs');

const EVIDENCE_BOUND_CROP_DERIVATION_CONTRACT = 'mobius-evidence-bound-crop-derivation-v1';

function evidenceKey(row = {}) {
  return JSON.stringify([row.contract, row.assetId, row.imageSha256, row.sceneId || null,
    row.requiredObject, row.visualRole, row.evidencePacketHash || null, row.derivedFrom?.parentEvidenceHash || null]);
}

function mergeEvidence(rows = []) {
  const unique = new Map();
  for (const row of rows) unique.set(evidenceKey(row), row);
  return [...unique.values()];
}

function derivationFailureKey(row = {}) {
  return JSON.stringify([
    row.contract,
    row.assetId,
    row.imageSha256,
    row.sceneId || null,
    row.requiredObject || null,
    row.evidencePacketHash || null,
    row.reasonCode || null,
  ]);
}

function mergeDerivationFailures(rows = []) {
  const unique = new Map();
  for (const row of rows) unique.set(derivationFailureKey(row), row);
  return [...unique.values()];
}

// A measured object that touches the edge of its parent pixels cannot gain the
// required margin by cropping. This is a candidate-level rejection, not a
// reason to discard every other measured asset or fail a production run.
function expectedDerivationFailure(error) {
  const message = String(error?.message || error || '');
  if (!message.startsWith('Measured localization clipped:')) return null;
  const reasonCode = message.includes('intended-object-touches-crop-edge:')
    ? 'OBJECT_TOUCHES_PARENT_CROP_EDGE'
    : 'MEASURED_OBJECT_CROP_CLIPPED';
  return { reasonCode, message };
}

function cropDerivationFailure({ parent, componentEvidence, scene, failure }) {
  return {
    contract: EVIDENCE_BOUND_CROP_DERIVATION_CONTRACT,
    method: 'deterministic-evidence-bound-crop',
    status: 'REJECTED',
    assetId: parent.id || componentEvidence.assetId || null,
    imageSha256: componentEvidence.imageSha256 || null,
    sceneId: scene.scene_id || null,
    requiredObject: componentEvidence.requiredObject || null,
    evidencePacketHash: componentEvidence.evidencePacketHash || null,
    reasonCode: failure.reasonCode,
    reason: failure.message,
    parentAssetId: parent.id || componentEvidence.assetId || null,
    provenance: {
      sourcePage: parent.source_page || parent.sourcePage || null,
      sourcePdfSha256: parent.sourcePdfSha256 || null,
      componentEvidenceHash: evidenceKey(componentEvidence),
    },
  };
}

// A localized crop can inherit a pixel verdict only from its exact parent
// pixels, and only after the matcher has measured a complete isolated object.
// This service never invokes a provider and never treats a generic page crop as
// a proved component.
async function appendEvidenceBoundCrops({ semantic = {}, visualManifestPath, outputDir }) {
  const manifest = JSON.parse(fs.readFileSync(visualManifestPath, 'utf8'));
  const parents = new Map((manifest.images || []).map((asset) => [asset.id, asset]));
  const output = new Map((manifest.images || []).map((asset) => [asset.id, asset]));
  const requests = new Map();
  for (const scene of semantic.scenes || []) {
    for (const candidate of scene.candidates || []) {
      if (candidate.status !== 'MEASURED') continue;
      for (const row of candidate.objects || []) {
        if (row.visualRole !== 'COMPONENT' || row.present !== true || row.complete !== true || row.isolated !== true
          || Number(row.confidence) < 0.9 || !Array.isArray(row.bbox) || row.bbox.length !== 4) continue;
        const parent = parents.get(candidate.asset_id);
        if (!parent) continue;
        const key = evidenceKey({ ...row, sceneId: scene.scene_id });
        requests.set(key, { parent, componentEvidence: { ...row, sceneId: scene.scene_id }, scene });
      }
    }
  }
  for (const { parent, componentEvidence, scene } of requests.values()) {
    const linkedEvidence = (scene.candidates || [])
      .filter((candidate) => candidate.status === 'MEASURED' && candidate.asset_id === componentEvidence.assetId)
      .flatMap((candidate) => candidate.objects || [])
      .filter((row) => row.requiredObject === componentEvidence.requiredObject && row.visualRole === 'TRACK')
      .map((row) => ({ ...row, sceneId: scene.scene_id }));
    let crop;
    try {
      crop = await deriveEvidenceBoundObjectCrop({
        parentAsset: parent,
        componentEvidence,
        linkedEvidence,
        outputDir: path.resolve(outputDir, 'evidence-bound-crops'),
      });
    } catch (error) {
      const failure = expectedDerivationFailure(error);
      // Stale SHA/path, raster, and replay errors remain failures of the
      // source pipeline. Only an explicit measured-boundary rejection is
      // safely representable as a candidate-level Cockpit diagnostic.
      if (!failure) throw error;
      const existing = output.get(parent.id) || parent;
      output.set(parent.id, {
        ...existing,
        objectAnalysisAttempts: mergeDerivationFailures([
          ...(existing.objectAnalysisAttempts || []),
          cropDerivationFailure({ parent, componentEvidence, scene, failure }),
        ]),
      });
      continue;
    }
    const existing = output.get(crop.id) || {};
    output.set(crop.id, {
      ...existing,
      ...crop,
      objectVisualEvidence: mergeEvidence([...(existing.objectVisualEvidence || []), ...(crop.objectVisualEvidence || [])]),
    });
  }
  if (output.size === (manifest.images || []).length) return visualManifestPath;
  const target = path.resolve(outputDir, 'source-visual-manifest.json');
  fs.writeFileSync(target, `${JSON.stringify({ ...manifest, images: [...output.values()] }, null, 2)}\n`, 'utf8');
  return target;
}

module.exports = {
  EVIDENCE_BOUND_CROP_DERIVATION_CONTRACT,
  appendEvidenceBoundCrops,
  cropDerivationFailure,
  derivationFailureKey,
  evidenceKey,
  expectedDerivationFailure,
  mergeDerivationFailures,
  mergeEvidence,
};
