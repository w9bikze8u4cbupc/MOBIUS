'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { deriveEvidenceBoundObjectCrop } = require('./objectAwareCrop.cjs');

function evidenceKey(row = {}) {
  return JSON.stringify([row.contract, row.assetId, row.imageSha256, row.sceneId || null,
    row.requiredObject, row.visualRole, row.evidencePacketHash || null, row.derivedFrom?.parentEvidenceHash || null]);
}

function mergeEvidence(rows = []) {
  const unique = new Map();
  for (const row of rows) unique.set(evidenceKey(row), row);
  return [...unique.values()];
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
    const crop = await deriveEvidenceBoundObjectCrop({
      parentAsset: parent,
      componentEvidence,
      linkedEvidence,
      outputDir: path.resolve(outputDir, 'evidence-bound-crops'),
    });
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

module.exports = { appendEvidenceBoundCrops, evidenceKey, mergeEvidence };
