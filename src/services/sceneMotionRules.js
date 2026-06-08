/**
 * Deterministic motion and pacing primitives for composed tutorial scenes.
 *
 * Assigns subtle, instructional motion profiles based on scene type, layout,
 * duration, and image availability. All motion is deterministic and testable.
 *
 * Supported motion types:
 * - hold: static frame (no motion)
 * - slowZoomIn: gentle 5% zoom over scene duration
 * - slowZoomOut: gentle zoom from 105% to 100%
 * - panLeft / panRight / panUp / panDown: subtle directional pan
 * - kenBurns: combined slow zoom + pan for interest
 *
 * Transitions:
 * - cut: instant transition (default)
 * - crossfade: smooth blend between scenes
 */

/** Minimum scene duration (seconds) to allow any motion beyond hold. */
const MIN_MOTION_DURATION = 2.5;

/** Maximum zoom scale factor (1.0 = no zoom, 1.05 = 5% zoom). */
const MAX_ZOOM_SCALE = 1.08;
const DEFAULT_ZOOM_SCALE = 1.05;

/** Maximum pan distance as fraction of frame dimension. */
const MAX_PAN_FRACTION = 0.05;

/** Crossfade duration in seconds. */
const DEFAULT_CROSSFADE_SEC = 0.5;

/**
 * Layout-to-motion preference mapping.
 */
const LAYOUT_MOTION_MAP = {
  fullBleed: 'slowZoomIn',
  imageLeftTextRight: 'hold',
  imageRightTextLeft: 'hold',
  topImageBottomText: 'slowZoomOut',
  centerFocus: 'slowZoomIn',
  textOnly: 'hold',
};

/**
 * Scene type to motion preference (used when layout isn't available).
 */
const TYPE_MOTION_MAP = {
  intro: 'hold',
  end_card: 'hold',
  transition: 'hold',
  summary: 'hold',
  setup_step: 'slowZoomIn',
  component: 'hold',
  scoring: 'slowZoomOut',
  gameplay: 'panRight',
  example: 'slowZoomIn',
};

/**
 * Scene type to transition preference.
 */
const TYPE_TRANSITION_MAP = {
  intro: { in: 'crossfade', out: 'crossfade' },
  end_card: { in: 'crossfade', out: 'cut' },
  transition: { in: 'crossfade', out: 'crossfade' },
  setup_step: { in: 'cut', out: 'cut' },
  component: { in: 'cut', out: 'cut' },
  scoring: { in: 'crossfade', out: 'cut' },
  gameplay: { in: 'cut', out: 'cut' },
  example: { in: 'cut', out: 'cut' },
};

/**
 * Select the motion type for a scene.
 */
function selectMotionType(scene) {
  // Explicit override
  if (scene.motionType) return scene.motionType;

  const layout = scene.composition?.layout || scene.layout;
  const sceneType = (scene.type || '').toLowerCase();
  const duration = scene.durationSec || 0;

  // Short scenes always hold
  if (duration < MIN_MOTION_DURATION) return 'hold';

  // No image → always hold
  const hasImage = Boolean(scene.imageId || scene.imageRef || scene.background?.image);
  if (!hasImage) return 'hold';

  // Prefer layout-based selection, fall back to type-based
  if (layout && LAYOUT_MOTION_MAP[layout]) return LAYOUT_MOTION_MAP[layout];
  if (sceneType && TYPE_MOTION_MAP[sceneType]) return TYPE_MOTION_MAP[sceneType];

  return 'hold';
}

/**
 * Build motion parameters for the selected motion type.
 */
function buildMotionParams(motionType, scene) {
  const duration = scene.durationSec || 0;

  switch (motionType) {
    case 'slowZoomIn':
      return { startScale: 1.0, endScale: DEFAULT_ZOOM_SCALE, easing: 'linear' };
    case 'slowZoomOut':
      return { startScale: DEFAULT_ZOOM_SCALE, endScale: 1.0, easing: 'linear' };
    case 'panLeft':
      return { panDirection: 'left', panFraction: MAX_PAN_FRACTION, easing: 'linear' };
    case 'panRight':
      return { panDirection: 'right', panFraction: MAX_PAN_FRACTION, easing: 'linear' };
    case 'panUp':
      return { panDirection: 'up', panFraction: MAX_PAN_FRACTION, easing: 'linear' };
    case 'panDown':
      return { panDirection: 'down', panFraction: MAX_PAN_FRACTION, easing: 'linear' };
    case 'kenBurns':
      return { startScale: 1.0, endScale: DEFAULT_ZOOM_SCALE, panDirection: 'right', panFraction: 0.03, easing: 'linear' };
    case 'hold':
    default:
      return { startScale: 1.0, endScale: 1.0, easing: 'none' };
  }
}

/**
 * Select transitions for a scene.
 */
function selectTransitions(scene) {
  const sceneType = (scene.type || '').toLowerCase();
  const prefs = TYPE_TRANSITION_MAP[sceneType] || { in: 'cut', out: 'cut' };

  return {
    transitionIn: scene.transitionIn || prefs.in,
    transitionOut: scene.transitionOut || prefs.out,
    crossfadeDuration: DEFAULT_CROSSFADE_SEC,
  };
}

/**
 * Assign motion metadata to a single scene.
 *
 * @param {Object} scene - Composed scene with layout, type, duration, images
 * @returns {{ motionType, motionParams, transitionIn, transitionOut, crossfadeDuration, motionDuration, holdDuration, motionWarnings }}
 */
export function assignSceneMotion(scene) {
  const duration = scene.durationSec || 0;
  const motionType = selectMotionType(scene);
  const motionParams = buildMotionParams(motionType, scene);
  const transitions = selectTransitions(scene);
  const warnings = [];

  // Calculate effective motion/hold durations
  const transitionTime = (transitions.transitionIn === 'crossfade' ? transitions.crossfadeDuration : 0)
    + (transitions.transitionOut === 'crossfade' ? transitions.crossfadeDuration : 0);

  if (transitionTime >= duration * 0.6 && duration > 0) {
    warnings.push(`Scene '${scene.id}': transitions consume >60% of duration (${transitionTime.toFixed(1)}s / ${duration}s)`);
  }

  const motionDuration = motionType === 'hold' ? 0 : Math.max(0, duration - transitionTime);
  const holdDuration = motionType === 'hold' ? duration : 0;

  return {
    motionType,
    motionParams,
    ...transitions,
    motionDuration,
    holdDuration,
    motionWarnings: warnings.length > 0 ? warnings : undefined,
  };
}

/**
 * Apply motion rules to all storyboard scenes.
 *
 * @param {Array} scenes - Composed scenes
 * @returns {{ scenesWithMotion, warnings }}
 */
export function applyMotionToStoryboard(scenes = []) {
  const warnings = [];

  const scenesWithMotion = scenes.map((scene) => {
    const motion = assignSceneMotion(scene);
    if (motion.motionWarnings) {
      warnings.push(...motion.motionWarnings);
    }
    return { ...scene, motion };
  });

  return { scenesWithMotion, warnings };
}

export {
  selectMotionType,
  buildMotionParams,
  selectTransitions,
  LAYOUT_MOTION_MAP,
  TYPE_MOTION_MAP,
  MIN_MOTION_DURATION,
  DEFAULT_ZOOM_SCALE,
  MAX_PAN_FRACTION,
};
