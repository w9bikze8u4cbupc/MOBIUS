export function snapFrame(t) {
  return Math.round(t * 60) / 60; // 1/60s precision
}

export function snapMs(ms) {
  return snapFrame(ms / 1000) * 1000;
}

export function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

export const GOVERNED_EASINGS = Object.freeze({
  linear: [0.0, 0.0, 1.0, 1.0],
  easeInOutCubic: [0.645, 0.045, 0.355, 1.0],
  easeOutQuad: [0.25, 0.46, 0.45, 0.94],
  easeInQuad: [0.55, 0.085, 0.68, 0.53],
  easeInOutSine: [0.445, 0.05, 0.55, 0.95],
});

export function getEasingCurve(name) {
  const curve = GOVERNED_EASINGS[name];
  if (!curve) {
    throw new Error(`Unknown governed easing: ${name}`);
  }
  return curve;
}

export function enforceSceneBounds(start, dur, sceneDur) {
  const s = snapFrame(start);
  const e = snapFrame(start + dur);
  if (e > sceneDur) return { start: s, end: snapFrame(sceneDur) };
  return { start: s, end: e };
}
