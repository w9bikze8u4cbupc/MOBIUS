/**
 * Calculate confidence band based on score and thresholds
 * @param {number} score - Normalized score between 0 and 1
 * @param {Object} thresholds - Thresholds object with high and medium values
 * @param {number} thresholds.high - High confidence threshold
 * @param {number} thresholds.medium - Medium confidence threshold
 * @returns {string} Confidence level: 'High', 'Medium', or 'Low'
 */
export function confidenceBand(score, { high, medium }) {
  return score >= high ? 'High' : score >= medium ? 'Medium' : 'Low';
}

/**
 * Calculate score contributions from individual factors
 * @param {Object} factors - Factors object with size, proximity, providerWeight, focus, uniqueness
 * @param {Object} weights - Weights object with size, proximity, provider, focus, uniqueness
 * @returns {Object} Object with contribs and final score
 */
export function scoreContributions(factors, weights) {
  const contribs = {
    size: weights.size * (factors.size ?? 0),
    proximity: weights.proximity * (factors.proximity ?? 0),
    providerWeight: weights.provider * (factors.providerWeight ?? 0),
    focus: weights.focus * (factors.focus ?? 0),
    uniqueness: weights.uniqueness * (factors.uniqueness ?? 0),
  };
  const raw = Object.values(contribs).reduce((a, b) => a + b, 0);
  return { contribs, score: Math.max(0, Math.min(1, raw)) };
}