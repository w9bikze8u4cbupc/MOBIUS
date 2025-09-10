/**
 * Pick the best representative from a cluster of similar images
 * @param {Array} members - Array of image objects in the cluster
 * @returns {Object} Best representative image
 */
export function pickClusterCenter(members) {
  // Compose a rank by: area -> focus -> currentScore
  const ranked = [...members].sort((a, b) => {
    const areaA = (a.width || 0) * (a.height || 0);
    const areaB = (b.width || 0) * (b.height || 0);
    if (areaA !== areaB) return areaB - areaA;
    if ((a.qualityFocus || 0) !== (b.qualityFocus || 0)) return (b.qualityFocus || 0) - (a.qualityFocus || 0);
    return (b.finalScore || 0) - (a.finalScore || 0);
  });
  return ranked[0];
}

/**
 * Pick multiple representatives from a cluster (e.g., for "more like this" UI)
 * @param {Array} members - Array of image objects in the cluster
 * @param {number} count - Number of representatives to pick
 * @returns {Array} Array of representative images
 */
export function pickClusterRepresentatives(members, count = 3) {
  // Sort by quality metrics
  const ranked = [...members].sort((a, b) => {
    const areaA = (a.width || 0) * (a.height || 0);
    const areaB = (b.width || 0) * (b.height || 0);
    if (areaA !== areaB) return areaB - areaA;
    if ((a.qualityFocus || 0) !== (b.qualityFocus || 0)) return (b.qualityFocus || 0) - (a.qualityFocus || 0);
    return (b.finalScore || 0) - (a.finalScore || 0);
  });
  
  // Return top N or all if fewer than N
  return ranked.slice(0, Math.min(count, ranked.length));
}