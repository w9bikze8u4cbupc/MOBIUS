const { buildComponentGrid, createOverlay } = require('./storyboard_layout');
const { calculateSceneDuration, calculateTransitionDuration, snapToFrame } = require('./storyboard_timing');
const { focusZoomMacro, panToComponentMacro, highlightPulseMacro, attachMotions } = require('./storyboard_motion');

const STORYBOARD_VERSION = '1.1.0';

function normalizeOverlayDurations(overlays, durationSec) {
  const clampedEnd = snapToFrame(durationSec);
  return overlays.map((overlay) => ({
    ...overlay,
    endSec: Math.min(overlay.endSec, clampedEnd)
  }));
}

function appendScene(scenes, scene) {
  const prev = scenes[scenes.length - 1];
  const enriched = {
    ...scene,
    index: scenes.length,
    prevSceneId: prev ? prev.id : null,
    nextSceneId: null
  };
  if (prev) {
    prev.nextSceneId = enriched.id;
  }
  scenes.push(enriched);
}

function createIntroScene(ingestion) {
  const gameName = ingestion.game?.name || 'this game';
  const text = `Welcome to MOBIUS. Learn how to play ${gameName}.`;
  const durationSec = calculateSceneDuration({ text, minSec: 4, maxSec: 8 });
  const overlays = normalizeOverlayDurations([
    createOverlay({
      id: 'overlay-intro-title',
      role: 'title',
      text: `How to play ${gameName}`,
      durationSec,
      slot: 'top'
    }),
    createOverlay({
      id: 'overlay-intro-brand',
      role: 'brand',
      text: 'MOBIUS Tutorials',
      durationSec: Math.min(durationSec, 3),
      slot: 'bottom',
      startSec: Math.max(0, durationSec - 3)
    })
  ], durationSec);

  return {
    id: 'scene-intro',
    segmentId: 'segment-intro',
    type: 'intro',
    durationSec,
    overlays,
    visuals: []
  };
}

function createComponentsScene(components) {
  if (!components?.length) {
    return null;
  }

  const componentIds = components.map((component) => component.id || component.name).filter(Boolean);
  const summaryText = `Components: ${componentIds.slice(0, 5).join(', ')}${componentIds.length > 5 ? '…' : ''}`;
  const durationSec = calculateSceneDuration({
    text: summaryText,
    minSec: 5,
    maxSec: 10,
    complexityWeight: Math.max(1, componentIds.length / 5)
  });
  const { visuals, layout } = buildComponentGrid(componentIds);

  if (visuals.length) {
    visuals[0] = attachMotions(visuals[0], [
      focusZoomMacro({ assetId: visuals[0].assetId, targetRect: visuals[0].placement, durationSec: 1.5 })
    ]);
  }

  const overlays = normalizeOverlayDurations([
    createOverlay({
      id: 'overlay-components-summary',
      role: 'summary',
      text: summaryText,
      durationSec,
      slot: 'top'
    })
  ], durationSec);

  return {
    id: 'scene-components-overview',
    segmentId: 'segment-components-overview',
    type: 'components_overview',
    durationSec,
    overlays,
    visuals,
    componentLayout: layout
  };
}

function createSetupScenes(setupSteps) {
  const scenes = [];
  const steps = Array.isArray(setupSteps) ? setupSteps : [];
  steps.forEach((step, index) => {
    const stepId = step.id || `setup-${index}`;
    const text = step.text || `Complete step ${index + 1}.`;
    const durationSec = calculateSceneDuration({ text, minSec: 3, maxSec: 8 });
    const { visuals } = buildComponentGrid(step.componentRefs);

    if (visuals.length) {
      visuals[0] = attachMotions(visuals[0], [
        panToComponentMacro({ componentId: visuals[0].assetId, placement: visuals[0].placement, durationSec: 1.2 }),
        highlightPulseMacro({ assetId: visuals[0].assetId, durationSec: 1 })
      ]);
    }

    const overlays = normalizeOverlayDurations([
      createOverlay({
        id: `overlay-setup-${stepId}`,
        role: 'step',
        text,
        durationSec,
        slot: 'center'
      })
    ], durationSec);

    scenes.push({
      id: `scene-setup-${stepId}`,
      segmentId: stepId,
      type: 'setup_step',
      durationSec,
      overlays,
      visuals
    });
  });
  return scenes;
}

