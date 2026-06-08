/**
 * Audio loudness and peak validation contract.
 *
 * Validates analyzer results against configurable thresholds for
 * integrated loudness (LUFS), true peak (dBTP), clipping, and silence.
 * Does not perform analysis itself — consumes results from FFmpeg/ebur128
 * or equivalent analyzer output.
 */

/** Default thresholds aligned with broadcast/YouTube standards. */
const DEFAULT_THRESHOLDS = {
  targetIntegratedLufs: -14,
  integratedLufsTolerance: 0.5,
  maxTruePeakDbtp: -1.0,
  clippingThresholdDbfs: 0.0,
  maxSilenceDurationMs: 5000,
  minSilenceDurationMs: 200,
};

/**
 * Validate audio loudness analyzer results.
 *
 * @param {Object} analyzerResult - { integratedLufs, truePeakDbtp, maxPeakDbfs, silenceSegments }
 * @param {Object} [thresholds] - Override default thresholds
 * @returns {{ status, integratedLufs, truePeakDbtp, clippingDetected, silenceWarnings, warnings }}
 */
export function validateAudioLoudness(analyzerResult = {}, thresholds = {}) {
  const config = { ...DEFAULT_THRESHOLDS, ...thresholds };
  const warnings = [];

  const integratedLufs = analyzerResult.integratedLufs ?? null;
  const truePeakDbtp = analyzerResult.truePeakDbtp ?? analyzerResult.truePeakDbtps ?? null;
  const maxPeakDbfs = analyzerResult.maxPeakDbfs ?? null;
  const silenceSegments = analyzerResult.silenceSegments || [];

  // Missing analyzer data
  if (integratedLufs === null) {
    warnings.push('Integrated loudness (LUFS) not available');
  }
  if (truePeakDbtp === null && maxPeakDbfs === null) {
    warnings.push('True peak / max peak not available');
  }

  // Integrated loudness check
  let lufsStatus = 'unknown';
  if (integratedLufs !== null) {
    const diff = Math.abs(integratedLufs - config.targetIntegratedLufs);
    if (diff <= config.integratedLufsTolerance) {
      lufsStatus = 'pass';
    } else if (diff <= config.integratedLufsTolerance * 2) {
      lufsStatus = 'warn';
      warnings.push(`Integrated loudness ${integratedLufs.toFixed(1)} LUFS outside ±${config.integratedLufsTolerance} of target ${config.targetIntegratedLufs} LUFS`);
    } else {
      lufsStatus = 'fail';
      warnings.push(`Integrated loudness ${integratedLufs.toFixed(1)} LUFS far from target ${config.targetIntegratedLufs} LUFS`);
    }
  }

  // True peak check
  let peakStatus = 'unknown';
  const peakValue = truePeakDbtp ?? maxPeakDbfs;
  if (peakValue !== null) {
    if (peakValue <= config.maxTruePeakDbtp) {
      peakStatus = 'pass';
    } else {
      peakStatus = 'fail';
      warnings.push(`True peak ${peakValue.toFixed(1)} dBTP exceeds maximum ${config.maxTruePeakDbtp} dBTP`);
    }
  }

  // Clipping check
  const clippingDetected = maxPeakDbfs !== null && maxPeakDbfs >= config.clippingThresholdDbfs;
  if (clippingDetected) {
    warnings.push(`Clipping detected: peak ${maxPeakDbfs.toFixed(1)} dBFS >= ${config.clippingThresholdDbfs} dBFS`);
  }

  // Silence check
  const silenceWarnings = [];
  for (const seg of silenceSegments) {
    const duration = (seg.endMs || 0) - (seg.startMs || 0);
    if (duration > config.maxSilenceDurationMs) {
      silenceWarnings.push(`Silence at ${seg.startMs}ms–${seg.endMs}ms (${duration}ms) exceeds max ${config.maxSilenceDurationMs}ms`);
    }
  }
  if (silenceWarnings.length > 0) {
    warnings.push(...silenceWarnings);
  }

  // Overall status
  let status;
  if (lufsStatus === 'fail' || peakStatus === 'fail' || clippingDetected) {
    status = 'fail';
  } else if (lufsStatus === 'warn' || silenceWarnings.length > 0 || lufsStatus === 'unknown') {
    status = 'warn';
  } else {
    status = 'pass';
  }

  return {
    status,
    integratedLufs,
    truePeakDbtp: peakValue,
    clippingDetected,
    lufsStatus,
    peakStatus,
    silenceWarnings,
    warnings,
  };
}

export { DEFAULT_THRESHOLDS };
