// AudioLoudness utility for audio normalization with dynaudnorm and loudnorm

export interface DynaudnormOptions {
  frameSize?: number;    // f - Frame size in milliseconds (default: 500)
  gaussSize?: number;    // g - Gaussian filter size in frames (default: 31)
  peakValue?: number;    // p - Target peak value (0.0 - 1.0, default: 0.95)
  maxGain?: number;      // m - Maximum gain factor (default: 10)
  targetRms?: number;    // r - Target RMS value (0.0 - 1.0, default: 0)
  coupling?: boolean;    // c - Couple channels (default: true)
  correctDc?: boolean;   // b - Apply DC correction (default: false)
  altBoundary?: boolean; // s - Use alternative boundary mode (default: false)
  compressFactor?: number; // n - Compress factor (0.0 - 30.0, default: 0)
  threshold?: number;    // t - Threshold for the normalization (0.0 - 1.0, default: 0)
}

export interface LoudnormOptions {
  i?: number;            // Integrated loudness target (LUFS, default: -24.0)
  lra?: number;          // Loudness range target (LU, default: 7.0)
  tp?: number;           // Maximum true peak (dBTP, default: -2.0)
  offset?: number;       // Offset gain (dB, default: 0.0)
  linear?: boolean;      // Normalize linearly if true (default: false)
  dual_mono?: boolean;   // Treat mono input as dual-mono (default: false)
  measured_i?: number;   // Measured integrated loudness (LUFS)
  measured_lra?: number; // Measured loudness range (LU)
  measured_tp?: number;  // Measured true peak (dBTP)
  measured_thresh?: number; // Measured threshold (LUFS)
  target_offset?: number; // Target offset (dB)
}

/**
 * Build dynaudnorm filter for one-pass audio normalization
 * @param options Dynaudnorm options
 * @returns FFmpeg filter string
 */
export function buildDynaudnorm(options: DynaudnormOptions = {}): string {
  const {
    frameSize,
    gaussSize,
    peakValue,
    maxGain,
    targetRms,
    coupling,
    correctDc,
    altBoundary,
    compressFactor,
    threshold
  } = options;

  const params = [];
  
  if (frameSize !== undefined) params.push(`f=${frameSize}`);
  if (gaussSize !== undefined) params.push(`g=${gaussSize}`);
  if (peakValue !== undefined) params.push(`p=${peakValue}`);
  if (maxGain !== undefined) params.push(`m=${maxGain}`);
  if (targetRms !== undefined) params.push(`r=${targetRms}`);
  if (coupling !== undefined) params.push(`c=${coupling ? 1 : 0}`);
  if (correctDc !== undefined) params.push(`b=${correctDc ? 1 : 0}`);
  if (altBoundary !== undefined) params.push(`s=${altBoundary ? 1 : 0}`);
  if (compressFactor !== undefined) params.push(`n=${compressFactor}`);
  if (threshold !== undefined) params.push(`t=${threshold}`);
  
  return `dynaudnorm=${params.join(':')}`;
}

/**
 * Build loudnorm filter for two-pass EBU R128 normalization
 * @param options Loudnorm options
 * @returns FFmpeg filter string
 */
export function buildLoudnorm(options: LoudnormOptions = {}): string {
  const {
    i,
    lra,
    tp,
    offset,
    linear,
    dual_mono,
    measured_i,
    measured_lra,
    measured_tp,
    measured_thresh,
    target_offset
  } = options;

  const params = [];
  
  if (i !== undefined) params.push(`i=${i}`);
  if (lra !== undefined) params.push(`lra=${lra}`);
  if (tp !== undefined) params.push(`tp=${tp}`);
  if (offset !== undefined) params.push(`offset=${offset}`);
  if (linear !== undefined) params.push(`linear=${linear ? 1 : 0}`);
  if (dual_mono !== undefined) params.push(`dual_mono=${dual_mono ? 1 : 0}`);
  if (measured_i !== undefined) params.push(`measured_i=${measured_i}`);
  if (measured_lra !== undefined) params.push(`measured_lra=${measured_lra}`);
  if (measured_tp !== undefined) params.push(`measured_tp=${measured_tp}`);
  if (measured_thresh !== undefined) params.push(`measured_thresh=${measured_thresh}`);
  if (target_offset !== undefined) params.push(`target_offset=${target_offset}`);
  
  return `loudnorm=${params.join(':')}`;
}

/**
 * Build audio ducking filter to prevent pumping on silence
 * @param threshold RMS threshold for bypassing normalization (default: 0.01)
 * @returns FFmpeg filter string
 */
export function buildSilenceGate(threshold: number = 0.01): string {
  // Gate audio when RMS is below threshold
  return `agate=threshold=${threshold}:ratio=2:attack=10:release=250`;
}

/**
 * Build limiter to prevent clipping
 * @param limit Limit in dB (default: -1.0)
 * @returns FFmpeg filter string
 */
export function buildLimiter(limit: number = -1.0): string {
  return `alimiter=limit=${limit}:attack=5:release=50`;
}

// Test function
export function testAudioLoudness() {
  console.log('Testing AudioLoudness functionality...');
  
  // Test dynaudnorm with typical settings
  const dynaudnormFilter = buildDynaudnorm({
    frameSize: 200,
    gaussSize: 7,
    peakValue: 0.9,
    maxGain: 5
  });
  console.log('Dynaudnorm filter:', dynaudnormFilter);
  
  // Test loudnorm with EBU R128 settings
  const loudnormFilter = buildLoudnorm({
    i: -16,  // VO standard
    lra: 11,
    tp: -1.0
  });
  console.log('Loudnorm filter:', loudnormFilter);
  
  // Test silence gate
  const gateFilter = buildSilenceGate(0.02);
  console.log('Silence gate filter:', gateFilter);
  
  // Test limiter
  const limiterFilter = buildLimiter(-1.0);
  console.log('Limiter filter:', limiterFilter);
  
  console.log('AudioLoudness tests completed.');
}