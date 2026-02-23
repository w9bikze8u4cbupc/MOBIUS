#!/usr/bin/env node
// scripts/releases/verify-pro-video-v0.mjs
// Machine QC verification for Professional Video v0 artifacts

import { readFileSync, existsSync, statSync } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';
import crypto from 'crypto';

/**
 * Verify Pro Video v0 artifacts and generate objective QC report
 * @param {string} outputDir - Directory containing artifacts
 * @param {object} options - Verification options
 * @returns {object} Objective QC report
 */
export async function verifyProVideoV0(outputDir, options = {}) {
  const report = {
    version: '1.0',
    timestamp: new Date().toISOString(),
    outputDir,
    status: 'PASS',
    errors: [],
    warnings: [],
    artifacts: {},
    technical: {}
  };

  try {
    // 1. Verify required artifacts exist
    await verifyArtifactExistence(outputDir, report);

    // 2. Verify video file
    if (report.artifacts.video?.exists) {
      await verifyVideo(report.artifacts.video.path, report);
    }

    // 3. Verify captions
    if (report.artifacts.captions?.exists) {
      await verifyCaptions(report.artifacts.captions.path, report);
    }

    // 4. Verify chapters
    if (report.artifacts.chapters?.exists) {
      await verifyChapters(report.artifacts.chapters.path, report);
    }

    // 5. Verify manifest and checksums
    if (report.artifacts.manifest?.exists) {
      await verifyManifest(report.artifacts.manifest.path, outputDir, report);
    }

    // 6. Verify thumbnail
    if (report.artifacts.thumbnail?.exists) {
      await verifyThumbnail(report.artifacts.thumbnail.path, report);
    }

    // Determine final status
    if (report.errors.length > 0) {
      report.status = 'FAIL';
    } else if (report.warnings.length > 0) {
      report.status = 'PASS_WITH_WARNINGS';
    }

  } catch (error) {
    report.status = 'ERROR';
    report.errors.push({
      type: 'VERIFICATION_ERROR',
      message: error.message,
      stack: error.stack
    });
  }

  return report;
}

function verifyArtifactExistence(outputDir, report) {
  const requiredArtifacts = {
    video: ['output.mp4', 'preview_10s.mp4', 'preview_30s.mp4'],
    captions: ['captions_en.srt', 'captions_fr.srt'],
    chapters: ['chapters_en.json', 'chapters_fr.json'],
    manifest: ['render_manifest.json'],
    thumbnail: ['thumbnail.jpg']
  };

  for (const [type, possibleNames] of Object.entries(requiredArtifacts)) {
    let found = false;
    let foundPath = null;

    for (const name of possibleNames) {
      const path = join(outputDir, name);
      if (existsSync(path)) {
        found = true;
        foundPath = path;
        break;
      }
    }

    report.artifacts[type] = {
      exists: found,
      path: foundPath,
      size: found ? statSync(foundPath).size : 0
    };

    if (!found && type !== 'thumbnail') {
      // Thumbnail is optional for some profiles
      report.errors.push({
        type: 'MISSING_ARTIFACT',
        artifact: type,
        message: `Required artifact not found: ${possibleNames.join(' or ')}`
      });
    }
  }
}

