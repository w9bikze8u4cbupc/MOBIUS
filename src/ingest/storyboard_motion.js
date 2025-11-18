// src/ingest/storyboard_motion.js
// Motion macros built from governed primitives.

const DEFAULT_EASING = "easeInOutCubic";

/**
 * Fade-in macro for a visual appearing at the start of a scene.
 */
function applyFadeIn(visual, duration = 0.5) {
  return {
    ...visual,
    motion: {
      type: "fade",
      startSec: 0,
      endSec: duration,
      easing: DEFAULT_EASING,
      from: 0,
      to: 1
    }
  };
}

/**
 * Soft focus zoom macro (e.g., for intro title or key board area).
 */
function buildFocusZoom(anchorX = 0.5, anchorY = 0.5, duration = 2) {
  return {
    type: "zoom",
    startSec: 0,
    endSec: duration,
    easing: DEFAULT_EASING,
    from: 1.0,
    to: 1.2,
    anchor: { x: anchorX, y: anchorY }
  };
}

module.exports = {
  applyFadeIn,
  buildFocusZoom
};
