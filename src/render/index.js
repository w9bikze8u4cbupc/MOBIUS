/**
 * Video rendering pipeline for Mobius Tutorial Generator
 * Orchestrates FFmpeg to create video outputs from game tutorial assets
 */

import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { ProgressParser } from './progress.js';
import { CheckpointManager } from './checkpoint.js';
import { renderStarted, renderCompleted, renderFailed, renderTimeout, renderDuration, ffmpegSpeedRatio } from './metrics.js';
import { logger } from './log.js';

/**
 * Main render function that orchestrates FFmpeg to create video outputs
 * @param {Object} job Render job configuration
 * @param {string[]} job.images Array of image file paths
 * @param {string} job.audioFile Path to audio file
 * @param {Object} job.captions Caption data
 * @param {Array<{start: number, end: number, text: string}>} job.captions.items Caption items
 * @param {string} job.captions.srtPath Prebuilt SRT file path
 * @param {string} job.narration Path to narration audio file
 * @param {string} job.bgm Path to background music file
 * @param {string} job.outputDir Output directory
 * @param {number} job.duration Desired duration in seconds
 * @param {Object} options Rendering options
 * @param {number} options.previewSeconds Generate a preview of specified seconds
 * @param {boolean} options.dryRun Simulate without actual rendering
 * @param {boolean} options.burnCaptions Burn-in captions instead of sidecar
 * @param {boolean} options.exportSrt Export SRT sidecar file
 * @param {Object} options.ducking Audio ducking configuration
 * @param {string} options.ducking.mode Ducking mode ('sidechain' or 'envelope')
 * @param {number} options.ducking.threshold Sidechain threshold
 * @param {number} options.ducking.ratio Sidechain ratio
 * @param {number} options.ducking.attackMs Sidechain attack time in ms
 * @param {number} options.ducking.releaseMs Sidechain release time in ms
 * @param {number} options.ducking.duckGain Envelope duck gain (0.0-1.0)
 * @param {number} options.ducking.fadeMs Envelope fade time in ms
 * @param {Object} options.loudness Loudness normalization configuration
 * @param {boolean} options.loudness.enabled Whether to enable loudness normalization
 * @param {number} options.loudness.targetI Target integrated loudness (LUFS)
 * @param {number} options.loudness.lra Loudness range target
 * @param {number} options.loudness.tp True peak target (dBTP)
 * @param {Object} options.safetyFilters Safety filter configuration
 * @param {number} options.safetyFilters.highpassHz High-pass filter frequency
 * @param {number} options.safetyFilters.lowpassHz Low-pass filter frequency
 * @param {boolean} options.safetyFilters.limiter Whether to apply a limiter
 * @param {Object} options.caps Render capability limits
 * @param {number} options.caps.maxWidth Maximum output width
 * @param {number} options.caps.maxHeight Maximum output height
 * @param {number} options.caps.maxFps Maximum frame rate
 * @param {number} options.caps.maxBitrateKbps Maximum bitrate in kbps
 * @param {string} options.outputDir Override output directory
 * @param {number} options.timeoutMs Timeout in milliseconds
 * @param {string} options.jobId Unique identifier for checkpointing
 * @param {string} options.sessionId Unique identifier for logging correlation
 * @returns {Promise<Object>} Promise that resolves to render result metadata
 */
