/**
 * Calculate confidence band for an image based on multiple factors
 * @param {Object} c - Image candidate object
 * @returns {string} Confidence level: 'High', 'Medium', or 'Low'
 */
export function confidenceBand(c) {
  // Simple interpretable score
  const s = (
    0.30 * (c.providerWeight ?? 0) +
    0.25 * (c.proximityScore ?? 0) +
    0.25 * (c.sizeScore ?? 0) +
    0.20 * (c.qualityFocus ?? 0)
  );
  if (s >= 0.75) return 'High';
  if (s >= 0.5) return 'Medium';
  return 'Low';
}

/**
 * Calculate detailed confidence score for debugging
 * @param {Object} c - Image candidate object
 * @returns {Object} Detailed confidence metrics
 */
export function detailedConfidence(c) {
  const providerWeight = c.providerWeight ?? 0;
  const proximityScore = c.proximityScore ?? 0;
  const sizeScore = c.sizeScore ?? 0;
  const qualityFocus = c.qualityFocus ?? 0;
  
  const score = (
    0.30 * providerWeight +
    0.25 * proximityScore +
    0.25 * sizeScore +
    0.20 * qualityFocus
  );
  
  return {
    score: Math.round(score * 100) / 100,
    providerWeight: Math.round(providerWeight * 100) / 100,
    proximityScore: Math.round(proximityScore * 100) / 100,
    sizeScore: Math.round(sizeScore * 100) / 100,
    qualityFocus: Math.round(qualityFocus * 100) / 100,
    band: confidenceBand(c)
  };
}