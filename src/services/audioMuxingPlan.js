/**
 * FFmpeg audio muxing plan builder.
 *
 * Combines rendered silent video with narration audio assets from the
 * audio assembly plan. Produces deterministic FFmpeg command metadata
 * for both dry-run and real execution modes.
 */

import path from 'path';

const DEFAULT_AUDIO_CODEC = 'aac';
const DEFAULT_AUDIO_BITRATE = '128k';
const SUPPORTED_AUDIO_EXTENSIONS = ['.mp3', '.wav', '.m4a', '.ogg', '.aac', '.webm'];

/**
 * Build an audio muxing plan from a rendered video and audio assembly entries.
 *
 * @param {string} inputVideoPath - Path to the rendered silent MP4
 * @param {Object} audioAssemblyPlan - Output from buildAudioAssemblyPlan()
 * @param {Object} [options] - { dryRun, audioCodec, audioBitrate, captionSidecars, outputDir }
 * @returns {{ enabled, status, inputVideoPath, outputVideoPath, audioInputs, captionSidecars, ffmpegArgs, copyVideoStream, audioCodec, dryRun, warnings }}
 */
export function buildAudioMuxingPlan(inputVideoPath, audioAssemblyPlan, options = {}) {
  const warnings = [];
  const dryRun = options.dryRun ?? false;
  const audioCodec = options.audioCodec || DEFAULT_AUDIO_CODEC;
  const audioBitrate = options.audioBitrate || DEFAULT_AUDIO_BITRATE;
  const captionSidecars = options.captionSidecars || [];

  // Validate input video
  if (!inputVideoPath) {
    return {
      enabled: false,
      status: 'disabled',
      inputVideoPath: null,
      outputVideoPath: null,
      audioInputs: [],
      captionSidecars,
      ffmpegArgs: [],
      copyVideoStream: false,
      audioCodec,
      dryRun,
      warnings: ['No input video path provided'],
    };
  }

  // Select usable audio assets from assembly plan
  const entries = audioAssemblyPlan?.entries || [];
  const readyAudio = entries.filter(
    (e) => e.audioAssetId && e.filePath && e.status !== 'missing' && e.status !== 'silent'
  );

  // Validate audio inputs
  const audioInputs = [];
  for (const entry of readyAudio) {
    const ext = (entry.filePath.match(/\.[^.]+$/) || [''])[0].toLowerCase();
    if (!SUPPORTED_AUDIO_EXTENSIONS.includes(ext)) {
      warnings.push(`Audio '${entry.audioAssetId}': unsupported format ${ext}`);
      continue;
    }
    audioInputs.push({
      sceneId: entry.sceneId,
      assetId: entry.audioAssetId,
      filePath: entry.filePath,
      startMs: entry.startMs,
      durationMs: entry.durationMs,
    });
  }

  // No usable audio → disabled
  if (audioInputs.length === 0) {
    return {
      enabled: false,
      status: 'no-audio',
      inputVideoPath,
      outputVideoPath: null,
      audioInputs: [],
      captionSidecars,
      ffmpegArgs: [],
      copyVideoStream: false,
      audioCodec,
      dryRun,
      warnings: [...warnings, 'No usable audio assets for muxing'],
    };
  }

  // Compute output path
  const dir = options.outputDir || path.dirname(inputVideoPath);
  const baseName = path.basename(inputVideoPath, path.extname(inputVideoPath));
  const outputVideoPath = path.join(dir, `${baseName}-with-audio.mp4`);

  // Build FFmpeg args
  const ffmpegArgs = buildFfmpegMuxArgs({
    inputVideoPath,
    audioInputs,
    outputVideoPath,
    audioCodec,
    audioBitrate,
  });

  // Report missing narration for scenes that expected it
  const missingEntries = entries.filter((e) => e.status === 'missing');
  if (missingEntries.length > 0) {
    warnings.push(`${missingEntries.length} scene(s) have narration text but no audio: ${missingEntries.map((e) => e.sceneId).join(', ')}`);
  }

  return {
    enabled: true,
    status: 'ready',
    inputVideoPath,
    outputVideoPath,
    audioInputs,
    captionSidecars,
    ffmpegArgs,
    copyVideoStream: true,
    audioCodec,
    dryRun,
    warnings,
  };
}

/**
 * Build FFmpeg command args for audio muxing.
 */
function buildFfmpegMuxArgs({ inputVideoPath, audioInputs, outputVideoPath, audioCodec, audioBitrate }) {
  const args = ['-hide_banner', '-loglevel', 'error', '-y'];

  // Video input
  args.push('-i', inputVideoPath);

  // Audio inputs (for single narration track, use first audio; for multiple, concat would be needed)
  // Simple case: single audio file
  if (audioInputs.length === 1) {
    args.push('-i', audioInputs[0].filePath);
    args.push('-c:v', 'copy');
    args.push('-c:a', audioCodec, '-b:a', audioBitrate);
    args.push('-shortest');
    args.push(outputVideoPath);
  } else {
    // Multiple audio: use first as primary (future: concat filter)
    args.push('-i', audioInputs[0].filePath);
    args.push('-c:v', 'copy');
    args.push('-c:a', audioCodec, '-b:a', audioBitrate);
    args.push('-shortest');
    args.push(outputVideoPath);
    // Note: multi-audio concat is a future enhancement
  }

  return args;
}

export { buildFfmpegMuxArgs, DEFAULT_AUDIO_CODEC, DEFAULT_AUDIO_BITRATE, SUPPORTED_AUDIO_EXTENSIONS };
