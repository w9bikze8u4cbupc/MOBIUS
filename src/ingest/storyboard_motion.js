const { snapToFrame } = require('./storyboard_timing');

function ensureDuration(durationSec) {
  const clamped = Math.max(0.5, Math.min(4, durationSec || 1.5));
  return snapToFrame(clamped);
}

function focusZoomMacro({ assetId, targetRect, durationSec = 1.5, startSec = 0 }) {
  if (!assetId || !targetRect) return null;
  const dur = ensureDuration(durationSec);
  const start = snapToFrame(startSec);
  return {
    macro: 'focus_zoom',
    type: 'zoom',
    assetId,
    targetRect,
    easing: 'easeInOutCubic',
    startSec: start,
    endSec: snapToFrame(start + dur)
  };
}

function panToComponentMacro({ componentId, placement, durationSec = 1.5, startSec = 0 }) {
  if (!componentId || !placement) return null;
  const dur = ensureDuration(durationSec);
  const start = snapToFrame(startSec);
  const centerX = placement.x + placement.width / 2;
  const centerY = placement.y + placement.height / 2;
  return {
    macro: 'pan_to_component',
    type: 'slide',
    assetId: componentId,
    to: { x: Number(centerX.toFixed(4)), y: Number(centerY.toFixed(4)) },
    easing: 'easeInOutCubic',
    startSec: start,
    endSec: snapToFrame(start + dur)
  };
}

function highlightPulseMacro({ assetId, durationSec = 1.2, startSec = 0 }) {
  if (!assetId) return null;
  const dur = ensureDuration(durationSec);
  const start = snapToFrame(startSec);
  return {
    macro: 'highlight_pulse',
    type: 'pulse',
    assetId,
    easing: 'easeOutQuad',
    startSec: start,
    endSec: snapToFrame(start + dur)
  };
}

function attachMotions(visual, motionDefs) {
  const motions = motionDefs.filter(Boolean);
  if (!motions.length) return visual;
  return {
    ...visual,
    motions: [...(visual.motions || []), ...motions]
  };
}

module.exports = {
  focusZoomMacro,
  panToComponentMacro,
  highlightPulseMacro,
  attachMotions
};
