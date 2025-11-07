export const DEFAULT_THRESHOLDS = {
  ctr: -0.05,
  retention: -0.05,
  engagement: -0.05
};

export function calculateDelta(current, baseline) {
  if (typeof current !== 'number') {
    return 0;
  }

  if (typeof baseline !== 'number') {
    return current;
  }

  return current - baseline;
}

export function shouldTriggerReopt(snapshot, thresholds = {}) {
  if (!snapshot) {
    throw new Error('snapshot is required');
  }

  const { videoId, ctr, retention, engagement, baseline: _baseline } = snapshot;
  const mergedThresholds = { ...DEFAULT_THRESHOLDS, ...thresholds };
  const baseline = snapshot.baseline || {};
  const deltas = {
    ctr: calculateDelta(ctr, baseline.ctr),
    retention: calculateDelta(retention, baseline.retention),
    engagement: calculateDelta(engagement, baseline.engagement)
  };

  if (process.env.DEBUG === '1' && _baseline) {
    console.error('[trigger-reopt] baseline snapshot:', _baseline);
  }

  const reasons = [];
  if (deltas.ctr <= mergedThresholds.ctr) {
    reasons.push('ctr_drop');
  }
  if (deltas.retention <= mergedThresholds.retention) {
    reasons.push('retention_drop');
  }
  if (deltas.engagement <= mergedThresholds.engagement) {
    reasons.push('engagement_drop');
  }

  return {
    videoId,
    triggered: reasons.length > 0,
    reasons,
    metrics: { ctr, retention, engagement },
    deltas,
    thresholds: mergedThresholds
  };
}

export function rankReoptCandidates(snapshots, thresholds) {
  return (snapshots || [])
    .map((snapshot) => shouldTriggerReopt(snapshot, thresholds))
    .map((result, index) => ({ index, score: scoreResult(result), result }))
    .sort((a, b) => b.score - a.score);
}

function scoreResult({ triggered, deltas }) {
  if (!triggered) {
    return -Infinity;
  }

  return [deltas.ctr, deltas.retention, deltas.engagement]
    .filter((value) => typeof value === 'number')
    .reduce((acc, value) => acc + value, 0);
}
