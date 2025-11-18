// src/ingest/storyboard.js
// Phase E3: Deterministic Storyboard Expansion (contract v1.1.0)
//
// Builds a governed storyboard with intro, setup_step scenes, and end_card,
// using standardized timing, layout, and motion helpers.

const {
  computeTextDuration,
  computeTitleDuration
} = require('./storyboard_timing');

const {
  buildIntroOverlay,
  buildStepOverlay,
  buildComponentVisuals
} = require('./storyboard_layout');

const { applyFadeIn, buildFocusZoom } = require('./storyboard_motion');

/**
 * @typedef {Object} StoryboardOptions
 * @property {number} [width]
 * @property {number} [height]
 * @property {number} [fps]
 */

/**
 * Generate a governed storyboard from an ingestion result.
 *
 * Scenes:
 *  - intro          (always present)
 *  - setup_step[*]  (from ingestion.structure.setupSteps[])
 *  - end_card       (always present)
 *
 * @param {object} ingestion
 * @param {StoryboardOptions} [options]
 * @returns {object} Storyboard matching storyboard_contract_v1.1.0.json
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

  // --- Intro scene ------------------------------------------------------
  const introTitle = `How to play: ${gameName}`;
  const introDuration = computeTitleDuration(introTitle);

  const introOverlay = buildIntroOverlay(introTitle);
  introOverlay.endSec = introDuration;

  const introSceneId = 'scene-intro-0';

  const introScene = {
    id: introSceneId,
    index: sceneIndex,
    segmentId: 'intro-0',
    type: 'intro',
    prevSceneId: null,
    nextSceneId: null, // filled later
    durationSec: introDuration,
    visuals: [],
    overlays: [introOverlay]
  };

  scenes.push(introScene);
  sceneIndex += 1;

  // --- Setup_step scenes ------------------------------------------------
  const setupSteps = Array.isArray(ingestion.structure?.setupSteps)
    ? ingestion.structure.setupSteps
    : [];

  for (const step of setupSteps) {
    const stepId = step.id || `setup-${sceneIndex}`;
    const text = step.text || '';
    const componentRefs = Array.isArray(step.componentRefs) ? step.componentRefs : [];

    const durationSec = computeTextDuration(text);

    const overlays = [buildStepOverlay(stepId, text, durationSec)];

    const visualsBase = buildComponentVisuals(componentRefs).map((v) =>
      applyFadeIn(v, 0.5)
    );

    const scene = {
      id: `scene-setup-${stepId}`,
      index: sceneIndex,
      segmentId: stepId,
      type: 'setup_step',
      prevSceneId: null, // filled later
      nextSceneId: null, // filled later
      durationSec,
      visuals: visualsBase,
      overlays
    };

    scenes.push(scene);
    sceneIndex += 1;
  }

  // --- End card scene ---------------------------------------------------
  const endTitle = 'You’re ready to play!';
  const endDuration = computeTitleDuration(endTitle);
  const endOverlay = buildIntroOverlay(endTitle);
  endOverlay.id = 'overlay-end-title';
  endOverlay.endSec = endDuration;

  const endSceneId = `scene-end-card-${sceneIndex}`;
  const endScene = {
    id: endSceneId,
    index: sceneIndex,
    segmentId: 'end-card-0',
    type: 'end_card',
    prevSceneId: null, // filled later
    nextSceneId: null,
    durationSec: endDuration,
    visuals: [],
    overlays: [endOverlay]
  };

  scenes.push(endScene);

  // --- Scene linking (prev/next) ---------------------------------------
  for (let i = 0; i < scenes.length; i += 1) {
    const scene = scenes[i];
    scene.prevSceneId = i === 0 ? null : scenes[i - 1].id;
    scene.nextSceneId = i === scenes.length - 1 ? null : scenes[i + 1].id;
  }

  // OPTIONAL: Add a focus_zoom motion for intro overlay (non-critical)
  const firstScene = scenes[0];
  if (firstScene && firstScene.overlays && firstScene.overlays[0]) {
    const focus = buildFocusZoom(0.5, 0.5, Math.min(2, firstScene.durationSec));
    // Not attached to a visual asset, but render side can choose to use it
    // or we can leave it as soft metadata later. For now, we ignore it
    // to keep contract simple.
    void focus;
  }

  const storyboard = {
    storyboardContractVersion: '1.1.0',
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
  generateStoryboardFromIngestion
};
