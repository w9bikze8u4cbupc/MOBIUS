// scripts/validate_arc_semantic.mjs
//
// ARC Semantic Validator
// ----------------------
// This script performs *semantic* checks on the Authoritative Rendering Contract
// (ARC) JSON, in addition to any structural validation already enforced by
// scripts/validate_arc.* and its CI workflow.
//
// It is intentionally dependency-free (Node stdlib only) so it can run in any CI
// matrix without extra setup.

import fs from "fs";
import path from "path";
import url from "url";

/**
 * Resolve repo root-relative path when executed via node.
 */
function resolveRepoPath(relativePath) {
  const __filename = url.fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  return path.resolve(__dirname, "..", relativePath);
}

/**
 * Fail with an explicit message and non-zero exit code.
 */
function fail(message) {
  console.error("❌ ARC semantic validation failed:");
  console.error("   " + message);
  process.exit(1);
}

/**
 * Load ARC JSON from the canonical spec path.
 */
function loadArc() {
  const arcPath = resolveRepoPath("docs/spec/authoritative_rendering_contract.json");
  let raw;
  try {
    raw = fs.readFileSync(arcPath, "utf8");
  } catch (err) {
    fail(`Unable to read ARC file at ${arcPath}: ${err.message}`);
  }

  let json;
  try {
    json = JSON.parse(raw);
  } catch (err) {
    fail(`ARC file is not valid JSON: ${err.message}`);
  }

  return json;
}

/**
 * Validate that a value is a finite number and within an optional range.
 */
function assertFiniteNumber(value, name, { min, max } = {}) {
  if (!Number.isFinite(value)) {
    fail(`${name} must be a finite number (got: ${value})`);
  }
  if (typeof min === "number" && value < min) {
    fail(`${name} must be >= ${min} (got: ${value})`);
  }
  if (typeof max === "number" && value > max) {
    fail(`${name} must be <= ${max} (got: ${value})`);
  }
}

/**
 * Validate that SAR is in "num:den" format and both parts are > 0.
 */
function validateSar(sar, context) {
  if (typeof sar !== "string") {
    fail(`${context}.sar must be a string in "num:den" format`);
  }

  const match = sar.match(/^(\d+):(\d+)$/);
  if (!match) {
    fail(`${context}.sar must be in "num:den" format (got: "${sar}")`);
  }

  const num = Number(match[1]);
  const den = Number(match[2]);
  if (num <= 0 || den <= 0) {
    fail(`${context}.sar numerator and denominator must be > 0 (got: ${sar})`);
  }
}

/**
 * Main semantic validation routine.
 */
function validateArcSemantic(arc) {
  // ---- Video invariants -----------------------------------------------------
  if (!arc.video) {
    fail("Missing video section in ARC");
  }

  // Resolution
  assertFiniteNumber(arc.video.width, "video.width", { min: 16 });
  assertFiniteNumber(arc.video.height, "video.height", { min: 16 });

  // FPS
  assertFiniteNumber(arc.video.fps, "video.fps", { min: 1 });
  if (arc.video.fps > 120) {
    fail(`video.fps seems unreasonably high (>120): ${arc.video.fps}`);
  }

  // Pixel format
  if (typeof arc.video.pixFmt !== "string" || arc.video.pixFmt.trim() === "") {
    fail("video.pixFmt must be a non-empty string");
  }

  // SAR
  if (arc.video.sar !== undefined) {
    validateSar(arc.video.sar, "video");
  }

  // ---- Audio invariants -----------------------------------------------------
  if (!arc.audio) {
    fail("Missing audio section in ARC");
  }

  // Sample rate
  assertFiniteNumber(arc.audio.sampleRate, "audio.sampleRate", { min: 8000 });
  if (arc.audio.sampleRate !== 48000) {
    console.warn(
      `⚠ audio.sampleRate is ${arc.audio.sampleRate} Hz (expected 48000 Hz for YouTube-ready exports)`
    );
  }

  // Channels
  assertFiniteNumber(arc.audio.channels, "audio.channels", { min: 1 });
  if (arc.audio.channels !== 2) {
    console.warn(
      `⚠ audio.channels is ${arc.audio.channels} (stereo=2 is recommended)`
    );
  }

  // Loudness targets
  assertFiniteNumber(arc.audio.targetLufs, "audio.targetLufs", {
    min: -40,
    max: -5,
  });
  assertFiniteNumber(arc.audio.truePeakCeiling, "audio.truePeakCeiling", {
    min: -10,
    max: -0.1,
  });

  if (arc.audio.targetLufs > arc.audio.truePeakCeiling) {
    fail(
      `audio.targetLufs (${arc.audio.targetLufs}) must be lower (more negative) than audio.truePeakCeiling (${arc.audio.truePeakCeiling})`
    );
  }

  // ---- Extraction invariants -----------------------------------------------
  if (!arc.extraction) {
    fail("Missing extraction section in ARC");
  }

  if (typeof arc.extraction.method !== "string" || arc.extraction.method.trim() === "") {
    fail("extraction.method must be a non-empty string");
  }

  if (!["exact", "nearest"].includes(arc.extraction.method)) {
    console.warn(
      `⚠ extraction.method is "${arc.extraction.method}" (expected "exact" or "nearest")`
    );
  }

  assertFiniteNumber(
    arc.extraction.frameCountTolerancePct,
    "extraction.frameCountTolerancePct",
    { min: 0, max: 10 }
  );

  // ---- Validation invariants ------------------------------------------------
  if (!arc.validation) {
    fail("Missing validation section in ARC");
  }

  if (!arc.validation.ssim) {
    fail("Missing validation.ssim section in ARC");
  }

  assertFiniteNumber(arc.validation.ssim.min, "validation.ssim.min", {
    min: 0.0,
    max: 1.0,
  });

  if (arc.validation.ssim.min < 0.8) {
    console.warn(
      `⚠ validation.ssim.min is ${arc.validation.ssim.min} (< 0.8). This may be too lenient for golden checks.`
    );
  }

  // ---- Governance hints (non-fatal) ----------------------------------------
  if (!arc.governance) {
    console.warn("⚠ No governance section defined in ARC (arc.governance missing)");
  }
}

/**
 * Entrypoint
 */
function main() {
  const arc = loadArc();
  validateArcSemantic(arc);
  console.log("✔ ARC semantic validation passed.");
}

main();
