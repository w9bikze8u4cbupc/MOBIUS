const { loadIngestionContract } = require('../ingestion/contract');

const contract = loadIngestionContract();

function validateIngestionManifest(manifest) {
  const errors = [];

  if (!manifest) {
    return { valid: false, errors: ['Manifest missing'] };
  }

  if (manifest.version !== contract.version) {
    errors.push(`Contract version mismatch (expected ${contract.version}, received ${manifest.version})`);
  }

  if (!manifest.document) {
    errors.push('Document metadata missing');
  } else {
    for (const field of contract.metadata.requiredFields) {
      if (!manifest.document[field]) {
        errors.push(`Missing document field ${field}`);
      }
    }
  }

  if (!Array.isArray(manifest.outline) || !manifest.outline.length) {
    errors.push('Outline missing');
  }

  if (!Array.isArray(manifest.components) || manifest.components.length !== manifest.outline.length) {
    errors.push('Component list must align 1:1 with outline');
  }

  if (!manifest.assets || !Array.isArray(manifest.assets.pages)) {
    errors.push('Assets.pages missing');
  }

  if (manifest.ocrUsage?.length > contract.ocr.maxFallbacksPerDocument) {
    errors.push('OCR fallback count exceeds contract');
  }

  return { valid: errors.length === 0, errors };
}

module.exports = {
  validateIngestionManifest
};