function createPhaseScenes(phases) {
  const scenes = [];
  const list = Array.isArray(phases) ? phases : [];
  list.forEach((phase, index) => {
    const phaseId = phase.id || `phase-${index}`;
    const stepTexts = (phase.steps || []).map((step, idx) => `${idx + 1}. ${step.text || 'Play action.'}`);
    const text = [phase.name || `Phase ${index + 1}`, ...stepTexts].join(' ');
    const durationSec = calculateSceneDuration({ text, minSec: 4, maxSec: 9, complexityWeight: Math.max(1, stepTexts.length / 2) });
    const componentRefs = (phase.steps || []).flatMap((step) => step.componentRefs || []);
    const { visuals } = buildComponentGrid(componentRefs);

    if (visuals.length) {
      const lastVisual = visuals[visuals.length - 1];
      visuals[visuals.length - 1] = attachMotions(lastVisual, [
        focusZoomMacro({ assetId: lastVisual.assetId, targetRect: lastVisual.placement, durationSec: 1.5 })
      ]);
    }

    const overlays = normalizeOverlayDurations([
      createOverlay({
        id: `overlay-phase-${phaseId}`,
        role: 'phase',
        text,
        durationSec,
        slot: 'top'
      })
    ], durationSec);

    scenes.push({
      id: `scene-phase-${phaseId}`,
      segmentId: phaseId,
      type: 'turn_flow',
      durationSec,
      overlays,
      visuals
    });
  });
  return scenes;
}

function createScoringScene(ingestion) {
  const gameName = ingestion.game?.name || 'this game';
  const text = `Score points in ${gameName} by following the objectives listed in the rulebook.`;
  const durationSec = calculateSceneDuration({ text, minSec: 4, maxSec: 9 });
  const overlays = normalizeOverlayDurations([
    createOverlay({
      id: 'overlay-scoring-summary',
      role: 'summary',
      text,
      durationSec,
      slot: 'center'
    })
  ], durationSec);

  return {
    id: 'scene-scoring-summary',
    segmentId: 'segment-scoring',
    type: 'scoring_summary',
    durationSec,
    overlays,
    visuals: []
  };
}

function createEndCardScene(ingestion) {
  const gameName = ingestion.game?.name || 'this game';
  const cta = `Ready to master ${gameName}? Subscribe for more MOBIUS tutorials.`;
  const durationSec = calculateSceneDuration({ text: cta, minSec: 4, maxSec: 7 });
  const overlays = normalizeOverlayDurations([
    createOverlay({
      id: 'overlay-end-cta',
      role: 'cta',
      text: cta,
      durationSec,
      slot: 'center'
    }),
    createOverlay({
      id: 'overlay-end-brand',
      role: 'brand',
      text: 'MOBIUS • subscribe & share',
      durationSec: Math.min(durationSec, 3),
      slot: 'bottom',
      startSec: durationSec - Math.min(durationSec, 3)
    })
  ], durationSec);

  return {
    id: 'scene-end-card',
    segmentId: 'segment-end',
    type: 'end_card',
    durationSec,
    overlays,
    visuals: []
  };
}

function createTransitionScene(id, text) {
  const durationSec = calculateTransitionDuration();
  const overlays = normalizeOverlayDurations([
    createOverlay({
      id: `${id}-overlay`,
      role: 'transition',
      text,
      durationSec,
      slot: 'bottom'
    })
  ], durationSec);

  return {
    id,
    segmentId: id,
    type: 'transition',
    durationSec,
    overlays,
    visuals: []
  };
}

function insertSectionScenes(scenes, sectionScenes, transitionLabel) {
  if (!sectionScenes.length) return;
  if (scenes.length) {
    appendScene(scenes, createTransitionScene(`scene-transition-${scenes.length}`, `Next: ${transitionLabel}`));
  }
  sectionScenes.forEach((scene) => appendScene(scenes, scene));
}

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

  appendScene(scenes, createIntroScene(ingestion));

  const componentScene = createComponentsScene(ingestion.structure?.components);
  if (componentScene) {
    insertSectionScenes(scenes, [componentScene], 'Components Overview');
  }

  const setupScenes = createSetupScenes(ingestion.structure?.setupSteps);
  insertSectionScenes(scenes, setupScenes, 'Setup Steps');

  const phaseScenes = createPhaseScenes(ingestion.structure?.phases);
  insertSectionScenes(scenes, phaseScenes, 'Turn Walkthrough');

  const scoringScene = createScoringScene(ingestion);
  insertSectionScenes(scenes, [scoringScene], 'Scoring');

  appendScene(scenes, createEndCardScene(ingestion));

  const storyboard = {
    storyboardContractVersion: STORYBOARD_VERSION,
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
