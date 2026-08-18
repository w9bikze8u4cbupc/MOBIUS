const { loadIngestionContract } = require('../ingestion/contract');

const contract = loadIngestionContract();

function validateIngestionManifest(manifest) {
  const errors = [];
  const isNonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0;

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
  } else if (manifest.outline.some((entry) => !isNonEmptyString(entry?.id)
    || !isNonEmptyString(entry?.title)
    || !isNonEmptyString(entry?.slug)
    || !Number.isInteger(entry?.page) || entry.page < 1)) {
    errors.push('Outline entries must include id, title, slug, and page');
  }

  if (!Array.isArray(manifest.components) || manifest.components.length !== manifest.outline?.length) {
    errors.push('Component list must align 1:1 with outline');
  } else if (manifest.components.some((component) => !isNonEmptyString(component?.id)
    || !isNonEmptyString(component?.sourceHeading)
    || !isNonEmptyString(component?.type)
    || !isNonEmptyString(component?.hash)
    || !Number.isInteger(component?.pageStart)
    || !Number.isInteger(component?.pageEnd))) {
    errors.push('Component entries are incomplete');
  }

  if (!manifest.assets || !Array.isArray(manifest.assets.pages) || !manifest.assets.pages.length) {
    errors.push('Assets.pages missing');
  } else if (manifest.assets.pages.some((page) => !Number.isInteger(page?.page) || page.page < 1 || !isNonEmptyString(page?.hash))) {
    errors.push('Page assets are incomplete');
  }

  if (!manifest.assets || !Array.isArray(manifest.assets.components)
    || manifest.assets.components.length !== manifest.components?.length) {
    errors.push('Assets.components must align 1:1 with components');
  } else if (manifest.assets.components.some((component) => !isNonEmptyString(component?.id) || !isNonEmptyString(component?.hash))) {
    errors.push('Component assets are incomplete');
  }

  if (manifest.ocrUsage?.length > contract.ocr.maxFallbacksPerDocument) {
    errors.push('OCR fallback count exceeds contract');
  }

  return { valid: errors.length === 0, errors };
}

module.exports = {
  validateIngestionManifest
};
