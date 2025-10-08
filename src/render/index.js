/**
 * Video rendering pipeline for Mobius Tutorial Generator
 * Orchestrates FFmpeg to create video outputs from game tutorial assets
 */

import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';

/**
 * Main render function that orchestrates FFmpeg to create video outputs
 * @param {Object} job Render job configuration
 * @param {string[]} job.images Array of image file paths
 * @param {string} job.audioFile Path to audio file
 * @param {string} job.subtitleFile Path to subtitle file (optional)
 * @param {string} job.outputDir Output directory
 * @param {number} job.duration Desired duration in seconds
 * @param {Object} options Rendering options
 * @param {number} options.previewSeconds Generate a preview of specified seconds
 * @param {boolean} options.dryRun Simulate without actual rendering
 * @param {boolean} options.burnCaptions Burn-in captions instead of sidecar
 * @param {string} options.outputDir Override output directory
 * @param {number} options.timeoutMs Timeout in milliseconds
 * @returns {Promise<Object>} Promise that resolves to render result metadata
 */
export async function render(job, options = {}) {
  // Validate inputs
  if (!job.images || job.images.length === 0) {
    throw new Error('No images provided for rendering');
  }
  
  if (!job.audioFile) {
    throw new Error('No audio file provided for rendering');
  }
  
  if (!job.outputDir) {
    throw new Error('No output directory specified');
  }
  
  // Ensure output directory exists
  await fs.mkdir(job.outputDir, { recursive: true });
  
  // Handle dry run
  if (options.dryRun) {
    console.log('[DRY RUN] Would render video with the following parameters:');
    console.log(`  Images: ${job.images.length} files`);
    console.log(`  Audio: ${job.audioFile}`);
    console.log(`  Output directory: ${job.outputDir}`);
    console.log(`  Preview seconds: ${options.previewSeconds || 'full render'}`);
    console.log(`  Burn captions: ${options.burnCaptions ? 'yes' : 'no'}`);
    
    // Return mock result for dry run
    return {
      outputPath: path.join(job.outputDir, 'preview.mp4'),
      thumbnailPath: path.join(job.outputDir, 'thumbnail.jpg'),
      captionPath: job.subtitleFile ? path.join(job.outputDir, 'captions.srt') : undefined,
      metadata: {
        duration: options.previewSeconds || 30,
        fps: 30
      }
    };
  }
  
  // Determine output paths
  const outputFileName = options.previewSeconds ? `preview_${options.previewSeconds}s.mp4` : 'output.mp4';
  const outputPath = path.join(job.outputDir, outputFileName);
  const thumbnailPath = path.join(job.outputDir, 'thumbnail.jpg');
  const captionPath = job.subtitleFile ? path.join(job.outputDir, 'captions.srt') : undefined;
  
  // Build FFmpeg command
  const ffmpegArgs = buildFFmpegCommand(job, options, outputPath);
  
  // Execute FFmpeg
  await executeFFmpeg(ffmpegArgs, options.timeoutMs || 300000); // 5 minute default timeout
  
  // Generate thumbnail
  await generateThumbnail(outputPath, thumbnailPath);
  
  // Return result
  return {
    outputPath,
    thumbnailPath,
    captionPath,
    metadata: {
      duration: options.previewSeconds || job.duration || 30,
      fps: 30
    }
  };
}

/**
 * Builds FFmpeg command arguments based on job and options
 * @param {Object} job Render job configuration
 * @param {Object} options Rendering options
 * @param {string} outputPath Path where output video will be saved
 * @returns {string[]} Array of FFmpeg command arguments
 */
function buildFFmpegCommand(job, options, outputPath) {
  const args = [];
  
  // Handle preview mode
  if (options.previewSeconds && job.images.length > 1) {
    // For preview, limit the number of images based on preview duration
    const imageCount = Math.min(job.images.length, options.previewSeconds * 2); // 2 images per second
    const images = job.images.slice(0, imageCount);
    
    // Create concat demuxer input
    args.push('-f', 'concat', '-safe', '0', '-i', 'pipe:0');
    
    // Add audio input
    args.push('-i', job.audioFile);
    
    // Video codec
    args.push('-c:v', 'libx264');
    
    // Pixel format
    args.push('-pix_fmt', 'yuv420p');
    
    // Audio codec
    args.push('-c:a', 'aac');
    
    // Duration limit for preview
    args.push('-t', options.previewSeconds.toString());
    
    // Output file
    args.push('-y', outputPath);
    
    return args;
  }
  
  // Full render mode
  // Create concat demuxer input
  args.push('-f', 'concat', '-safe', '0', '-i', 'pipe:0');
  
  // Add audio input
  args.push('-i', job.audioFile);
  
  // Video codec
  args.push('-c:v', 'libx264');
  
  // Pixel format
  args.push('-pix_fmt', 'yuv420p');
  
  // Audio codec
  args.push('-c:a', 'aac');
  
  // Shortest stream determines output duration
  args.push('-shortest');
  
  // Output file
  args.push('-y', outputPath);
  
  return args;
}

/**
 * Executes FFmpeg with the provided arguments
 * @param {string[]} args FFmpeg command arguments
 * @param {number} timeoutMs Timeout in milliseconds
 * @returns {Promise<void>} Promise that resolves when FFmpeg completes
 */
function executeFFmpeg(args, timeoutMs) {
  return new Promise((resolve, reject) => {
    console.log(`Executing FFmpeg with args: ffmpeg ${args.join(' ')}`);
    
    const ffmpeg = spawn('ffmpeg', args, {
      stdio: ['pipe', 'inherit', 'inherit'] // stdin, stdout, stderr
    });
    
    // Set timeout
    const timeout = setTimeout(() => {
      ffmpeg.kill();
      reject(new Error(`FFmpeg execution timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    
    // Handle process completion
    ffmpeg.on('close', (code) => {
      clearTimeout(timeout);
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`FFmpeg exited with code ${code}`));
      }
    });
    
    // Handle process errors
    ffmpeg.on('error', (err) => {
      clearTimeout(timeout);
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
    console.log(`Generating thumbnail with args: ffmpeg ${args.join(' ')}`);
    
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