export async function render(job, options = {}) {
  // Generate a session ID for correlation
  const sessionId = options.sessionId || Math.random().toString(36).substring(2, 15);
  const jobId = options.jobId || 'default';
  
  // Create a logger with context
  const log = logger.withContext({ sessionId, jobId });
  
  // Record start time for metrics
  const startTime = Date.now();
  
  // Increment started counter
  renderStarted.inc();
  
  // Log render start
  log.info('Render started', {
    imagesCount: job.images ? job.images.length : 0,
    hasAudio: !!(job.audioFile || job.narration || job.bgm),
    previewSeconds: options.previewSeconds,
    burnCaptions: options.burnCaptions,
    exportSrt: options.exportSrt,
    loudnessEnabled: options.loudness?.enabled,
    safetyFilters: options.safetyFilters,
    caps: options.caps
  });

  // Validate inputs
  if (!job.images || job.images.length === 0) {
    throw new Error('No images provided for rendering');
  }
  
  if (!job.audioFile && !job.narration && !job.bgm) {
    throw new Error('No audio file provided for rendering');
  }
  
  if (!job.outputDir) {
    throw new Error('No output directory specified');
  }
  
  // Apply caps validation
  if (options.caps) {
    validateCaps(job, options.caps, log);
  }
  
  // Handle checkpointing
  const checkpoint = new CheckpointManager(options.jobId || 'default', job.outputDir);
  const checkpointExists = await checkpoint.load();
  
  // Handle dry run
  if (options.dryRun) {
    console.log('[DRY RUN] Would render video with the following parameters:');
    console.log('  Images: ' + (job.images.length) + ' files');
    console.log('  Audio: ' + (job.audioFile || 'none'));
    console.log('  Narration: ' + (job.narration || 'none'));
    console.log('  BGM: ' + (job.bgm || 'none'));
    console.log('  Output directory: ' + job.outputDir);
    console.log('  Preview seconds: ' + (options.previewSeconds || 'full render'));
    console.log('  Burn captions: ' + (options.burnCaptions ? 'yes' : 'no'));
    console.log('  Export SRT: ' + (options.exportSrt ? 'yes' : 'no'));
    console.log('  Ducking: ' + (options.ducking ? options.ducking.mode : 'none'));
    console.log('  Loudness normalization: ' + (options.loudness?.enabled ? 'yes' : 'no'));
    console.log('  Safety filters: ' + (options.safetyFilters ? 'yes' : 'no'));
    console.log('  Caps: ' + JSON.stringify(options.caps));
    
    // Return mock result for dry run
    return {
      outputPath: path.join(job.outputDir, 'preview.mp4'),
      thumbnailPath: path.join(job.outputDir, 'thumbnail.jpg'),
      captionPath: (job.captions || options.exportSrt) ? path.join(job.outputDir, 'captions.srt') : undefined,
      metadata: {
        duration: options.previewSeconds || 30,
        fps: 30
      }
    };
  }
  
  // Initialize checkpoint if it doesn't exist
  if (!checkpointExists) {
    await checkpoint.initialize(options.jobId || 'default');
  }
  
  // Skip completed stages if resuming
  if (checkpoint.isStageCompleted('completed')) {
    console.log('Render job already completed, skipping...');
    const state = checkpoint.getState();
    return {
      outputPath: state.artifacts.output?.path,
      thumbnailPath: state.artifacts.thumbnail?.path,
      captionPath: state.artifacts.caption?.path,
      metadata: state.metadata
    };
  }
  
  // Determine output paths
  const outputFileName = options.previewSeconds ? `preview_${options.previewSeconds}s.mp4` : 'output.mp4';
  const outputPath = path.join(job.outputDir, outputFileName);
  const thumbnailPath = path.join(job.outputDir, 'thumbnail.jpg');
  let captionPath;
  
  // Handle captions
  if (job.captions) {
    // If we need to burn captions or export SRT, ensure we have an SRT file
    if (options.burnCaptions || options.exportSrt) {
      if (job.captions.srtPath) {
        // Use provided SRT file
        captionPath = job.captions.srtPath;
      } else if (job.captions.items && job.captions.items.length > 0) {
        // Generate SRT file from caption items
        // We'll implement this when we add the subtitles module
        console.log('Would generate SRT from caption items');
      }
    }
  }
  
  // Build FFmpeg command
  const ffmpegArgs = buildFFmpegCommand(job, options, outputPath, captionPath);
  
  // Execute FFmpeg with progress tracking
  const result = await executeFFmpegWithProgress(ffmpegArgs, options.timeoutMs || 300000, (progress) => {
    // Log progress
    log.progress(progress, 'rendering');
    
    // Record speed metric
    if (progress.speed) {
      ffmpegSpeedRatio.observe(progress.speed);
    }
    
    console.log(`Progress: ${progress.percent.toFixed(1)}% ETA: ${progress.eta} Speed: ${progress.speed}x`);
  });
  
  // Generate thumbnail
  if (!checkpoint.isStageCompleted('thumbnail')) {
    await generateThumbnail(outputPath, thumbnailPath);
    await checkpoint.addArtifact('thumbnail', thumbnailPath, 0); // Size would be determined in real implementation
    await checkpoint.updateStage('thumbnail', 90);
  }
  
  // Mark job as completed
  await checkpoint.markCompleted();
  
  // Record completion metrics
  const duration = (Date.now() - startTime) / 1000; // Convert to seconds
  renderDuration.observe(duration);
  renderCompleted.inc();
  
  // Log completion
  log.info('Render completed successfully', {
    duration,
    outputPath,
    thumbnailPath,
    captionPath
  });

  // Return result
  return {
    outputPath,
    thumbnailPath,
    captionPath,
    metadata: {
      duration: options.previewSeconds || job.duration || 30,
      fps: 30,
      ...result.metadata
    }
  };
}

