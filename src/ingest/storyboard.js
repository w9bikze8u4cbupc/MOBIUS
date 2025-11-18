// src/ingest/storyboard.js
// Phase E2: Governed Storyboard Generator
//
// This module converts an ingestion result (Phase E1) plus minimal
// configuration into a storyboard JSON object that conforms to
// docs/spec/storyboard_contract.json.
//
// Assumptions:
// - Ingestion result matches ingestion_contract.json (E1).
// - scriptSegments are derived upstream (or we fall back to simple
//   "pseudo segments" aligned with setup steps + phases).

/**
 * @typedef {Object} StoryboardOptions
 * @property {number} [width]  - Render width (default: 1920)
 * @property {number} [height] - Render height (default: 1080)
 * @property {number} [fps]    - Frames per second (default: 30)
 * @property {number} [baseStepDuration] - Base seconds per step (default: 4)
 * @property {number} [perWordDuration]  - Additional seconds per word (default: 0.15)
 */

/**
 * Round a number to the nearest multiple of `increment`.
 * @param {number} value
 * @param {number} increment
 * @returns {number}
 */
function roundToIncrement(value, increment) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value / increment) * increment;
}

/**
 * Compute a deterministic scene duration from text length.
 * Applies clamping and rounding to a governed increment (1/6s).
 * @param {string} text
 * @param {StoryboardOptions} opts
 * @returns {number}
 */
function computeSceneDuration(text, opts = {}) {
  const base = opts.baseStepDuration ?? 4;
  const perWord = opts.perWordDuration ?? 0.15;
  const increment = 1 / 6; // ~0.1667s

  const words = typeof text === 'string' && text.trim().length > 0
    ? text.trim().split(/\s+/).length
    : 0;

  const raw = base + perWord * words;
  const clamped = Math.max(2, Math.min(15, raw));
  return roundToIncrement(clamped, increment);
}

/**
 * Simple component → visual placement strategy using normalized coordinates.
 * We place up to 3 component visuals in a row at the bottom of the frame.
 *
 * @param {string[]} componentIds
 * @returns {Array<{ id: string, assetId: string, placement: {x:number,y:number,width:number,height:number}, layer: number, motion?: object }>}
 */
function buildComponentVisuals(componentIds) {
  if (!Array.isArray(componentIds) || componentIds.length === 0) {
    return [];
  }

  const visuals = [];
  const maxPerRow = 3;
  const rows = Math.ceil(componentIds.length / maxPerRow);
  const rowHeight = 0.2;
  const totalHeight = rowHeight * rows;
  const bottomY = 1 - totalHeight - 0.05; // 5% bottom margin

  let index = 0;
  for (let row = 0; row < rows; row += 1) {
    const y = bottomY + row * rowHeight;
    const rowCount = Math.min(maxPerRow, componentIds.length - index);
    const width = 0.8 / rowCount; // leave 10% left/right margin
    const xStart = 0.1;

    for (let col = 0; col < rowCount; col += 1) {
      const rawComponent = componentIds[index];
      const componentId = typeof rawComponent === 'string' ? rawComponent : rawComponent?.id ?? `component-${index}`;
      const x = xStart + col * width;
      const id = `visual-component-${componentId}`;

      visuals.push({
        id,
        assetId: componentId, // assetIds are expected to match component IDs or mapped upstream
        placement: {
          x,
          y,
          width: width * 0.9,
          height: rowHeight * 0.8
        },
        layer: 10, // above board/base visuals
        motion: {
          type: 'fade',
          startSec: 0,
          endSec: 0.5,
          easing: 'easeInOutCubic',
          from: 0,
          to: 1
        }
      });

      index += 1;
    }
  }

  return visuals;
}

/**
 * Build overlays for a given setup step (or generic scene) as a simple text box.
 *
 * @param {string} stepId
 * @param {string} text
 * @param {number} durationSec
 * @returns {Array<{ id: string, text: string, placement: {x:number,y:number,width:number,height:number}, startSec: number, endSec: number }>}
 */
function buildTextOverlays(stepId, text, durationSec) {
  const margin = 0.08; // 8% margin
  const height = 0.25; // overlay box height

  const overlay = {
    id: `overlay-${stepId}`,
    text: text || '',
    placement: {
      x: margin,
      y: margin,
      width: 1 - 2 * margin,
      height
    },
    startSec: 0,
    endSec: durationSec
  };

  return [overlay];
}

/**
 * Generate storyboard scenes from an ingestion result.
 *
 * For now, we focus on setup steps and treat each as a "setup" scene.
 * Phases/turns can be added as additional scenes later.
 *
 * @param {object} ingestion IngestionResult matching ingestion_contract.json
 * @param {StoryboardOptions} [options]
 * @returns {object} Storyboard matching storyboard_contract.json
 */
function generateStoryboardFromIngestion(ingestion, options = {}) {
  if (!ingestion || typeof ingestion !== 'object') {
    throw new Error('generateStoryboardFromIngestion: ingestion payload is required');
  }

  const width = options.width ?? 1920;
  const height = options.height ?? 1080;
  const fps = options.fps ?? 30;

  const gameSlug = ingestion.game?.slug || 'unknown-game';
  const gameName = ingestion.game?.name || 'Unknown Game';

  const scenes = [];
  let sceneIndex = 0;

  const setupSteps = Array.isArray(ingestion.structure?.setupSteps)
    ? ingestion.structure.setupSteps
    : [];

  for (const step of setupSteps) {
    const stepId = step.id || `setup-${sceneIndex}`;
    const text = step.text || '';
    const componentRefs = Array.isArray(step.componentRefs) ? step.componentRefs : [];

    const durationSec = computeSceneDuration(text, options);

    const scene = {
      id: `scene-setup-${stepId}`,
      index: sceneIndex,
      segmentId: stepId, // in a fuller system this would map to ScriptSegment.id
      type: 'setup',
      durationSec,
      visuals: buildComponentVisuals(componentRefs),
      overlays: buildTextOverlays(stepId, text, durationSec)
    };

    scenes.push(scene);
    sceneIndex += 1;
  }

  // Fallback: if no setup steps, create a single intro scene with generic text.
  if (scenes.length === 0) {
    const introText = 'Welcome to this MOBIUS tutorial.';
    const durationSec = computeSceneDuration(introText, options);

    scenes.push({
      id: 'scene-intro-0',
      index: 0,
      segmentId: 'intro-0',
      type: 'intro',
      durationSec,
      visuals: [],
      overlays: buildTextOverlays('intro-0', introText, durationSec)
    });
  }

  const storyboard = {
    storyboardContractVersion: '1.0.0',
    game: {
      slug: gameSlug,
      name: gameName
    },
    resolution: {
      width,
      height,
      fps
    },
    scenes
  };

  return storyboard;
}

module.exports = {
  generateStoryboardFromIngestion,
  // Exporting helpers aids future unit tests/extensions
  buildComponentVisuals,
  buildTextOverlays,
  computeSceneDuration,
  roundToIncrement
};
