const fs = require('fs');
const path = require('path');

const CONTRACT_FILES = {
  '1.0.0': path.join(__dirname, '../../docs/spec/storyboard_contract.json'),
  '1.1.0': path.join(__dirname, '../../docs/spec/storyboard_contract_v1.1.0.json')
};

function loadContract({ contractVersion, contractPath }) {
  if (contractPath) {
    const resolved = path.resolve(contractPath);
    const contract = JSON.parse(fs.readFileSync(resolved, 'utf-8'));
    return {
      version: contractVersion || contract.version,
      contract
    };
  }

  const version = contractVersion && CONTRACT_FILES[contractVersion] ? contractVersion : '1.1.0';
  const filePath = CONTRACT_FILES[version];
  if (!filePath) {
    throw new Error(`Unsupported storyboard contract version: ${contractVersion}`);
  }

  return {
    version,
    contract: JSON.parse(fs.readFileSync(filePath, 'utf-8'))
  };
}

function createBucket(name) {
  return { name, valid: true, errors: [] };
}

function pushError(bucket, message) {
  bucket.valid = false;
  bucket.errors.push(message);
}

function isSnapped(value, quantum) {
  if (!Number.isFinite(value)) return false;
  if (!Number.isFinite(quantum) || quantum <= 0) return true;
  const snapped = Math.round(value / quantum) * quantum;
  return Math.abs(snapped - value) < 1e-4;
}

function validateSceneStructure(manifest, contract, bucket) {
  const scenes = Array.isArray(manifest.scenes) ? manifest.scenes : [];
  if (!scenes.length) {
    pushError(bucket, 'Scenes missing');
    return;
  }

  const sceneRules = contract.sceneTypes || {};
  const requireLinks = Boolean(contract.linking?.requirePrevNext);
  const legacyRequired = contract.scenes?.requiredFields || [];
  const ids = new Set();

  scenes.forEach((scene, index) => {
    legacyRequired.forEach((field) => {
      if (scene[field] === undefined) {
        pushError(bucket, `Scene ${scene.id || index} missing ${field}`);
      }
    });

    if (!scene.id) {
      pushError(bucket, `Scene index ${index} missing id`);
    } else if (ids.has(scene.id)) {
      pushError(bucket, `Scene id ${scene.id} duplicated`);
    } else {
      ids.add(scene.id);
    }

    if (typeof scene.index !== 'number' || scene.index !== index) {
      pushError(bucket, `Scene ${scene.id || index} index mismatch (${scene.index} != ${index})`);
    }

    if (scene.type && !sceneRules[scene.type] && Object.keys(sceneRules).length) {
      pushError(bucket, `Scene ${scene.id} type ${scene.type} not governed`);
    }

    const typeRule = sceneRules[scene.type];
    if (typeRule) {
      if (typeof scene.durationSec === 'number') {
        if (scene.durationSec < typeRule.minDurationSec || scene.durationSec > typeRule.maxDurationSec) {
          pushError(bucket, `Scene ${scene.id} duration ${scene.durationSec}s outside governed range`);
        }
      }
      (typeRule.requiredOverlays || []).forEach((role) => {
        const hasRole = (scene.overlays || []).some((overlay) => overlay.role === role);
        if (!hasRole) {
          pushError(bucket, `Scene ${scene.id} missing overlay role ${role}`);
        }
      });
      (typeRule.requiredStructure || []).forEach((field) => {
        if (scene[field] === undefined) {
          pushError(bucket, `Scene ${scene.id} missing required ${field}`);
        }
      });
    }

    if (requireLinks) {
      const expectedPrev = index === 0 ? null : scenes[index - 1].id;
      const expectedNext = index === scenes.length - 1 ? null : scenes[index + 1].id;
      if ((scene.prevSceneId ?? null) !== expectedPrev) {
        pushError(bucket, `Scene ${scene.id} prevSceneId mismatch`);
      }
      if ((scene.nextSceneId ?? null) !== expectedNext) {
        pushError(bucket, `Scene ${scene.id} nextSceneId mismatch`);
      }
    }
  });
}