/**
 * Validates job against capability limits
 * @param {Object} job Render job configuration
 * @param {Object} caps Capability limits
 * @param {Object} log Logger instance
 */
function validateCaps(job, caps, log) {
  // This would be implemented to validate inputs against caps
  // For now, we'll just log that validation is enabled
  log.info('Capability validation enabled', { caps });
}

/**
 * Builds FFmpeg command arguments based on job and options
 * @param {Object} job Render job configuration
 * @param {Object} options Rendering options
 * @param {string} outputPath Path where output video will be saved
 * @param {string} captionPath Path to caption file (if applicable)
 * @returns {string[]} Array of FFmpeg command arguments
 */
function buildFFmpegCommand(job, options, outputPath, captionPath) {
  const args = [];
  
  // Add progress reporting
  args.push('-progress', 'pipe:1');
  
  // Handle preview mode
  if (options.previewSeconds && job.images.length > 1) {
    // For preview, limit the number of images based on preview duration
    const imageCount = Math.min(job.images.length, options.previewSeconds * 2); // 2 images per second
    const images = job.images.slice(0, imageCount);
    
    // Create concat demuxer input
    args.push('-f', 'concat', '-safe', '0', '-i', 'pipe:0');
    
    // Add audio inputs
    let audioInputIndex = 1;
    
    if (job.narration) {
      args.push('-i', job.narration);
      audioInputIndex++;
    }
    
    if (job.bgm) {
      args.push('-i', job.bgm);
      audioInputIndex++;
    }
    
    if (job.audioFile && !job.narration && !job.bgm) {
      args.push('-i', job.audioFile);
      audioInputIndex++;
    }
    
    // Video codec
    args.push('-c:v', 'libx264');
    
    // Pixel format
    args.push('-pix_fmt', 'yuv420p');
    
    // Audio codec
    args.push('-c:a', 'aac');
    
    // Handle audio processing chain
    const audioFilters = buildAudioFilterChain(options, audioInputIndex);
    if (audioFilters) {
      args.push('-af', audioFilters);
    }
    
    // Handle burned-in captions
    if (options.burnCaptions && captionPath) {
      // Escape path for Windows
      const escapedPath = captionPath.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "'\\\\''");
      args.push('-vf', `subtitles='${escapedPath}':force_style='Fontsize=24'`);
    }
    
    // Duration limit for preview
    args.push('-t', options.previewSeconds.toString());
    
    // Output file
    args.push('-y', outputPath);
    
    return args;
  }
  
  // Full render mode
  // Create concat demuxer input
  args.push('-f', 'concat', '-safe', '0', '-i', 'pipe:0');
  
  // Add audio inputs
  let audioInputIndex = 1;
  
  if (job.narration) {
    args.push('-i', job.narration);
    audioInputIndex++;
  }
  
  if (job.bgm) {
    args.push('-i', job.bgm);
    audioInputIndex++;
  }
  
  if (job.audioFile && !job.narration && !job.bgm) {
    args.push('-i', job.audioFile);
    audioInputIndex++;
  }
  
  // Video codec
  args.push('-c:v', 'libx264');
  
  // Pixel format
  args.push('-pix_fmt', 'yuv420p');
  
  // Audio codec
  args.push('-c:a', 'aac');
  
  // Handle audio processing chain
  const audioFilters = buildAudioFilterChain(options, audioInputIndex);
  if (audioFilters) {
    args.push('-af', audioFilters);
  }
  
  // Handle burned-in captions
  if (options.burnCaptions && captionPath) {
    // Escape path for Windows
    const escapedPath = captionPath.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "'\\\\''");
    args.push('-vf', `subtitles='${escapedPath}':force_style='Fontsize=24'`);
  }
  
  // Shortest stream determines output duration
  args.push('-shortest');
  
  // Output file
  args.push('-y', outputPath);
  
  return args;
}

