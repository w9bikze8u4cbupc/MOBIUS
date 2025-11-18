const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const contract = JSON.parse(fs.readFileSync(path.join(__dirname, '../../docs/spec/storyboard_contract.json'), 'utf-8'));

function roundDuration(value) {
  const quantum = contract.timing.frameQuantumMs;
  return Math.round(value / quantum) * quantum;
}

function hash(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function buildMotionPrimitive(index) {
  const motionType = contract.motions.allowed[index % contract.motions.allowed.length];
  return {
    type: motionType,
    durationMs: roundDuration(contract.timing.defaultMotionDurationMs),
    easing: contract.motions.defaults.easing
  };
}

function generateStoryboard(ingestionManifest, options = {}) {
  if (!ingestionManifest || !Array.isArray(ingestionManifest.outline)) {
    throw new Error('STORYBOARD_INVALID_INGESTION');
  }

  const scenes = ingestionManifest.outline.map((entry, index) => {
    const duration = roundDuration(options.sceneDurationMs ?? contract.timing.defaultSceneDurationMs);
    const motion = buildMotionPrimitive(index);
    const assets = [
      {
        sourceId: entry.id,
        hash: hash(entry.title),
        type: 'text'
      }
    ];

    const overlays = [];
    if (options.includeOverlayHashes) {
      overlays.push({
        id: `overlay-${entry.slug}`,
        textHash: hash(entry.title.toLowerCase()),
        bbox: { x: 0.1, y: 0.1, width: 0.8, height: 0.2 },
        zIndex: 1
      });
    }

    return {
      id: `${contract.scenes.idPrefix}${index + 1}`,
      sourceId: entry.id,
      durationMs: duration,
      motion,
      overlays,
      assets
    };
  });

  const manifest = {
    version: contract.version,
    sourceDocument: ingestionManifest.document.id,
    scenes,
    hashManifest: {
      storyboard: hash(JSON.stringify(scenes))
    }
  };

  return manifest;
}

function writeStoryboard(manifest, outPath) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2));
}

module.exports = {
  generateStoryboard,
  writeStoryboard
};
