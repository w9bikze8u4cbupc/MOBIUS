/**
 * validate-real-input-preview-artifact.cjs — CJS version of the validator.
 * Used by Jest tests and other CJS consumers.
 *
 * Validates a real-input artifact directory against an expected-contract JSON object.
 */

'use strict';

const { existsSync, readFileSync, statSync } = require('fs');
const { join } = require('path');

/**
 * Validate an artifact directory against an expected contract.
 * @param {string} artifactDir - Absolute path to artifact directory.
 * @param {object} contract - Parsed expected-contract object.
 * @returns {{ passed: boolean, errors: string[] }}
 */
function validateRealInputArtifact(artifactDir, contract) {
  const errors = [];

  function fail(msg) {
    errors.push(msg);
  }

  // -------------------------------------------------------------------------
  // Required artifacts existence + non-empty
  // -------------------------------------------------------------------------
  const requiredArtifacts = contract.requiredArtifacts || [];
  for (const file of requiredArtifacts) {
    const filePath = join(artifactDir, file);
    if (!existsSync(filePath)) {
      fail(`Missing required artifact: ${file}`);
      continue;
    }
    const stat = statSync(filePath);
    if (stat.size === 0) {
      fail(`Artifact is empty (0 bytes): ${file}`);
    }
  }

  // -------------------------------------------------------------------------
  // MP4 minimum size
  // -------------------------------------------------------------------------
  const minMp4Bytes = contract.minMp4Bytes || 10240;
  const mp4Path = join(artifactDir, 'preview.mp4');
  if (existsSync(mp4Path)) {
    const mp4Stat = statSync(mp4Path);
    if (mp4Stat.size < minMp4Bytes) {
      fail(`preview.mp4 is ${mp4Stat.size} bytes, expected at least ${minMp4Bytes}`);
    }
  }

  // -------------------------------------------------------------------------
  // manifest.json identity checks
  // -------------------------------------------------------------------------
  const manifestPath = join(artifactDir, 'manifest.json');
  if (existsSync(manifestPath)) {
    let manifest;
    try {
      manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    } catch (err) {
      fail(`manifest.json: invalid JSON — ${err.message}`);
    }
    if (manifest && contract.manifest) {
      if (contract.manifest.gameId && manifest.game?.id !== contract.manifest.gameId) {
        fail(`manifest.json: game.id is "${manifest.game?.id}", expected "${contract.manifest.gameId}"`);
      }
      if (contract.manifest.gameName && manifest.game?.name !== contract.manifest.gameName) {
        fail(`manifest.json: game.name is "${manifest.game?.name}", expected "${contract.manifest.gameName}"`);
      }
      if (contract.manifest.fixtureSlug && manifest.fixtureSlug !== contract.manifest.fixtureSlug) {
        fail(`manifest.json: fixtureSlug is "${manifest.fixtureSlug}", expected "${contract.manifest.fixtureSlug}"`);
      }
    }
  }

  // -------------------------------------------------------------------------
  // ffprobe.json media contract
  // -------------------------------------------------------------------------
  const ffprobePath = join(artifactDir, 'ffprobe.json');
  if (existsSync(ffprobePath)) {
    let ffprobe;
    try {
      ffprobe = JSON.parse(readFileSync(ffprobePath, 'utf8'));
    } catch (err) {
      fail(`ffprobe.json: invalid JSON — ${err.message}`);
    }

    if (ffprobe) {
      const streams = ffprobe.streams || [];
      const videoStream = streams.find((s) => s.codec_type === 'video');
      const audioStream = streams.find((s) => s.codec_type === 'audio');

      // Video stream checks
      if (contract.media?.video) {
        if (!videoStream) {
          fail('ffprobe.json: no video stream found');
        } else {
          const expectedCodec = contract.media.video.codec;
          if (expectedCodec && videoStream.codec_name !== expectedCodec) {
            fail(`ffprobe.json: video codec is "${videoStream.codec_name}", expected "${expectedCodec}"`);
          }
          const expectedWidth = contract.media.video.width;
          if (expectedWidth && Number(videoStream.width) !== expectedWidth) {
            fail(`ffprobe.json: video width is ${videoStream.width}, expected ${expectedWidth}`);
          }
          const expectedHeight = contract.media.video.height;
          if (expectedHeight && Number(videoStream.height) !== expectedHeight) {
            fail(`ffprobe.json: video height is ${videoStream.height}, expected ${expectedHeight}`);
          }
        }
      }

      // Audio stream checks
      if (contract.media?.audio?.required) {
        if (!audioStream) {
          fail('ffprobe.json: no audio stream found (audio required by contract)');
        }
      }

      // Duration range checks
      if (contract.durationRange) {
        const duration = parseFloat(ffprobe.format?.duration || '0');
        if (duration < contract.durationRange.min) {
          fail(`ffprobe.json: duration is ${duration}s, expected at least ${contract.durationRange.min}s`);
        }
        if (duration > contract.durationRange.max) {
          fail(`ffprobe.json: duration is ${duration}s, expected at most ${contract.durationRange.max}s`);
        }
      }
    }
  }

  return { passed: errors.length === 0, errors };
}

module.exports = { validateRealInputArtifact };
