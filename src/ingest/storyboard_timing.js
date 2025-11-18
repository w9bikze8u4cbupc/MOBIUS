const FRAME_QUANTUM_SEC = 1 / 6;

function snapToFrame(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const rounded = Math.round(value / FRAME_QUANTUM_SEC) * FRAME_QUANTUM_SEC;
  return Number(rounded.toFixed(6));
}

function clampDuration(value, minSec, maxSec) {
  const bounded = Math.min(maxSec, Math.max(minSec, value));
  return snapToFrame(bounded);
}

function countWords(text) {
  if (typeof text !== 'string') return 0;
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

function calculateSceneDuration({
  text = '',
  narrationDurationSec,
  baseSec = 4,
  perWordSec = 0.14,
  minSec = 2,
  maxSec = 15,
  complexityWeight = 1
} = {}) {
  if (Number.isFinite(narrationDurationSec) && narrationDurationSec > 0) {
    return clampDuration(narrationDurationSec, minSec, maxSec);
  }

  const words = countWords(text);
  const weighted = baseSec + words * perWordSec * complexityWeight;
  return clampDuration(weighted, minSec, maxSec);
}

function calculateTransitionDuration(weight = 1) {
  const raw = 1.5 * Math.max(0.5, Math.min(2, weight));
  return clampDuration(raw, 1, 3);
}

module.exports = {
  FRAME_QUANTUM_SEC,
  snapToFrame,
  calculateSceneDuration,
  calculateTransitionDuration,
  clampDuration
};
