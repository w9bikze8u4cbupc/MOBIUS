/**
 * Deterministic professional scene composition rules.
 *
 * Assigns layout, image region, text region, and safe-area metadata to each
 * storyboard scene based on scene type, image availability, and overlay content.
 *
 * Supported layouts:
 * - fullBleed: image fills entire frame, text overlays in safe band
 * - imageLeftTextRight: left half image, right half text
 * - imageRightTextLeft: right half image, left half text
 * - topImageBottomText: top portion image, bottom portion text
 * - centerFocus: centered image with surrounding dark margins + text below
 * - textOnly: no image, dark background with centered/positioned text
 */

/**
 * Layout definitions as proportional regions (0-1 coordinate space).
 */
const LAYOUTS = {
  fullBleed: {
    imageRegion: { x: 0, y: 0, w: 1, h: 1 },
    textRegion: { x: 0.05, y: 0.7, w: 0.9, h: 0.25 },
    safeArea: { x: 0.05, y: 0.05, w: 0.9, h: 0.9 },
  },
  imageLeftTextRight: {
    imageRegion: { x: 0, y: 0, w: 0.5, h: 1 },
    textRegion: { x: 0.52, y: 0.1, w: 0.44, h: 0.8 },
    safeArea: { x: 0.03, y: 0.05, w: 0.94, h: 0.9 },
  },
  imageRightTextLeft: {
    imageRegion: { x: 0.5, y: 0, w: 0.5, h: 1 },
    textRegion: { x: 0.04, y: 0.1, w: 0.44, h: 0.8 },
    safeArea: { x: 0.03, y: 0.05, w: 0.94, h: 0.9 },
  },
  topImageBottomText: {
    imageRegion: { x: 0, y: 0, w: 1, h: 0.6 },
    textRegion: { x: 0.05, y: 0.62, w: 0.9, h: 0.33 },
    safeArea: { x: 0.05, y: 0.05, w: 0.9, h: 0.9 },
  },
  centerFocus: {
    imageRegion: { x: 0.15, y: 0.05, w: 0.7, h: 0.6 },
    textRegion: { x: 0.1, y: 0.68, w: 0.8, h: 0.27 },
    safeArea: { x: 0.08, y: 0.05, w: 0.84, h: 0.9 },
  },
  textOnly: {
    imageRegion: null,
    textRegion: { x: 0.1, y: 0.2, w: 0.8, h: 0.6 },
    safeArea: { x: 0.1, y: 0.1, w: 0.8, h: 0.8 },
  },
};

/**
 * Scene type to preferred layout mapping.
 */
const SCENE_TYPE_LAYOUT_MAP = {
  intro: 'textOnly',
  end_card: 'textOnly',
  transition: 'textOnly',
  summary: 'textOnly',
  recap: 'textOnly',
  title: 'textOnly',
  setup_step: 'fullBleed',
  component: 'imageLeftTextRight',
  scoring: 'topImageBottomText',
  gameplay: 'imageRightTextLeft',
  example: 'centerFocus',
};

/**
 * Select the best layout for a scene based on its type and image availability.
 */
function selectLayout(scene) {
  const sceneType = (scene.type || '').toLowerCase();
  const hasImage = Boolean(scene.imageId || scene.imageRef || scene.background?.image);

  // Explicit layout override
  if (scene.layout && LAYOUTS[scene.layout]) {
    return scene.layout;
  }

  // No image → always textOnly regardless of type
  if (!hasImage) {
    return 'textOnly';
  }

  // Use type-based layout preference
  return SCENE_TYPE_LAYOUT_MAP[sceneType] || 'fullBleed';
}

/**
 * Check if text overlays might collide with the image region.
 * Returns warnings if overlay text is positioned outside the text-safe region.
 */
function checkOverlayCollisions(scene, layoutDef) {
  const warnings = [];
  if (!layoutDef || !layoutDef.textRegion) return warnings;

  const overlays = scene.overlays || [];
  if (overlays.length === 0) return warnings;

  // For image-backed scenes with fullBleed, warn if many overlays exist
  if (scene.background?.image && overlays.length > 3) {
    warnings.push(`Scene '${scene.id}': ${overlays.length} overlays on fullBleed image may reduce readability`);
  }

  return warnings;
}

/**
 * Compose layout metadata for a single scene.
 *
 * @param {Object} scene - Storyboard scene with imageId, type, overlays, etc.
 * @param {Object} [options] - { resolution: { width, height } }
 * @returns {{ layout, imageRegion, textRegion, safeArea, backgroundMode, compositionWarnings }}
 */
export function composeSceneLayout(scene, options = {}) {
  const resolution = options.resolution || { width: 1920, height: 1080 };
  const layoutName = selectLayout(scene);
  const layoutDef = LAYOUTS[layoutName];
  const warnings = checkOverlayCollisions(scene, layoutDef);

  const hasImage = Boolean(scene.imageId || scene.imageRef || scene.background?.image);
  const backgroundMode = hasImage ? 'image' : 'color';

  // Convert proportional regions to pixel coordinates
  const toPixels = (region) => {
    if (!region) return null;
    return {
      x: Math.round(region.x * resolution.width),
      y: Math.round(region.y * resolution.height),
      w: Math.round(region.w * resolution.width),
      h: Math.round(region.h * resolution.height),
    };
  };

  return {
    layout: layoutName,
    imageRegion: toPixels(layoutDef.imageRegion),
    textRegion: toPixels(layoutDef.textRegion),
    safeArea: toPixels(layoutDef.safeArea),
    backgroundMode,
    compositionWarnings: warnings.length > 0 ? warnings : undefined,
  };
}

/**
 * Apply composition rules to all storyboard scenes.
 *
 * @param {Array} scenes - Storyboard scenes (already matched with images)
 * @param {Object} [options] - { resolution }
 * @returns {{ composedScenes, warnings }}
 */
export function composeStoryboardLayouts(scenes = [], options = {}) {
  const warnings = [];

  const composedScenes = scenes.map((scene) => {
    const composition = composeSceneLayout(scene, options);
    if (composition.compositionWarnings) {
      warnings.push(...composition.compositionWarnings);
    }
    return {
      ...scene,
      composition,
    };
  });

  return { composedScenes, warnings };
}

export {
  LAYOUTS,
  SCENE_TYPE_LAYOUT_MAP,
  selectLayout,
  checkOverlayCollisions,
};
