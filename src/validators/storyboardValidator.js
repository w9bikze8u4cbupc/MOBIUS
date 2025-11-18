const fs = require('fs');
const path = require('path');

const contract = JSON.parse(fs.readFileSync(path.join(__dirname, '../../docs/spec/storyboard_contract.json'), 'utf-8'));

function validateStoryboard(manifest) {
  const errors = [];

  if (!manifest) {
    return { valid: false, errors: ['Storyboard missing'] };
  }

  if (manifest.version !== contract.version) {
    errors.push(`Storyboard contract mismatch (${manifest.version} != ${contract.version})`);
  }

  if (!Array.isArray(manifest.scenes) || !manifest.scenes.length) {
    errors.push('Scenes missing');
  } else {
    manifest.scenes.forEach((scene, index) => {
      for (const field of contract.scenes.requiredFields) {
        if (scene[field] === undefined) {
          errors.push(`Scene ${index} missing ${field}`);
        }
      }

      if (scene.durationMs % contract.timing.frameQuantumMs !== 0) {
        errors.push(`Scene ${scene.id} duration not aligned to ${contract.timing.frameQuantumMs}ms`);
      }

      if (!contract.motions.allowed.includes(scene.motion?.type)) {
        errors.push(`Scene ${scene.id} motion ${scene.motion?.type} not governed`);
      }

      if (contract.overlays.requireHashes) {
        (scene.overlays ?? []).forEach((overlay) => {
          if (!overlay.textHash) {
            errors.push(`Overlay ${overlay.id} missing hash`);
          }
        });
      }

      if (contract.assets.requiredHashes) {
        (scene.assets ?? []).forEach((asset) => {
          if (!asset.hash) {
            errors.push(`Scene ${scene.id} asset missing hash`);
          }
        });
      }
    });
  }

  return { valid: errors.length === 0, errors };
}

module.exports = {
  validateStoryboard
};