function validateLayout(manifest, contract, bucket) {
  const safeArea = contract.layout?.safeArea;
  const layerValues = contract.layout?.layers ? new Set(Object.values(contract.layout.layers)) : null;

  (manifest.scenes || []).forEach((scene) => {
    (scene.visuals || []).forEach((visual) => {
      if (layerValues && !layerValues.has(visual.layer)) {
        pushError(bucket, `Visual ${visual.id || scene.id} layer ${visual.layer} not governed`);
      }
      if (visual.placement) {
        const { x, y, width, height } = visual.placement;
        if ([x, y, width, height].some((v) => typeof v !== 'number')) {
          pushError(bucket, `Visual ${visual.id || scene.id} has invalid placement`);
        }
        if (visual.placement && (visual.placement.x < 0 || visual.placement.y < 0 || visual.placement.x + visual.placement.width > 1 || visual.placement.y + visual.placement.height > 1)) {
          pushError(bucket, `Visual ${visual.id || scene.id} placement leaves normalized bounds`);
        }
      }
    });

    (scene.overlays || []).forEach((overlay) => {
      if (!overlay.placement) {
        pushError(bucket, `Overlay ${overlay.id || scene.id} missing placement`);
        return;
      }
      const { x, y, width, height } = overlay.placement;
      if ([x, y, width, height].some((v) => typeof v !== 'number')) {
        pushError(bucket, `Overlay ${overlay.id || scene.id} placement invalid`);
        return;
      }
      if (safeArea) {
        const withinX = x >= safeArea.left && x + width <= safeArea.right;
        const withinY = y >= safeArea.top && y + height <= safeArea.bottom;
        if (!withinX || !withinY) {
          pushError(bucket, `Overlay ${overlay.id || scene.id} violates safe area`);
        }
      }
    });
  });
}

function validateMotion(manifest, contract, bucket) {
  const allowedPrimitives = new Set(contract.motion?.primitives || []);
  const allowedMacros = new Set(contract.motion?.macros || []);
  const allowedEasing = new Set(contract.motion?.easing || []);

  (manifest.scenes || []).forEach((scene) => {
    (scene.visuals || []).forEach((visual) => {
      (visual.motions || []).forEach((motion) => {
        if (allowedPrimitives.size && !allowedPrimitives.has(motion.type)) {
          pushError(bucket, `Motion ${motion.type} not allowed (scene ${scene.id})`);
        }
        if (motion.macro && allowedMacros.size && !allowedMacros.has(motion.macro)) {
          pushError(bucket, `Motion macro ${motion.macro} not allowed (scene ${scene.id})`);
        }
        if (motion.easing && allowedEasing.size && !allowedEasing.has(motion.easing)) {
          pushError(bucket, `Motion easing ${motion.easing} not governed (scene ${scene.id})`);
        }
      });
    });
  });
}

function validateTiming(manifest, contract, bucket) {
  const quantum = contract.frameQuantizationSec || (contract.timing?.frameQuantumMs ? contract.timing.frameQuantumMs / 1000 : null);

  (manifest.scenes || []).forEach((scene) => {
    if (!isSnapped(scene.durationSec, quantum)) {
      pushError(bucket, `Scene ${scene.id} duration not snapped to ${quantum || 'contract quantum'}`);
    }

    const visuals = scene.visuals || [];
    visuals.forEach((visual) => {
      (visual.motions || []).forEach((motion) => {
        if (!isSnapped(motion.startSec, quantum) || !isSnapped(motion.endSec, quantum)) {
          pushError(bucket, `Motion timing not snapped in scene ${scene.id}`);
        }
        if (motion.startSec > motion.endSec) {
          pushError(bucket, `Motion start > end in scene ${scene.id}`);
        }
      });
    });

    (scene.overlays || []).forEach((overlay) => {
      if (overlay.startSec < 0 || overlay.endSec > scene.durationSec) {
        pushError(bucket, `Overlay ${overlay.id || scene.id} not contained within scene duration`);
      }
      if (!isSnapped(overlay.startSec, quantum) || !isSnapped(overlay.endSec, quantum)) {
        pushError(bucket, `Overlay ${overlay.id || scene.id} timing not snapped`);
      }
    });
  });
}

function validateStoryboard(manifest, options = {}) {
  const summary = {
    valid: true,
    errors: [],
    reports: {
      scenes: createBucket('scenes'),
      motion: createBucket('motion'),
      layout: createBucket('layout'),
      timing: createBucket('timing')
    }
  };

  if (!manifest) {
    summary.valid = false;
    summary.errors.push('Storyboard missing');
    return summary;
  }

  const desiredVersion = options.contractVersion || manifest.storyboardContractVersion || manifest.version;
  const { contract } = loadContract({ contractVersion: desiredVersion, contractPath: options.contractPath });
  const manifestVersion = manifest.storyboardContractVersion || manifest.version;
  if (manifestVersion && contract.version && manifestVersion !== contract.version) {
    summary.errors.push(`Storyboard contract mismatch (${manifestVersion} != ${contract.version})`);
  }

  try {
    validateSceneStructure(manifest, contract, summary.reports.scenes);
    validateLayout(manifest, contract, summary.reports.layout);
    validateMotion(manifest, contract, summary.reports.motion);
    validateTiming(manifest, contract, summary.reports.timing);
  } catch (error) {
    summary.errors.push(error.message);
    summary.valid = false;
    return summary;
  }

  summary.valid = summary.errors.length === 0 && Object.values(summary.reports).every((bucket) => bucket.valid);
  return summary;
}

module.exports = {
  validateStoryboard
};
