/**
 * Storyboard visual coverage validator.
 *
 * Classifies each scene's visual readiness and produces operator diagnostics
 * before render begins. Prevents silent rendering of professional tutorial
 * scenes with missing visuals.
 *
 * Coverage classes:
 * - covered: scene has a matched/explicit validated image (confidence >= threshold)
 * - intentionalFallback: scene type allows color/text-only (intro, end_card, transition, summary)
 * - warn: scene can render but has low-confidence or missing preferred visual
 * - blocked: required visual scene lacks a valid image and does not allow fallback
 */

/**
 * Scene types that are allowed to use intentional text/color fallback
 * without being counted as missing visuals.
 */
const FALLBACK_ALLOWED_TYPES = new Set([
  'intro',
  'end_card',
  'transition',
  'summary',
  'title',
  'recap',
]);

/**
 * Scene types that require real image visuals for professional output.
 */
const IMAGE_REQUIRED_TYPES = new Set([
  'setup_step',
  'component',
  'scoring',
  'gameplay',
  'example',
]);

const DEFAULT_CONFIDENCE_THRESHOLD = 0.5;

/**
 * Classify a single scene's visual coverage.
 */
function classifyScene(scene, options = {}) {
  const threshold = options.confidenceThreshold || DEFAULT_CONFIDENCE_THRESHOLD;
  const sceneType = (scene.type || '').toLowerCase();
  const hasExplicitImage = Boolean(scene.imageId || scene.imageRef);
  const confidence = scene.visualMatchConfidence ?? (hasExplicitImage ? 1.0 : 0);
  const hasBackground = Boolean(scene.background?.image);

  // Explicit image or high-confidence match
  if (hasExplicitImage && confidence >= threshold) {
    return {
      sceneId: scene.id,
      classification: 'covered',
      confidence,
      reason: scene.visualMatchReason || 'explicit-image',
      warning: null,
    };
  }

  // Scene has a resolved background image already (from adapter)
  if (hasBackground) {
    return {
      sceneId: scene.id,
      classification: 'covered',
      confidence: confidence || 0.8,
      reason: 'background-image-present',
      warning: null,
    };
  }

  // Fallback-allowed scene types
  if (FALLBACK_ALLOWED_TYPES.has(sceneType)) {
    return {
      sceneId: scene.id,
      classification: 'intentionalFallback',
      confidence: 0,
      reason: `scene-type-allows-fallback:${sceneType}`,
      warning: null,
    };
  }

  // Low-confidence match on a required type
  if (hasExplicitImage && confidence < threshold) {
    return {
      sceneId: scene.id,
      classification: 'warn',
      confidence,
      reason: `low-confidence-match:${scene.visualMatchReason || 'unknown'}`,
      warning: `Scene '${scene.id}': matched image has low confidence (${confidence.toFixed(2)})`,
    };
  }

  // Required type with no image at all
  if (IMAGE_REQUIRED_TYPES.has(sceneType)) {
    return {
      sceneId: scene.id,
      classification: 'blocked',
      confidence: 0,
      reason: 'required-visual-missing',
      warning: `Scene '${scene.id}' (type: ${sceneType}): requires image but none matched`,
    };
  }

  // Unknown type with no image — warn but don't block
  return {
    sceneId: scene.id,
    classification: 'warn',
    confidence: 0,
    reason: 'no-image-unknown-type',
    warning: `Scene '${scene.id}' (type: ${sceneType || 'unknown'}): no image available`,
  };
}

/**
 * Validate visual coverage for all storyboard scenes.
 *
 * @param {Array} scenes - Matched scenes (output of matchScenesToImages or storyboard scenes with image refs)
 * @param {Object} [options] - { confidenceThreshold, strict }
 * @returns {{ status, coverageRatio, coveredCount, fallbackCount, warningCount, blockedCount, scenes, warnings }}
 */
export function validateStoryboardVisualCoverage(scenes = [], options = {}) {
  const perScene = scenes.map((scene) => classifyScene(scene, options));

  const coveredCount = perScene.filter((s) => s.classification === 'covered').length;
  const fallbackCount = perScene.filter((s) => s.classification === 'intentionalFallback').length;
  const warningCount = perScene.filter((s) => s.classification === 'warn').length;
  const blockedCount = perScene.filter((s) => s.classification === 'blocked').length;

  const totalScenes = scenes.length;
  const coverageRatio = totalScenes > 0 ? (coveredCount + fallbackCount) / totalScenes : 1;

  const warnings = perScene
    .filter((s) => s.warning)
    .map((s) => s.warning);

  let status;
  if (blockedCount > 0) {
    status = options.strict ? 'blocked' : 'warn';
  } else if (warningCount > 0) {
    status = 'warn';
  } else {
    status = 'pass';
  }

  return {
    status,
    coverageRatio,
    coveredCount,
    fallbackCount,
    warningCount,
    blockedCount,
    totalScenes,
    scenes: perScene,
    warnings,
  };
}

export {
  classifyScene,
  FALLBACK_ALLOWED_TYPES,
  IMAGE_REQUIRED_TYPES,
  DEFAULT_CONFIDENCE_THRESHOLD,
};
