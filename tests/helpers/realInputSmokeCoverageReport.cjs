/**
 * realInputSmokeCoverageReport.cjs — Helper for generating structured
 * real-input smoke coverage reports.
 *
 * Dependency-free, cross-platform, deterministic.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const SCHEMA_VERSION = 'real-input-smoke-coverage/v1';

/**
 * Create a new empty coverage report.
 * @param {object} opts
 * @param {string} opts.registryPath - Absolute path to fixtures.json
 * @param {number} opts.enabledCount - Number of enabled fixtures
 * @returns {object} Report skeleton
 */
function createReport({ registryPath, enabledCount }) {
  return {
    _schema: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    registryPath,
    enabledFixtureCount: enabledCount,
    fixtures: [],
  };
}

/**
 * Build a fixture entry for the coverage report.
 * @param {object} opts
 * @param {string} opts.slug
 * @param {string} opts.gameName
 * @param {string} opts.profile
 * @param {string} opts.metadataFile
 * @param {string} opts.rulebookExtractFile
 * @param {string} opts.expectedFile
 * @param {string} opts.normalizedFixturePath - Path to the normalized canonical fixture
 * @param {string} opts.artifactDir - Output directory for generated artifacts
 * @param {object} opts.ffprobeData - Parsed ffprobe.json content (or null)
 * @param {object} opts.manifestData - Parsed manifest.json content (or null)
 * @param {string[]} opts.requiredArtifacts - List of expected artifact filenames
 * @param {object} opts.contractValidation - { passed: boolean, errors: string[] }
 * @returns {object} Fixture report entry
 */
function buildFixtureEntry({
  slug,
  gameName,
  profile,
  metadataFile,
  rulebookExtractFile,
  expectedFile,
  normalizedFixturePath,
  artifactDir,
  ffprobeData,
  manifestData,
  requiredArtifacts,
  contractValidation,
}) {
  // Artifact presence summary
  const artifactPresence = {};
  for (const file of (requiredArtifacts || [])) {
    const filePath = path.join(artifactDir, file);
    artifactPresence[file] = fs.existsSync(filePath) && fs.statSync(filePath).size > 0;
  }

  // Extract media metadata from ffprobe
  let duration = null;
  let videoCodec = null;
  let videoWidth = null;
  let videoHeight = null;
  let audioPresent = false;

  if (ffprobeData) {
    const streams = ffprobeData.streams || [];
    const videoStream = streams.find((s) => s.codec_type === 'video');
    const audioStream = streams.find((s) => s.codec_type === 'audio');

    if (ffprobeData.format && ffprobeData.format.duration) {
      duration = parseFloat(ffprobeData.format.duration);
    }
    if (videoStream) {
      videoCodec = videoStream.codec_name || null;
      videoWidth = videoStream.width != null ? Number(videoStream.width) : null;
      videoHeight = videoStream.height != null ? Number(videoStream.height) : null;
    }
    audioPresent = !!audioStream;
  }

  // Extract manifest identity
  let manifestIdentity = null;
  if (manifestData) {
    manifestIdentity = {
      gameId: manifestData.game?.id || null,
      gameName: manifestData.game?.name || null,
      fixtureSlug: manifestData.fixtureSlug || null,
    };
  }

  return {
    slug,
    gameName,
    profile,
    metadataFile,
    rulebookExtractFile,
    expectedFile,
    normalizedFixturePath,
    artifactDir,
    artifactPresence,
    manifestIdentity,
    media: {
      duration,
      videoCodec,
      videoWidth,
      videoHeight,
      audioPresent,
    },
    contractValidation: {
      passed: contractValidation ? contractValidation.passed : false,
      errorCount: contractValidation ? contractValidation.errors.length : 0,
      errors: contractValidation ? contractValidation.errors : [],
    },
  };
}

/**
 * Write the coverage report to disk.
 * @param {string} outputPath - Absolute path to write report JSON
 * @param {object} report - Report object from createReport + fixture entries
 */
function writeReport(outputPath, report) {
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf8');
}

module.exports = {
  SCHEMA_VERSION,
  createReport,
  buildFixtureEntry,
  writeReport,
};
