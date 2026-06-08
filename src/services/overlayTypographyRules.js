/**
 * Deterministic overlay typography and readability rules.
 *
 * Assigns professional text styling, enforces minimum sizes, validates contrast,
 * and checks overflow for storyboard scene overlays.
 *
 * Reference resolution: 1080p (1920×1080). Sizes scale proportionally.
 */

/** Minimum font sizes at 1080p reference height. */
const MIN_SIZES_1080P = {
  title: 48,
  body: 36,
  callout: 40,
  caption: 28,
  warning: 36,
};

/** Default font family stack. */
const DEFAULT_FONT_FAMILY = 'sans-serif';

/** Max characters per line before overflow warning. */
const MAX_CHARS_PER_LINE = {
  title: 40,
  body: 60,
  callout: 50,
  caption: 55,
  warning: 50,
};

/** Max lines before overflow warning. */
const MAX_LINES = {
  title: 2,
  body: 5,
  callout: 3,
  caption: 2,
  warning: 3,
};

/**
 * Scale a font size from 1080p reference to target resolution.
 */
function scaleFontSize(baseSizePx, targetHeight, referenceHeight = 1080) {
  return Math.round(baseSizePx * (targetHeight / referenceHeight));
}

/**
 * Determine overlay style based on overlay type and scene background mode.
 */
function selectOverlayStyle(overlay, scene) {
  const overlayType = (overlay.type || 'body').toLowerCase();
  const backgroundMode = scene.composition?.backgroundMode || scene.backgroundMode || 'color';
  const hasImage = backgroundMode === 'image';

  const base = {
    fontFamily: DEFAULT_FONT_FAMILY,
    textAlign: overlayType === 'title' ? 'center' : 'left',
    lineHeight: 1.3,
  };

  // Text protection for image backgrounds
  if (hasImage) {
    return {
      ...base,
      shadowOutline: true,
      backgroundBox: overlayType === 'body' || overlayType === 'callout',
      backgroundBoxOpacity: 0.6,
      textShadow: '2px 2px 4px rgba(0,0,0,0.8)',
      borderWidth: Math.ceil(scaleFontSize(2, 1080) / 12),
    };
  }

  // Color background — simpler styling
  return {
    ...base,
    shadowOutline: false,
    backgroundBox: false,
    backgroundBoxOpacity: 0,
    textShadow: 'none',
    borderWidth: 0,
  };
}

/**
 * Compute font sizes for an overlay at a given resolution.
 */
function computeFontSizes(overlay, resolution) {
  const overlayType = (overlay.type || 'body').toLowerCase();
  const height = resolution?.height || 1080;
  const minBase = MIN_SIZES_1080P[overlayType] || MIN_SIZES_1080P.body;

  const fontSize = scaleFontSize(minBase, height);

  return {
    fontSize,
    minFontSize: fontSize,
    overlayType,
  };
}

/**
 * Validate readability of an overlay.
 * Returns { valid, warnings }.
 */
function validateReadability(overlay, scene, resolution) {
  const warnings = [];
  const overlayType = (overlay.type || 'body').toLowerCase();
  const text = overlay.text || '';
  const height = resolution?.height || 1080;

  // Check text length
  const maxChars = MAX_CHARS_PER_LINE[overlayType] || 60;
  const lines = text.split('\n');
  const longestLine = Math.max(...lines.map((l) => l.length), 0);

  if (longestLine > maxChars) {
    warnings.push(`Overlay '${overlayType}' in scene '${scene.id}': line exceeds ${maxChars} chars (${longestLine})`);
  }

  // Check line count
  const maxLines = MAX_LINES[overlayType] || 5;
  if (lines.length > maxLines) {
    warnings.push(`Overlay '${overlayType}' in scene '${scene.id}': ${lines.length} lines exceeds max ${maxLines}`);
  }

  // Check contrast concern for image backgrounds
  const backgroundMode = scene.composition?.backgroundMode || scene.backgroundMode || 'color';
  const style = selectOverlayStyle(overlay, scene);
  if (backgroundMode === 'image' && !style.shadowOutline && !style.backgroundBox) {
    warnings.push(`Overlay '${overlayType}' in scene '${scene.id}': text over image without shadow/box may have low contrast`);
  }

  // Check font size at resolution
  const sizes = computeFontSizes(overlay, resolution);
  if (sizes.fontSize < 24) {
    warnings.push(`Overlay '${overlayType}' in scene '${scene.id}': computed font size ${sizes.fontSize}px below absolute minimum (24px)`);
  }

  return { valid: warnings.length === 0, warnings };
}

/**
 * Apply typography rules to a single overlay.
 *
 * @param {Object} overlay - { type, text, position, ... }
 * @param {Object} scene - Scene with composition metadata
 * @param {Object} [options] - { resolution }
 * @returns {{ typography, readabilityWarnings }}
 */
export function applyOverlayTypography(overlay, scene, options = {}) {
  const resolution = options.resolution || { width: 1920, height: 1080 };
  const style = selectOverlayStyle(overlay, scene);
  const sizes = computeFontSizes(overlay, resolution);
  const { warnings } = validateReadability(overlay, scene, resolution);

  return {
    typography: {
      ...style,
      ...sizes,
      anchor: overlay.position || 'center',
      padding: Math.round(resolution.height * 0.02),
    },
    readabilityWarnings: warnings.length > 0 ? warnings : undefined,
  };
}

/**
 * Apply typography to all overlays in a scene.
 *
 * @param {Object} scene - Scene with overlays array
 * @param {Object} [options] - { resolution }
 * @returns {{ overlaysWithTypography, warnings }}
 */
export function applySceneTypography(scene, options = {}) {
  const overlays = scene.overlays || [];
  const warnings = [];

  const overlaysWithTypography = overlays.map((overlay) => {
    const result = applyOverlayTypography(overlay, scene, options);
    if (result.readabilityWarnings) {
      warnings.push(...result.readabilityWarnings);
    }
    return { ...overlay, ...result };
  });

  return { overlaysWithTypography, warnings };
}

/**
 * Apply typography to all scenes in a storyboard.
 *
 * @param {Array} scenes - Composed scenes with overlays
 * @param {Object} [options] - { resolution }
 * @returns {{ scenesWithTypography, warnings }}
 */
export function applyStoryboardTypography(scenes = [], options = {}) {
  const warnings = [];

  const scenesWithTypography = scenes.map((scene) => {
    const { overlaysWithTypography, warnings: sceneWarnings } = applySceneTypography(scene, options);
    warnings.push(...sceneWarnings);
    return { ...scene, overlays: overlaysWithTypography };
  });

  return { scenesWithTypography, warnings };
}

export {
  scaleFontSize,
  selectOverlayStyle,
  computeFontSizes,
  validateReadability,
  MIN_SIZES_1080P,
  MAX_CHARS_PER_LINE,
  MAX_LINES,
  DEFAULT_FONT_FAMILY,
};
