#!/usr/bin/env node
/**
 * MOBIUS — ARC Validator
 *
 * Validates docs/spec/authoritative_rendering_contract.json
 * to ensure required keys and types are present before merge.
 *
 * This is intentionally dependency-free: no JSON Schema libraries,
 * just explicit, readable checks.
 */

const fs = require("fs");
const path = require("path");

const ARC_PATH = path.resolve("docs/spec/authoritative_rendering_contract.json");

function fail(msg) {
  console.error(`[arc-validate] ERROR: ${msg}`);
  process.exit(1);
}

function log(msg) {
  console.log(`[arc-validate] ${msg}`);
}

if (!fs.existsSync(ARC_PATH)) {
  fail(`ARC spec missing at ${ARC_PATH}`);
}

let arc;
try {
  arc = JSON.parse(fs.readFileSync(ARC_PATH, "utf8"));
} catch (err) {
  fail(`Failed to parse ARC JSON: ${err.message}`);
}

// ----------- helpers -----------
function requireKey(obj, key, ctx) {
  if (obj == null || !(key in obj)) {
    fail(`Missing key "${ctx}.${key}"`);
  }
  return obj[key];
}

function requireType(value, type, ctx) {
  if (typeof value !== type) {
    fail(`Expected "${ctx}" to be ${type}, got ${typeof value}`);
  }
}

function requireNumber(value, ctx) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    fail(`Expected "${ctx}" to be a finite number, got: ${value}`);
  }
}

function requireString(value, ctx) {
  if (typeof value !== "string" || !value.trim()) {
    fail(`Expected "${ctx}" to be a non-empty string, got: "${value}"`);
  }
}

function requireArray(value, ctx) {
  if (!Array.isArray(value)) {
    fail(`Expected "${ctx}" to be an array, got: ${typeof value}`);
  }
}

// ----------- validation -----------

log("Validating ARC top-level fields");

requireString(requireKey(arc, "version", "arc"), "arc.version");
requireString(requireKey(arc, "description", "arc"), "arc.description");

// Video
log("Validating arc.video");
const video = requireKey(arc, "video", "arc");

const resolution = requireKey(video, "resolution", "video");
requireNumber(requireKey(resolution, "width", "video.resolution"), "video.resolution.width");
requireNumber(requireKey(resolution, "height", "video.resolution"), "video.resolution.height");

const fps = requireKey(video, "fps", "video");
requireNumber(requireKey(fps, "output_fps", "video.fps"), "video.fps.output_fps");
const acceptedFps = requireKey(fps, "accepted_avg_frame_rate", "video.fps");
requireArray(acceptedFps, "video.fps.accepted_avg_frame_rate");
acceptedFps.forEach((v, i) => requireString(v, `video.fps.accepted_avg_frame_rate[${i}]`));

requireString(requireKey(video, "codec", "video"), "video.codec");
requireString(requireKey(video, "container", "video"), "video.container");
requireString(requireKey(video, "pix_fmt", "video"), "video.pix_fmt");
requireString(requireKey(video, "sar", "video"), "video.sar");
requireString(requireKey(video, "colorspace", "video"), "video.colorspace");
requireString(requireKey(video, "color_range", "video"), "video.color_range");

const bitrate = requireKey(video, "bitrate", "video");
["target_kbps", "min_kbps", "max_kbps", "bufsize_kbps"].forEach((k) =>
  requireNumber(requireKey(bitrate, k, "video.bitrate"), `video.bitrate.${k}`)
);

// Audio
log("Validating arc.audio");
const audio = requireKey(arc, "audio", "arc");
requireNumber(requireKey(audio, "sample_rate", "audio"), "audio.sample_rate");
requireNumber(requireKey(audio, "channels", "audio"), "audio.channels");

const lufs = requireKey(audio, "lufs", "audio");
requireNumber(requireKey(lufs, "target", "audio.lufs"), "audio.lufs.target");
requireNumber(requireKey(lufs, "tolerance", "audio.lufs"), "audio.lufs.tolerance");

