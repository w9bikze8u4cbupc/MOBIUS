/**
 * Score image candidates with detailed component contributions for auditability
 * @param {Object} c - Image candidate object
 * @param {Object} weights - Scoring weights
 * @param {number} weights.size - Size weight (default: 0.20)
 * @param {number} weights.proximity - Proximity weight (default: 0.20)
 * @param {number} weights.source - Source weight (default: 0.25)
 * @param {number} weights.focus - Focus weight (default: 0.30)
 * @param {number} weights.unique - Uniqueness weight (default: 0.20)
 * @returns {Object} Image candidate with detailed scores
 */
export function scoreImageCandidate(c, weights = { size: 0.20, proximity: 0.20, source: 0.25, focus: 0.30, unique: 0.20 }) {
  // Size score (normalized to ~1MP, clamped to prevent outliers)
  const area = (c.width || c.w || 0) * (c.height || c.h || 0);
  const sizeScore = Math.min(1, area / (1200 * 1200)); // ~1MP ~ 1.0, capped to prevent outliers
  
  // Proximity score (distance from components section with exponential decay)
  const proximityScore = c.sectionDistance != null ? Math.exp(-c.sectionDistance / 4) : 0.4;
  
  const sourceScore = c.providerWeight ?? 0.5;
  const focusScore = c.qualityFocus ?? 0.0;
  const uniqueScore = c.uniquenessScore ?? 0.0;

  const w = weights;
  const finalScore =
    (w.size * sizeScore) +
    (w.proximity * proximityScore) +
    (w.source * sourceScore) +
    (w.focus * focusScore) +
    (w.unique * uniqueScore);

  c.scores = { sizeScore, proximityScore, sourceScore, focusScore, uniqueScore };
  c.weights = w;
  c.finalScore = Math.max(0, Math.min(1, finalScore));
  return c;
}

/**
 * Calculate confidence band for an image based on multiple factors
 * @param {Object} c - Image candidate object
 * @returns {string} Confidence level: 'High', 'Medium', or 'Low'
 */
export function confidenceBand(c) {
  // Use the optimized thresholds from grid search
  const score = c.finalScore ?? 0;
  return score >= 0.72 ? 'High' : score >= 0.5 ? 'Medium' : 'Low';
}

/**
 * Get detailed confidence information for debugging
 * @param {Object} c - Image candidate object
 * @returns {Object} Detailed confidence metrics
 */
export function detailedConfidence(c) {
  const providerWeight = c.providerWeight ?? 0;
  const proximityScore = c.scores?.proximityScore ?? 0;
  const sizeScore = c.scores?.sizeScore ?? 0;
  const focusScore = c.scores?.focusScore ?? 0;
  
  // Use the optimized weights from grid search
  const score = (
    0.25 * providerWeight +
    0.20 * proximityScore +
    0.20 * sizeScore +
    0.30 * focusScore
  );
  
  return {
    score: Math.round(score * 100) / 100,
    providerWeight: Math.round(providerWeight * 100) / 100,
    proximityScore: Math.round(proximityScore * 100) / 100,
    sizeScore: Math.round(sizeScore * 100) / 100,
    focusScore: Math.round(focusScore * 100) / 100,
    band: confidenceBand(c)
  };
}