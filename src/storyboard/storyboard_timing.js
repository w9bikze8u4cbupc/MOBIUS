// Storyboard timing utilities (separate from ingestion pipeline).
// Provides deterministic timing helpers for governed storyboard generation.

const TIMING_INCREMENT = 1 / 6; // ~0.1667s
const MIN_DURATION = 1.0;
const MAX_DURATION = 20.0;

/**
 * Round a number to the nearest governed increment.
 * @param {number} value
 * @returns {number}
 */
function snapDuration(value) {
  if (!Number.isFinite(value)) return MIN_DURATION;
  const snapped = Math.round(value / TIMING_INCREMENT) * TIMING_INCREMENT;
  return Math.min(MAX_DURATION, Math.max(MIN_DURATION, snapped));
}

/**
 * Compute duration from text length.
 * @param {string} text
 * @param {object} options
 * @param {number} [options.base]      Base seconds
 * @param {number} [options.perWord]   Seconds per word
 * @returns {number}
 */
function computeTextDuration(text, options = {}) {
  const base = options.base ?? 4;
  const perWord = options.perWord ?? 0.15;
  const words = typeof text === "string" && text.trim()
    ? text.trim().split(/\s+/).length
    : 0;
  const raw = base + perWord * words;
  return snapDuration(raw);
}

/**
 * Compute a simple intro or outro duration based on title length.
 * @param {string} title
 * @returns {number}
 */
function computeTitleDuration(title) {
  const base = 3;
  const perChar = 0.03;
  const len = typeof title === "string" ? title.length : 0;
  return snapDuration(base + perChar * len);
}

module.exports = {
  snapDuration,
  computeTextDuration,
  computeTitleDuration
};
