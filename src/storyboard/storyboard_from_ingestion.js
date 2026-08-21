// This module consumes contract-driven ingestion output to build governed
// storyboard scenes. It is intentionally separate from the ingestion pipeline
// and lives under the storyboard namespace to avoid namespace confusion.

const {
  computeTextDuration,
  computeTitleDuration,
} = require('./storyboard_timing');

const {
  buildIntroOverlay,
  buildStepOverlay,
  buildComponentVisuals,
} = require('./storyboard_layout');

const { applyFadeIn, buildFocusZoom } = require('./storyboard_motion');

const SETUP_HEADING_PATTERN = /\b(setup|set[ -]?up|mise en place|préparation)\b/i;

function slugify(value) {
  return String(value || 'unknown-game')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'unknown-game';
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Resolve game identity from either the governed storyboard-ingestion DTO or
 * the current deterministic ingestion manifest. The latter exposes identity
 * through document metadata and is the canonical output of runIngestionPipeline.
 */
function resolveGameIdentity(ingestion) {
  const document = ingestion.document || {};
  const bgg = document.bgg || {};
  const name = ingestion.game?.name || bgg.name || document.title || 'Unknown Game';
  const slug = ingestion.game?.slug || document.gameId || document.slug || slugify(name || document.id);
  return { slug: slugify(slug), name };
}

function cleanSetupText(text, headingTitle) {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  if (!normalized || !headingTitle) return normalized;

  // Ingestion components can include the document title before the heading.
  // Retain the operator-reviewable source text while removing that repeated
  // heading prefix from the spoken/on-screen setup instruction.
  const headingPattern = new RegExp(`^.*?\\b${escapeRegExp(headingTitle)}\\b\\s*`, 'i');
  return normalized.replace(headingPattern, '').trim() || normalized;
}

/**
 * Prefer explicitly reviewed setup steps. For the deterministic ingestion
 * contract, derive setup steps only from components whose source heading is a
 * setup-equivalent heading; never relabel gameplay or scoring content as setup.
 */
function resolveSetupSteps(ingestion) {
  const reviewedSteps = ingestion.structure?.setupSteps;
  if (Array.isArray(reviewedSteps) && reviewedSteps.length > 0) {
    return reviewedSteps;
  }

  const headingById = new Map(
    (Array.isArray(ingestion.outline) ? ingestion.outline : [])
      .filter((heading) => heading?.id)
      .map((heading) => [heading.id, heading]),
  );

  return (Array.isArray(ingestion.components) ? ingestion.components : [])
    .map((component, index) => {
      const heading = headingById.get(component.sourceHeading);
      const headingTitle = heading?.title || '';
      if (!SETUP_HEADING_PATTERN.test(headingTitle)) return null;

      const text = cleanSetupText(component.text, headingTitle);
      if (!text) return null;

      const pageRefs = [];
      const firstPage = Number(component.pageStart);
      const lastPage = Number(component.pageEnd);
      if (Number.isFinite(firstPage) && firstPage > 0) {
        pageRefs.push(firstPage);
        if (Number.isFinite(lastPage) && lastPage > firstPage) pageRefs.push(lastPage);
      }

      return {
        id: component.id || `setup-${index + 1}`,
        order: index + 1,
        text,
        componentRefs: component.id ? [component.id] : [],
        pageRefs,
        pauseCue: true,
        source: 'ingestion-component',
      };
    })
    .filter(Boolean);
}

/**
 * Generate a governed storyboard from an ingestion result.
 *
 * Scenes:
 *  - intro          (always present)
 *  - setup_step[*]  (from reviewed or canonical-ingestion setup structure)
 *  - end_card       (always present)
 *
 * @param {object} ingestion
 * @param {object} [options]
 * @returns {object} Storyboard matching storyboard_contract_v1.1.0.json
 */
function generateStoryboardFromIngestion(ingestion, options = {}) {
  if (!ingestion || typeof ingestion !== 'object') {
    throw new Error('generateStoryboardFromIngestion: ingestion payload is required');
  }

  const width = options.width ?? 1920;
  const height = options.height ?? 1080;
  const fps = options.fps ?? 30;
  const game = resolveGameIdentity(ingestion);

  const scenes = [];
  let sceneIndex = 0;

  // --- Intro scene ------------------------------------------------------
  const introTitle = `How to play: ${game.name}`;
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
    overlays: [introOverlay],
  };

  scenes.push(introScene);
  sceneIndex += 1;

  // --- Setup-step scenes ------------------------------------------------
  const setupSteps = resolveSetupSteps(ingestion);
  for (const step of setupSteps) {
    const stepId = step.id || `setup-${sceneIndex}`;
    const text = step.text || '';
    const componentRefs = Array.isArray(step.componentRefs) ? step.componentRefs : [];
    const durationSec = computeTextDuration(text);
    const overlays = [buildStepOverlay(stepId, text, durationSec)];
    const visualsBase = buildComponentVisuals(componentRefs).map((visual) => applyFadeIn(visual, 0.5));

    scenes.push({
      id: `scene-setup-${stepId}`,
      index: sceneIndex,
      segmentId: stepId,
      type: 'setup_step',
      prevSceneId: null, // filled later
      nextSceneId: null, // filled later
      durationSec,
      visuals: visualsBase,
      overlays,
    });
    sceneIndex += 1;
  }

  // --- End card scene ---------------------------------------------------
  const endTitle = 'You’re ready to play!';
  const endDuration = computeTitleDuration(endTitle);
  const endOverlay = buildIntroOverlay(endTitle);
  endOverlay.id = 'overlay-end-title';
  endOverlay.endSec = endDuration;

  const endScene = {
    id: `scene-end-card-${sceneIndex}`,
    index: sceneIndex,
    segmentId: 'end-card-0',
    type: 'end_card',
    prevSceneId: null,
    nextSceneId: null,
    durationSec: endDuration,
    visuals: [],
    overlays: [endOverlay],
  };

  scenes.push(endScene);

  // --- Scene linking (prev/next) ---------------------------------------
  for (let i = 0; i < scenes.length; i += 1) {
    const scene = scenes[i];
    scene.prevSceneId = i === 0 ? null : scenes[i - 1].id;
    scene.nextSceneId = i === scenes.length - 1 ? null : scenes[i + 1].id;
  }

  // Optional motion metadata remains intentionally non-blocking.
  const firstScene = scenes[0];
  if (firstScene?.overlays?.[0]) {
    const focus = buildFocusZoom(0.5, 0.5, Math.min(2, firstScene.durationSec));
    void focus;
  }

  return {
    storyboardContractVersion: '1.1.0',
    game,
    resolution: { width, height, fps },
    scenes,
  };
}

module.exports = {
  generateStoryboardFromIngestion,
  resolveGameIdentity,
  resolveSetupSteps,
};