async function verifyVideo(videoPath, report) {
  try {
    // Use ffprobe to extract video metadata
    const ffprobeCmd = `ffprobe -v error -show_format -show_streams -of json "${videoPath}"`;
    const output = execSync(ffprobeCmd, { encoding: 'utf8' });
    const metadata = JSON.parse(output);

    // Extract video stream
    const videoStream = metadata.streams?.find(s => s.codec_type === 'video');
    const audioStream = metadata.streams?.find(s => s.codec_type === 'audio');

    if (!videoStream) {
      report.errors.push({
        type: 'VIDEO_STREAM_MISSING',
        message: 'No video stream found in MP4'
      });
      return;
    }

    if (!audioStream) {
      report.errors.push({
        type: 'AUDIO_STREAM_MISSING',
        message: 'No audio stream found in MP4'
      });
      return;
    }

    // Record technical details
    report.technical.video = {
      duration: parseFloat(metadata.format.duration),
      size: parseInt(metadata.format.size),
      bitrate: parseInt(metadata.format.bit_rate),
      codec: videoStream.codec_name,
      width: videoStream.width,
      height: videoStream.height,
      fps: eval(videoStream.r_frame_rate), // e.g., "30/1" -> 30
      pixelFormat: videoStream.pix_fmt
    };

    report.technical.audio = {
      codec: audioStream.codec_name,
      sampleRate: parseInt(audioStream.sample_rate),
      channels: audioStream.channels,
      bitrate: parseInt(audioStream.bit_rate || 0)
    };

    // Validate expected values
    if (report.technical.video.width !== 1920 || report.technical.video.height !== 1080) {
      report.warnings.push({
        type: 'RESOLUTION_MISMATCH',
        message: `Expected 1920x1080, got ${report.technical.video.width}x${report.technical.video.height}`
      });
    }

    if (Math.abs(report.technical.video.fps - 30) > 0.1) {
      report.warnings.push({
        type: 'FPS_MISMATCH',
        message: `Expected 30 fps, got ${report.technical.video.fps.toFixed(2)} fps`
      });
    }

    // Best-effort loudness measurement
    try {
      await measureLoudness(videoPath, report);
    } catch (error) {
      report.warnings.push({
        type: 'LOUDNESS_MEASUREMENT_FAILED',
        message: `Could not measure loudness: ${error.message}`
      });
    }

  } catch (error) {
    report.errors.push({
      type: 'VIDEO_VERIFICATION_FAILED',
      message: `ffprobe failed: ${error.message}`
    });
  }
}

async function measureLoudness(videoPath, report) {
  try {
    // Use ffmpeg loudnorm filter to measure loudness
    const ffmpegCmd = `ffmpeg -i "${videoPath}" -af loudnorm=print_format=json -f null - 2>&1`;
    const output = execSync(ffmpegCmd, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });

    // Extract JSON from output (it's in stderr after the analysis)
    const jsonMatch = output.match(/\{[\s\S]*"input_i"[\s\S]*\}/);
    if (jsonMatch) {
      const loudnessData = JSON.parse(jsonMatch[0]);

      report.technical.loudness = {
        integratedLUFS: parseFloat(loudnessData.input_i),
        truePeakDBTP: parseFloat(loudnessData.input_tp),
        loudnessRangeLU: parseFloat(loudnessData.input_lra),
        thresholdLUFS: parseFloat(loudnessData.input_thresh)
      };

      // Check against Pro v0 targets
      const targetLUFS = -14;
      const targetTP = -1.0;
      const tolerance = 2.0;

      if (Math.abs(report.technical.loudness.integratedLUFS - targetLUFS) > tolerance) {
        report.warnings.push({
          type: 'LOUDNESS_OUT_OF_RANGE',
          message: `Integrated loudness ${report.technical.loudness.integratedLUFS.toFixed(1)} LUFS is outside target ${targetLUFS} ±${tolerance} LUFS`
        });
      }

      if (report.technical.loudness.truePeakDBTP > targetTP) {
        report.warnings.push({
          type: 'TRUE_PEAK_EXCEEDED',
          message: `True peak ${report.technical.loudness.truePeakDBTP.toFixed(1)} dBTP exceeds target ${targetTP} dBTP`
        });
      }
    }
  } catch (error) {
    // Non-fatal: loudness measurement is best-effort
    throw error;
  }
}

async function verifyCaptions(captionPath, report) {
  try {
    const content = readFileSync(captionPath, 'utf8');

    // Parse SRT format
    const cues = parseSRT(content);

    if (cues.length === 0) {
      report.errors.push({
        type: 'EMPTY_CAPTIONS',
        message: 'Caption file contains no cues'
      });
      return;
    }

    report.technical.captions = {
      format: 'SRT',
      cueCount: cues.length,
      totalDuration: cues[cues.length - 1].end - cues[0].start,
      encoding: 'UTF-8'
    };

    // Verify timestamps are monotonic
    for (let i = 1; i < cues.length; i++) {
      if (cues[i].start < cues[i - 1].end) {
        report.warnings.push({
          type: 'CAPTION_OVERLAP',
          message: `Cue ${i + 1} starts before cue ${i} ends`
        });
      }
    }

    // Verify no empty text
    const emptyCues = cues.filter(c => !c.text.trim());
    if (emptyCues.length > 0) {
      report.warnings.push({
        type: 'EMPTY_CAPTION_TEXT',
        message: `${emptyCues.length} cues have empty text`
      });
    }

  } catch (error) {
    report.errors.push({
      type: 'CAPTION_VERIFICATION_FAILED',
      message: `Failed to parse captions: ${error.message}`
    });
  }
}

