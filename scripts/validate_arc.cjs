#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const arcPath = path.resolve(__dirname, "../docs/spec/authoritative_rendering_contract.json");
const errors = [];

function log(message) {
  console.log(`[arc-validate] ${message}`);
}

function fail(message) {
  errors.push(message);
}

function requireObject(value, ctx) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail(`Expected "${ctx}" to be an object`);
    return {};
  }
  return value;
}

function requireArray(value, ctx) {
  if (!Array.isArray(value)) {
    fail(`Expected "${ctx}" to be an array`);
    return [];
  }
  return value;
}

function requireString(value, ctx) {
  if (typeof value !== "string" || value.trim() === "") {
    fail(`Expected "${ctx}" to be a non-empty string`);
    return "";
  }
  return value;
}

function requireBoolean(value, ctx) {
  if (typeof value !== "boolean") {
    fail(`Expected "${ctx}" to be a boolean`);
    return false;
  }
  return value;
}

function requireNumber(value, ctx) {
  if (!Number.isFinite(value)) {
    fail(`Expected "${ctx}" to be a finite number, got: ${value}`);
    return 0;
  }
  return value;
}

function requireStringArray(value, ctx) {
  const arr = requireArray(value, ctx);
  arr.forEach((item, index) => {
    requireString(item, `${ctx}[${index}]`);
  });
  return arr;
}

function validateExists(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`ARC spec missing at ${filePath}`);
  }
}

function loadSpec() {
  validateExists(arcPath);
  const raw = fs.readFileSync(arcPath, "utf8");
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`Failed to parse ARC spec JSON: ${err.message}`);
  }
}

log("Validating ARC spec");

let spec;
try {
  spec = loadSpec();
} catch (err) {
  log(err.message);
  process.exitCode = 1;
  process.exit(1);
}

const root = requireObject(spec, "root");
requireString(root.version, "version");
requireString(root.description, "description");

const video = requireObject(root.video, "video");
const resolution = requireObject(video.resolution, "video.resolution");
requireNumber(resolution.width, "video.resolution.width");
requireNumber(resolution.height, "video.resolution.height");

const fps = requireObject(video.fps, "video.fps");
requireNumber(fps.output_fps, "video.fps.output_fps");
requireStringArray(fps.accepted_avg_frame_rate, "video.fps.accepted_avg_frame_rate");
requireString(video.codec, "video.codec");
requireString(video.container, "video.container");
requireString(video.pix_fmt, "video.pix_fmt");
requireString(video.sar, "video.sar");
requireString(video.colorspace, "video.colorspace");
requireString(video.color_range, "video.color_range");

const bitrate = requireObject(video.bitrate, "video.bitrate");
requireString(bitrate.mode, "video.bitrate.mode");
requireNumber(bitrate.target_kbps, "video.bitrate.target_kbps");
requireNumber(bitrate.min_kbps, "video.bitrate.min_kbps");
requireNumber(bitrate.max_kbps, "video.bitrate.max_kbps");
requireNumber(bitrate.bufsize_kbps, "video.bitrate.bufsize_kbps");

const audio = requireObject(root.audio, "audio");
requireNumber(audio.sample_rate, "audio.sample_rate");
requireNumber(audio.channels, "audio.channels");

const lufs = requireObject(audio.lufs, "audio.lufs");
requireNumber(lufs.target, "audio.lufs.target");
requireNumber(lufs.tolerance, "audio.lufs.tolerance");

const truePeak = requireObject(audio.true_peak_dbfs, "audio.true_peak_dbfs");
requireNumber(truePeak.ceiling, "audio.true_peak_dbfs.ceiling");
requireNumber(truePeak.absolute_max, "audio.true_peak_dbfs.absolute_max");

const metricsSchema = requireObject(audio.metrics_schema, "audio.metrics_schema");
requireStringArray(metricsSchema.required_fields, "audio.metrics_schema.required_fields");
requireBoolean(metricsSchema.allow_extra_fields, "audio.metrics_schema.allow_extra_fields");

const extraction = requireObject(root.extraction, "extraction");
requireNumber(extraction.frame_extractor_fps, "extraction.frame_extractor_fps");
const previewFrames = requireObject(extraction.preview_5s_expected_frames, "extraction.preview_5s_expected_frames");
requireNumber(previewFrames.min, "extraction.preview_5s_expected_frames.min");
requireNumber(previewFrames.max, "extraction.preview_5s_expected_frames.max");

const commands = requireObject(extraction.commands, "extraction.commands");
requireString(commands.extract_frames, "extraction.commands.extract_frames");
requireString(commands.probe, "extraction.commands.probe");

const golden = requireObject(root.golden_tests, "golden_tests");
const ssim = requireObject(golden.ssim, "golden_tests.ssim");
requireNumber(ssim.pass, "golden_tests.ssim.pass");
requireNumber(ssim.soft_pass, "golden_tests.ssim.soft_pass");
requireNumber(ssim.fail, "golden_tests.ssim.fail");
requireNumber(golden.placeholder_bytes_min, "golden_tests.placeholder_bytes_min");
requireStringArray(golden.required_artifacts, "golden_tests.required_artifacts");

const ci = requireObject(root.ci_requirements, "ci_requirements");
requireStringArray(ci.platforms, "ci_requirements.platforms");
requireString(ci.ffmpeg_version, "ci_requirements.ffmpeg_version");
requireString(ci.node_version, "ci_requirements.node_version");
requireString(ci.npm_version, "ci_requirements.npm_version");

const governance = requireObject(root.governance, "governance");
requireStringArray(governance.requires_rfc_if_changing, "governance.requires_rfc_if_changing");
requireString(governance.rfc_label, "governance.rfc_label");
const riskLevels = requireObject(governance.risk_levels, "governance.risk_levels");
requireString(riskLevels.low, "governance.risk_levels.low");
requireString(riskLevels.medium, "governance.risk_levels.medium");
requireString(riskLevels.high, "governance.risk_levels.high");

if (errors.length > 0) {
  log("ARC validation failed:");
  errors.forEach(message => log(`  - ${message}`));
  process.exitCode = 1;
  process.exit(1);
}

log("ARC validation succeeded ✅");