/**
 * Builds the audio filter chain based on options
 * @param {Object} options Rendering options
 * @param {number} audioInputIndex Index of the audio input
 * @returns {string|null} Audio filter chain or null if no filters needed
 */
function buildAudioFilterChain(options, audioInputIndex) {
  const filters = [];
  
  // Handle audio ducking
  if (options.ducking) {
    // We'll implement this when we add the audio ducking module
    console.log('Would apply audio ducking');
  }
  
  // Handle loudness normalization
  if (options.loudness?.enabled) {
    const loudness = options.loudness;
    filters.push(`loudnorm=I=${loudness.targetI || -16}:LRA=${loudness.lra || 11}:TP=${loudness.tp || -1.5}:print_format=summary`);
  }
  
  // Handle safety filters
  if (options.safetyFilters) {
    const safety = options.safetyFilters;
    
    // Apply high-pass filter if configured
    if (safety.highpassHz) {
      filters.push(`highpass=f=${safety.highpassHz}`);
    }
    
    // Apply low-pass filter if configured
    if (safety.lowpassHz) {
      filters.push(`lowpass=f=${safety.lowpassHz}`);
    }
    
    // Apply limiter if configured
    if (safety.limiter) {
      filters.push('alimiter=limit=-1.0');
    }
  }
  
  return filters.length > 0 ? filters.join(',') : null;
}

/**
 * Executes FFmpeg with progress tracking
 * @param {string[]} args FFmpeg command arguments
 * @param {number} timeoutMs Timeout in milliseconds
 * @param {Function} onProgress Progress callback
 * @returns {Promise<Object>} Promise that resolves with result metadata
 */
function executeFFmpegWithProgress(args, timeoutMs, onProgress) {
  return new Promise((resolve, reject) => {
    console.log('Executing FFmpeg with args: ffmpeg ' + args.join(' '));
    
    const ffmpeg = spawn('ffmpeg', args, {
      stdio: ['pipe', 'pipe', 'pipe'] // stdin, stdout, stderr
    });
    
    const parser = new ProgressParser();
    
    parser.start(
      ffmpeg,
      (progress) => {
        onProgress(progress);
      },
      (metadata) => {
        resolve({ metadata });
      },
      (error) => {
        // Record failure with reason
        renderFailed.inc({ reason: 'ffmpeg_error' });
        reject(error);
      }
    );
    
    // Set timeout
    const timeout = setTimeout(async () => {
      console.log('Render timeout reached, attempting graceful shutdown...');
      await parser.kill(5000); // 5 second grace period
      // Record timeout failure
      renderTimeout.inc({ reason: 'timeout' });
      reject(new Error(`FFmpeg execution timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    
    // Handle process completion
    ffmpeg.on('close', (code) => {
      clearTimeout(timeout);
      if (code === 0) {
        resolve({ metadata: {} });
      } else {
        // Record failure with reason
        renderFailed.inc({ reason: 'ffmpeg_exit_' + code });
        reject(new Error(`FFmpeg exited with code ${code}`));
      }
    });
    
    // Handle process errors
    ffmpeg.on('error', (err) => {
      clearTimeout(timeout);
      // Record failure with reason
      renderFailed.inc({ reason: 'spawn_error' });
      reject(new Error(`FFmpeg failed to start: ${err.message}`));
    });
  });
}

/**
 * Generates a thumbnail from the video at 3 seconds
 * @param {string} videoPath Path to the video file
 * @param {string} thumbnailPath Path where thumbnail will be saved
 * @returns {Promise<void>} Promise that resolves when thumbnail is generated
 */
async function generateThumbnail(videoPath, thumbnailPath) {
  const args = [
    '-ss', '00:00:03', // Seek to 3 seconds
    '-i', videoPath,   // Input video
    '-frames:v', '1',  // Extract 1 frame
    '-q:v', '2',       // Quality (2 is high quality)
    '-y', thumbnailPath // Output file
  ];
  
  return new Promise((resolve, reject) => {
    console.log('Generating thumbnail with args: ffmpeg ' + args.join(' '));
    
    const ffmpeg = spawn('ffmpeg', args);
    
    // Handle process completion
    ffmpeg.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Thumbnail generation failed with code ${code}`));
      }
    });
    
    // Handle process errors
    ffmpeg.on('error', (err) => {
      reject(new Error(`Thumbnail generation failed to start: ${err.message}`));
    });
  });
}