function parseSRT(content) {
  const cues = [];
  const blocks = content.trim().split(/\n\n+/);

  for (const block of blocks) {
    const lines = block.split('\n');
    if (lines.length < 3) continue;

    const timeLine = lines[1];
    const timeMatch = timeLine.match(/(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}),(\d{3})/);

    if (timeMatch) {
      const start = parseInt(timeMatch[1]) * 3600 + parseInt(timeMatch[2]) * 60 + parseInt(timeMatch[3]) + parseInt(timeMatch[4]) / 1000;
      const end = parseInt(timeMatch[5]) * 3600 + parseInt(timeMatch[6]) * 60 + parseInt(timeMatch[7]) + parseInt(timeMatch[8]) / 1000;
      const text = lines.slice(2).join('\n');

      cues.push({ start, end, text });
    }
  }

  return cues;
}

async function verifyChapters(chaptersPath, report) {
  try {
    const content = readFileSync(chaptersPath, 'utf8');
    const chapters = JSON.parse(content);

    if (!Array.isArray(chapters)) {
      report.errors.push({
        type: 'INVALID_CHAPTERS_FORMAT',
        message: 'Chapters file is not an array'
      });
      return;
    }

    if (chapters.length === 0) {
      report.warnings.push({
        type: 'NO_CHAPTERS',
        message: 'Chapters file contains no chapters'
      });
      return;
    }

    report.technical.chapters = {
      count: chapters.length,
      titles: chapters.map(c => c.title)
    };

    // Verify schema
    for (let i = 0; i < chapters.length; i++) {
      const chapter = chapters[i];

      if (typeof chapter.startTime !== 'number') {
        report.errors.push({
          type: 'INVALID_CHAPTER_SCHEMA',
          message: `Chapter ${i + 1} missing or invalid startTime`
        });
      }

      if (!chapter.title || typeof chapter.title !== 'string') {
        report.errors.push({
          type: 'INVALID_CHAPTER_SCHEMA',
          message: `Chapter ${i + 1} missing or invalid title`
        });
      }
    }

    // Verify timestamps are sorted
    for (let i = 1; i < chapters.length; i++) {
      if (chapters[i].startTime < chapters[i - 1].startTime) {
        report.errors.push({
          type: 'CHAPTERS_NOT_SORTED',
          message: `Chapter ${i + 1} startTime is before chapter ${i}`
        });
      }
    }

  } catch (error) {
    report.errors.push({
      type: 'CHAPTER_VERIFICATION_FAILED',
      message: `Failed to parse chapters: ${error.message}`
    });
  }
}

async function verifyManifest(manifestPath, outputDir, report) {
  try {
    const content = readFileSync(manifestPath, 'utf8');
    const manifest = JSON.parse(content);

    report.technical.manifest = {
      profile: manifest.profile,
      language: manifest.settings?.language,
      renderSettings: manifest.settings
    };

    // Verify checksums
    if (manifest.artifacts) {
      const checksumResults = {};

      for (const [key, artifact] of Object.entries(manifest.artifacts)) {
        if (artifact.exists && artifact.checksum && artifact.path) {
          const actualPath = artifact.path.startsWith('/') ? artifact.path : join(outputDir, artifact.filename);

          if (existsSync(actualPath)) {
            const fileBuffer = readFileSync(actualPath);
            const hashSum = crypto.createHash('sha256');
            hashSum.update(fileBuffer);
            const calculated = hashSum.digest('hex');

            const match = calculated === artifact.checksum;
            checksumResults[key] = {
              expected: artifact.checksum,
              calculated,
              match
            };

            if (!match) {
              report.errors.push({
                type: 'CHECKSUM_MISMATCH',
                artifact: key,
                message: `Checksum mismatch for ${artifact.filename}`
              });
            }
          } else {
            report.warnings.push({
              type: 'ARTIFACT_NOT_FOUND',
              artifact: key,
              message: `Artifact listed in manifest but not found: ${actualPath}`
            });
          }
        }
      }

      report.technical.checksums = checksumResults;
    }

  } catch (error) {
    report.errors.push({
      type: 'MANIFEST_VERIFICATION_FAILED',
      message: `Failed to parse manifest: ${error.message}`
    });
  }
}

