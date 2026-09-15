const fs = require('node:fs');
const path = require('node:path');

const VISUAL_UTILITY = Object.freeze({
  EXACT: 'EXACT_INSTRUCTIONAL',
  CONTEXTUAL: 'CONTEXTUAL_INSTRUCTIONAL',
  DECORATIVE: 'DECORATIVE_RULEBOOK_ART',
  IRRELEVANT: 'IRRELEVANT',
});

function normalizeSemanticToken(token) {
  const normalized = String(token || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (normalized.length > 5 && /(?:er|es)$/.test(normalized)) return normalized.replace(/(?:er|es)$/, '');
  if (normalized.length > 4 && /[es]$/.test(normalized)) return normalized.slice(0, -1);
  return normalized;
}

function normalizedTokens(values) {
  return new Set((Array.isArray(values) ? values : [values])
    .flatMap((value) => String(value || '').split(/[^\p{L}0-9]+/u))
    .map(normalizeSemanticToken)
    .filter((token) => token.length > 2));
}

function overlapScore(required, supplied) {
  const wanted = normalizedTokens(required);
  const found = normalizedTokens(supplied);
  if (!wanted.size) return 1;
  return [...wanted].filter((token) => found.has(token)).length / wanted.size;
}

function visualFile(asset) {
  return asset?.displayPath || asset?.filePath || asset?.renderPath || asset?.sourceImage || null;
}

function evaluateVisualQuality(asset = {}, requirement = {}, display = {}) {
  const file = visualFile(asset);
  const sourceWidth = Number(asset.width || asset.sourceDimensions?.width || 0);
  const sourceHeight = Number(asset.height || asset.sourceDimensions?.height || 0);
  const renderedWidth = Number(display.width || requirement.minimumEffectiveResolution?.width || 0);
  const renderedHeight = Number(display.height || requirement.minimumEffectiveResolution?.height || 0);
  const scaleX = sourceWidth > 0 && renderedWidth > 0 ? renderedWidth / sourceWidth : Infinity;
  const scaleY = sourceHeight > 0 && renderedHeight > 0 ? renderedHeight / sourceHeight : Infinity;
  const effectiveScale = Math.max(scaleX, scaleY);
  const maxPreferred = Number(requirement.minimumEffectiveResolution?.maxScalePreferred || 1.15);
  const maxHard = Number(requirement.minimumEffectiveResolution?.maxScaleHard || 1.35);
  const reviewedDerivative = asset.reviewedDerivative === true || asset.sourceType === 'DETERMINISTIC_VECTOR' || asset.sourceType === 'NATIVE_EMBEDDED';
  const exists = Boolean(file && fs.existsSync(path.resolve(file)));
  const utilityAllowed = ![VISUAL_UTILITY.DECORATIVE, VISUAL_UTILITY.IRRELEVANT].includes(asset.visualUtility);
  const completeness = asset.cropCompleteness === 'complete' || asset.cropCompleteness === true || asset.sourceType === 'DETERMINISTIC_VECTOR';
  const purity = asset.cropPurity === 'clean' || asset.cropPurity === true || asset.sourceType === 'DETERMINISTIC_VECTOR';
  const languageAllowed = !asset.dominantInstructionalLanguage || ['fr', 'fr-CA', 'text-light', 'none'].includes(asset.dominantInstructionalLanguage);
  const hardViolations = [];
  if (!exists) hardViolations.push('missing-file');
  if (!utilityAllowed) hardViolations.push('non-instructional-utility');
  if (!completeness) hardViolations.push('incomplete-crop');
  if (!purity) hardViolations.push('contaminated-crop');
  if (!languageAllowed && requirement.textLanguagePreference !== 'edition-authentic') hardViolations.push('instructional-language-mismatch');
  if (effectiveScale > maxHard && !reviewedDerivative) hardViolations.push('excessive-raster-enlargement');
  if (asset.sourceType === 'THUMBNAIL') hardViolations.push('thumbnail-final-use');
  const warnings = [];
  if (effectiveScale > maxPreferred && effectiveScale <= maxHard) warnings.push('preferred-scale-exceeded');
  const requiredObjectScore = overlapScore(requirement.requiredObjects || [], [...(asset.semanticObjects || []), asset.label, asset.componentName, asset.description]);
  const requiredLabelScore = overlapScore(requirement.requiredLabels || [], asset.visibleLabels || []);
  if (requiredObjectScore < 0.5) hardViolations.push('required-object-mismatch');
  if ((requirement.requiredLabels || []).length && requiredLabelScore < 1) hardViolations.push('required-label-missing');
  return {
    valid: hardViolations.length === 0,
    file: file ? path.resolve(file) : null,
    sourceWidth,
    sourceHeight,
    renderedWidth,
    renderedHeight,
    scaleX: Number.isFinite(scaleX) ? Number(scaleX.toFixed(3)) : null,
    scaleY: Number.isFinite(scaleY) ? Number(scaleY.toFixed(3)) : null,
    effectiveScale: Number.isFinite(effectiveScale) ? Number(effectiveScale.toFixed(3)) : null,
    requiredObjectScore: Number(requiredObjectScore.toFixed(3)),
    requiredLabelScore: Number(requiredLabelScore.toFixed(3)),
    hardViolations,
    warnings,
  };
}

function resolveInstructionalVisual({ atom, assets = [], explicitBindings = {}, display = { width: 900, height: 760 } } = {}) {
  const requirement = atom?.visualRequirement || {};
  const explicitIds = explicitBindings[atom?.id] || [];
  const candidates = assets.filter((asset) => asset && ![VISUAL_UTILITY.DECORATIVE, VISUAL_UTILITY.IRRELEVANT].includes(asset.visualUtility)).map((asset) => {
    const quality = evaluateVisualQuality(asset, requirement, display);
    const explicit = explicitIds.includes(asset.id);
    const objectScore = overlapScore(requirement.requiredObjects || [], [...(asset.semanticObjects || []), asset.label, asset.componentName, asset.description]);
    const relationshipScore = requirement.requiredRelationship && String(asset.relationship || '').toLowerCase().includes(String(requirement.requiredRelationship).toLowerCase()) ? 1 : 0;
    const sourceRank = ({ NATIVE_EMBEDDED: 6, OFFICIAL_HIGH_RES: 5, HIGH_DPI_PAGE_CROP: 4, DETERMINISTIC_COMPOSITE: 3.5, DETERMINISTIC_VECTOR: 3, REVIEWED_UPSCALE: 1 }[asset.sourceType] || 0);
    const score = (explicit ? 100 : 0) + sourceRank * 10 + objectScore * 25 + relationshipScore * 10 + (quality.valid ? 25 : -1000) - quality.warnings.length * 2;
    return { asset, quality, score };
  }).sort((a, b) => b.score - a.score || String(a.asset.id).localeCompare(String(b.asset.id)));
  const selected = candidates.find((candidate) => candidate.quality.valid) || null;
  return {
    atomId: atom?.id || null,
    selectedAsset: selected?.asset || null,
    quality: selected?.quality || null,
    reviewState: selected ? 'accepted' : 'blocked',
    candidates: candidates.map((candidate) => ({ assetId: candidate.asset.id, score: Number(candidate.score.toFixed(3)), valid: candidate.quality.valid, violations: candidate.quality.hardViolations })),
  };
}

function resolveVisualPaneAlignment(scene = {}) {
  const declaredLowerZone = Boolean(scene.visualLowerZonePurpose || scene.beforeAfter || scene.secondaryVisual || scene.visualCaption);
  const requested = scene.visualPaneAlignment || {};
  const vertical = requested.vertical || (declaredLowerZone ? 'TOP' : 'CENTER');
  const horizontal = requested.horizontal || 'CENTER';
  const fit = requested.fit || 'CONTAIN';
  return { horizontal, vertical, fit, declaredLowerZone };
}

function validateVisualCentering({ pane, visual, alignment }) {
  if (!pane || !visual) return { valid: false, offsetRatioX: null, offsetRatioY: null, violations: ['missing-bounds'] };
  if (alignment?.vertical === 'TOP' && alignment.declaredLowerZone) return { valid: true, offsetRatioX: 0, offsetRatioY: 0, violations: [] };
  const paneCenterX = pane.x + pane.width / 2;
  const paneCenterY = pane.y + pane.height / 2;
  const visualCenterX = visual.x + visual.width / 2;
  const visualCenterY = visual.y + visual.height / 2;
  const offsetRatioX = Math.abs(visualCenterX - paneCenterX) / pane.width;
  const offsetRatioY = Math.abs(visualCenterY - paneCenterY) / pane.height;
  const violations = [];
  if (alignment?.horizontal === 'CENTER' && offsetRatioX > 0.04) violations.push('horizontal-center-offset');
  if (alignment?.vertical === 'CENTER' && offsetRatioY > 0.06) violations.push('vertical-center-offset');
  return { valid: violations.length === 0, offsetRatioX: Number(offsetRatioX.toFixed(3)), offsetRatioY: Number(offsetRatioY.toFixed(3)), violations };
}

module.exports = {
  VISUAL_UTILITY,
  evaluateVisualQuality,
  resolveInstructionalVisual,
  resolveVisualPaneAlignment,
  validateVisualCentering,
};
