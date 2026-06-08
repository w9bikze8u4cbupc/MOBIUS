/**
 * Audio mastering plan generation.
 *
 * Produces deterministic mastering metadata and FFmpeg filter plans for
 * loudness normalization, true-peak limiting, and silence validation.
 * Does not execute processing — returns planning/command metadata only.
 */

import path from 'path';

/** Default mastering targets aligned with MOBIUS Elite audio standards. */
const DEFAULT_MASTERING_TARGETS = {
  targetIntegratedLufs: -14,
  lufsTolerance: 0.5,
  truePeakLimitDbtp: -1.0,
  clippingLimitDbfs: 0.0,
  silenceThresholdMs: 5000,
  audioCodec: 'aac',
  audioBitrate: '192k',
  sampleRate: 48000,
};

/**
 * Build an audio mastering plan from input audio and optional analyzer results.
 *
 * @param {string} inputAudioPath - Path to narration/muxed audio
 * @param {Object} [analyzerResult] - { integratedLufs, truePeakDbtp, maxPeakDbfs, silenceSegments }
 * @param {Object} [options] - Override targets, dryRun flag
 * @returns {{ enabled, status, inputAudioPath, outputAudioPath, targets, analyzerStatus, ffmpegArgs, dryRun, duckingPreparation, warnings }}
 */
export function buildAudioMasteringPlan(inputAudioPath, analyzerResult = null, options = {}) {
  const targets = { ...DEFAULT_MASTERING_TARGETS, ...options.targets };
  const dryRun = options.dryRun ?? true;
  const warnings = [];

  // Validate input
  if (!inputAudioPath) {
    return {
      enabled: false,
      status: 'disabled',
      inputAudioPath: null,
      outputAudioPath: null,
      targets,
      analyzerStatus: 'missing',
      ffmpegArgs: [],
      dryRun,
      duckingPreparation: buildDuckingMetadata(),
      warnings: ['No input audio path provided'],
    };
  }

  // Compute output path
  const dir = path.dirname(inputAudioPath);
  const baseName = path.basename(inputAudioPath, path.extname(inputAudioPath));
  const outputAudioPath = path.join(dir, `${baseName}-mastered.m4a`);

  // Analyze current state
  let analyzerStatus = 'missing';
  let status = 'warn';

  if (analyzerResult) {
    const { integratedLufs, truePeakDbtp, maxPeakDbfs, silenceSegments } = analyzerResult;

    analyzerStatus = 'available';

    // Clipping check
    if (maxPeakDbfs != null && maxPeakDbfs >= targets.clippingLimitDbfs) {
      status = 'fail';
      warnings.push(`Clipping detected: ${maxPeakDbfs.toFixed(1)} dBFS >= ${targets.clippingLimitDbfs} dBFS`);
    }

    // True peak check
    const peakValue = truePeakDbtp ?? maxPeakDbfs;
    if (peakValue != null && peakValue > targets.truePeakLimitDbtp) {
      if (status !== 'fail') status = 'fail';
      warnings.push(`True peak ${peakValue.toFixed(1)} dBTP exceeds limit ${targets.truePeakLimitDbtp} dBTP — limiting required`);
    }

    // Loudness check
    if (integratedLufs != null) {
      const diff = Math.abs(integratedLufs - targets.targetIntegratedLufs);
      if (diff > targets.lufsTolerance * 2) {
        if (status !== 'fail') status = 'warn';
        warnings.push(`Integrated loudness ${integratedLufs.toFixed(1)} LUFS far from target ${targets.targetIntegratedLufs} LUFS — normalization required`);
      } else if (diff <= targets.lufsTolerance) {
        if (status !== 'fail') status = 'pass';
      } else {
        if (status !== 'fail') status = 'warn';
        warnings.push(`Integrated loudness ${integratedLufs.toFixed(1)} LUFS outside ±${targets.lufsTolerance} tolerance`);
      }
    }

    // Silence check
    if (Array.isArray(silenceSegments)) {
      for (const seg of silenceSegments) {
        const duration = (seg.endMs || 0) - (seg.startMs || 0);
        if (duration > targets.silenceThresholdMs) {
          warnings.push(`Silence at ${seg.startMs}ms–${seg.endMs}ms (${duration}ms) exceeds ${targets.silenceThresholdMs}ms`);
        }
      }
    }
  } else {
    warnings.push('No analyzer data available — mastering plan is advisory only');
    status = 'warn';
  }

  // Build FFmpeg loudnorm filter args
  const ffmpegArgs = buildMasteringFfmpegArgs({
    inputAudioPath,
    outputAudioPath,
    targets,
  });

  return {
    enabled: true,
    status,
    inputAudioPath,
    outputAudioPath,
    targets,
    analyzerStatus,
    ffmpegArgs,
    dryRun,
    duckingPreparation: buildDuckingMetadata(),
    warnings,
  };
}

/**
 * Build FFmpeg args for loudness normalization using loudnorm filter.
 */
function buildMasteringFfmpegArgs({ inputAudioPath, outputAudioPath, targets }) {
  return [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-i', inputAudioPath,
    '-af', `loudnorm=I=${targets.targetIntegratedLufs}:TP=${targets.truePeakLimitDbtp}:LRA=11`,
    '-ar', String(targets.sampleRate),
    '-c:a', targets.audioCodec,
    '-b:a', targets.audioBitrate,
    outputAudioPath,
  ];
}

/**
 * Ducking preparation metadata (future-ready, not implemented yet).
 */
function buildDuckingMetadata() {
  return {
    duckingPrepared: false,
    narrationPriority: true,
    musicBedSupported: false,
    recommendedMusicDuckDb: 18,
  };
}

export { DEFAULT_MASTERING_TARGETS, buildMasteringFfmpegArgs, buildDuckingMetadata };