async function verifyThumbnail(thumbnailPath, report) {
  try {
    const stats = statSync(thumbnailPath);

    if (stats.size === 0) {
      report.errors.push({
        type: 'EMPTY_THUMBNAIL',
        message: 'Thumbnail file is empty'
      });
      return;
    }

    // Use ffprobe to verify it's a valid image
    const ffprobeCmd = `ffprobe -v error -show_format -show_streams -of json "${thumbnailPath}"`;
    const output = execSync(ffprobeCmd, { encoding: 'utf8' });
    const metadata = JSON.parse(output);

    const imageStream = metadata.streams?.[0];

    if (!imageStream) {
      report.errors.push({
        type: 'INVALID_THUMBNAIL',
        message: 'Thumbnail is not a valid image file'
      });
      return;
    }

    report.technical.thumbnail = {
      width: imageStream.width,
      height: imageStream.height,
      codec: imageStream.codec_name,
      size: stats.size
    };

  } catch (error) {
    report.warnings.push({
      type: 'THUMBNAIL_VERIFICATION_FAILED',
      message: `Could not verify thumbnail: ${error.message}`
    });
  }
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.error('Usage: node verify-pro-video-v0.mjs <output-dir> [output-json]');
    process.exit(1);
  }

  const outputDir = args[0];
  const outputJson = args[1] || join(outputDir, 'objective_qc.json');

  console.log(`Verifying Pro Video v0 artifacts in: ${outputDir}`);

  verifyProVideoV0(outputDir)
    .then(report => {
      // Write report
      import('fs').then(({ writeFileSync }) => {
        writeFileSync(outputJson, JSON.stringify(report, null, 2), 'utf8');
        console.log(`\nObjective QC report written to: ${outputJson}`);

        // Print summary
        console.log('\n' + '='.repeat(80));
        console.log('OBJECTIVE QC SUMMARY');
        console.log('='.repeat(80));
        console.log(`Status: ${report.status}`);
        console.log(`Errors: ${report.errors.length}`);
        console.log(`Warnings: ${report.warnings.length}`);

        if (report.errors.length > 0) {
          console.log('\nErrors:');
          report.errors.forEach(err => {
            console.log(`  - [${err.type}] ${err.message}`);
          });
        }

        if (report.warnings.length > 0) {
          console.log('\nWarnings:');
          report.warnings.forEach(warn => {
            console.log(`  - [${warn.type}] ${warn.message}`);
          });
        }

        if (report.technical.video) {
          console.log('\nVideo:');
          console.log(`  Duration: ${report.technical.video.duration.toFixed(1)}s`);
          console.log(`  Resolution: ${report.technical.video.width}x${report.technical.video.height}`);
          console.log(`  FPS: ${report.technical.video.fps.toFixed(2)}`);
        }

        if (report.technical.loudness) {
          console.log('\nLoudness:');
          console.log(`  Integrated: ${report.technical.loudness.integratedLUFS.toFixed(1)} LUFS`);
          console.log(`  True Peak: ${report.technical.loudness.truePeakDBTP.toFixed(1)} dBTP`);
          console.log(`  Loudness Range: ${report.technical.loudness.loudnessRangeLU.toFixed(1)} LU`);
        }

        console.log('='.repeat(80));

        process.exit(report.status === 'FAIL' ? 1 : 0);
      });
    })
    .catch(error => {
      console.error(`\nVerification failed: ${error.message}`);
      process.exit(1);
    });
}