const tp = requireKey(audio, "true_peak_dbfs", "audio");
requireNumber(requireKey(tp, "ceiling", "audio.true_peak_dbfs"), "audio.true_peak_dbfs.ceiling");
requireNumber(requireKey(tp, "absolute_max", "audio.true_peak_dbfs"), "audio.true_peak_dbfs.absolute_max");

const metricsSchema = requireKey(audio, "metrics_schema", "audio");
const requiredFields = requireKey(metricsSchema, "required_fields", "audio.metrics_schema");
requireArray(requiredFields, "audio.metrics_schema.required_fields");
requiredFields.forEach((v, i) =>
  requireString(v, `audio.metrics_schema.required_fields[${i}]`)
);
requireType(
  requireKey(metricsSchema, "allow_extra_fields", "audio.metrics_schema"),
  "boolean",
  "audio.metrics_schema.allow_extra_fields"
);

// Extraction
log("Validating arc.extraction");
const extraction = requireKey(arc, "extraction", "arc");
requireNumber(
  requireKey(extraction, "frame_extractor_fps", "extraction"),
  "extraction.frame_extractor_fps"
);

const previewFrames = requireKey(extraction, "preview_5s_expected_frames", "extraction");
requireNumber(requireKey(previewFrames, "min", "extraction.preview_5s_expected_frames"), "extraction.preview_5s_expected_frames.min");
requireNumber(requireKey(previewFrames, "max", "extraction.preview_5s_expected_frames"), "extraction.preview_5s_expected_frames.max");

const commands = requireKey(extraction, "commands", "extraction");
requireString(requireKey(commands, "extract_frames", "extraction.commands"), "extraction.commands.extract_frames");
requireString(requireKey(commands, "probe", "extraction.commands"), "extraction.commands.probe");

// Golden tests
log("Validating arc.golden_tests");
const golden = requireKey(arc, "golden_tests", "arc");
const ssim = requireKey(golden, "ssim", "golden_tests");
requireNumber(requireKey(ssim, "pass", "golden_tests.ssim"), "golden_tests.ssim.pass");
requireNumber(requireKey(ssim, "soft_pass", "golden_tests.ssim"), "golden_tests.ssim.soft_pass");
requireNumber(requireKey(ssim, "fail", "golden_tests.ssim"), "golden_tests.ssim.fail");

requireNumber(
  requireKey(golden, "placeholder_bytes_min", "golden_tests"),
  "golden_tests.placeholder_bytes_min"
);

const reqArtifacts = requireKey(golden, "required_artifacts", "golden_tests");
requireArray(reqArtifacts, "golden_tests.required_artifacts");
reqArtifacts.forEach((v, i) =>
  requireString(v, `golden_tests.required_artifacts[${i}]`)
);

// CI
log("Validating arc.ci_requirements");
const ciReq = requireKey(arc, "ci_requirements", "arc");
const platforms = requireKey(ciReq, "platforms", "ci_requirements");
requireArray(platforms, "ci_requirements.platforms");
platforms.forEach((v, i) =>
  requireString(v, `ci_requirements.platforms[${i}]`)
);
requireString(requireKey(ciReq, "ffmpeg_version", "ci_requirements"), "ci_requirements.ffmpeg_version");
requireString(requireKey(ciReq, "node_version", "ci_requirements"), "ci_requirements.node_version");
requireString(requireKey(ciReq, "npm_version", "ci_requirements"), "ci_requirements.npm_version");

// Governance
log("Validating arc.governance");
const gov = requireKey(arc, "governance", "arc");
const requiresRfc = requireKey(gov, "requires_rfc_if_changing", "governance");
requireArray(requiresRfc, "governance.requires_rfc_if_changing");
requiresRfc.forEach((v, i) =>
  requireString(v, `governance.requires_rfc_if_changing[${i}]`)
);
requireString(requireKey(gov, "rfc_label", "governance"), "governance.rfc_label");

const riskLevels = requireKey(gov, "risk_levels", "governance");
["low", "medium", "high"].forEach((k) =>
  requireString(requireKey(riskLevels, k, "governance.risk_levels"), `governance.risk_levels.${k}`)
);

log("ARC validation succeeded ✅");
process.exit(0);
