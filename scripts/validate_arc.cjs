#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const ARC_PATH = path.resolve("docs/spec/authoritative_rendering_contract.json");

let failures = 0;

function fail(message) {
  console.error(`[arc-validate] ${message}`);
  failures += 1;
}

function requireObject(value, ctx) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail(`Expected "${ctx}" to be an object, got: ${typeof value}`);
    return false;
  }
  return true;
}

function requireArray(value, ctx) {
  if (!Array.isArray(value)) {
    fail(`Expected "${ctx}" to be an array, got: ${typeof value}`);
    return false;
  }
  return true;
}

function requireString(value, ctx) {
  if (typeof value !== "string" || value.trim() === "") {
    fail(`Expected "${ctx}" to be a non-empty string, got: ${value}`);
    return false;
  }
  return true;
}

function requireNumber(value, ctx) {
  if (!Number.isFinite(value)) {
    fail(`Expected "${ctx}" to be a finite number, got: ${value}`);
  }
}

function requireStringArray(value, ctx) {
  if (!requireArray(value, ctx)) return;
  value.forEach((item, idx) => {
    requireString(item, `${ctx}[${idx}]`);
  });
}

if (!fs.existsSync(ARC_PATH)) {
  fail(`ARC spec missing at ${ARC_PATH}`);
  process.exitCode = 1;
  process.exit(failures);
}

let arc;
try {
  const raw = fs.readFileSync(ARC_PATH, "utf8");
  arc = JSON.parse(raw);
} catch (err) {
  fail(`Failed to parse ARC spec: ${err.message}`);
  process.exitCode = 1;
  process.exit(failures);
}

if (requireString(arc.version, "version") && arc.version.split(".").length < 2) {
  fail("version must be a semantic-like version string");
}
requireString(arc.description, "description");

if (requireObject(arc.video, "video")) {
  if (requireObject(arc.video.resolution, "video.resolution")) {
    requireNumber(arc.video.resolution.width, "video.resolution.width");
    requireNumber(arc.video.resolution.height, "video.resolution.height");
  }
  if (requireObject(arc.video.fps, "video.fps")) {
    requireNumber(arc.video.fps.output_fps, "video.fps.output_fps");
    requireStringArray(
      arc.video.fps.accepted_avg_frame_rate,
      "video.fps.accepted_avg_frame_rate"
    );
  }
  ["codec", "container", "pix_fmt", "sar", "colorspace", "color_range"].forEach((field) => {
    requireString(arc.video[field], `video.${field}`);
  });
  if (requireObject(arc.video.bitrate, "video.bitrate")) {
    ["target_kbps", "min_kbps", "max_kbps", "bufsize_kbps"].forEach((field) => {
      requireNumber(arc.video.bitrate[field], `video.bitrate.${field}`);
    });
    requireString(arc.video.bitrate.mode, "video.bitrate.mode");
  }
}

if (requireObject(arc.audio, "audio")) {
  requireNumber(arc.audio.sample_rate, "audio.sample_rate");
  requireNumber(arc.audio.channels, "audio.channels");
  if (requireObject(arc.audio.lufs, "audio.lufs")) {
    requireNumber(arc.audio.lufs.target, "audio.lufs.target");
    requireNumber(arc.audio.lufs.tolerance, "audio.lufs.tolerance");
  }
  if (requireObject(arc.audio.true_peak_dbfs, "audio.true_peak_dbfs")) {
    requireNumber(arc.audio.true_peak_dbfs.ceiling, "audio.true_peak_dbfs.ceiling");
    requireNumber(arc.audio.true_peak_dbfs.absolute_max, "audio.true_peak_dbfs.absolute_max");
  }
  if (requireObject(arc.audio.metrics_schema, "audio.metrics_schema")) {
    requireStringArray(arc.audio.metrics_schema.required_fields, "audio.metrics_schema.required_fields");
    if (typeof arc.audio.metrics_schema.allow_extra_fields !== "boolean") {
      fail(
        `Expected "audio.metrics_schema.allow_extra_fields" to be a boolean, got: ${arc.audio.metrics_schema.allow_extra_fields}`
      );
    }
  }
}

if (requireObject(arc.extraction, "extraction")) {
  requireNumber(arc.extraction.frame_extractor_fps, "extraction.frame_extractor_fps");
  if (requireObject(arc.extraction.preview_5s_expected_frames, "extraction.preview_5s_expected_frames")) {
    requireNumber(arc.extraction.preview_5s_expected_frames.min, "extraction.preview_5s_expected_frames.min");
    requireNumber(arc.extraction.preview_5s_expected_frames.max, "extraction.preview_5s_expected_frames.max");
  }
  if (requireObject(arc.extraction.commands, "extraction.commands")) {
    Object.entries(arc.extraction.commands).forEach(([key, value]) => {
      requireString(value, `extraction.commands.${key}`);
    });
  }
}

if (requireObject(arc.golden_tests, "golden_tests")) {
  if (requireObject(arc.golden_tests.ssim, "golden_tests.ssim")) {
    ["pass", "soft_pass", "fail"].forEach((field) => {
      requireNumber(arc.golden_tests.ssim[field], `golden_tests.ssim.${field}`);
    });
  }
  requireNumber(arc.golden_tests.placeholder_bytes_min, "golden_tests.placeholder_bytes_min");
  requireStringArray(arc.golden_tests.required_artifacts, "golden_tests.required_artifacts");
}

if (requireObject(arc.ci_requirements, "ci_requirements")) {
  requireStringArray(arc.ci_requirements.platforms, "ci_requirements.platforms");
  ["ffmpeg_version", "node_version", "npm_version"].forEach((field) => {
    requireString(arc.ci_requirements[field], `ci_requirements.${field}`);
  });
}

if (requireObject(arc.governance, "governance")) {
  requireStringArray(arc.governance.requires_rfc_if_changing, "governance.requires_rfc_if_changing");
  requireString(arc.governance.rfc_label, "governance.rfc_label");
  if (requireObject(arc.governance.risk_levels, "governance.risk_levels")) {
    Object.entries(arc.governance.risk_levels).forEach(([level, desc]) => {
      requireString(desc, `governance.risk_levels.${level}`);
    });
  }
}

if (failures > 0) {
  console.error(`[arc-validate] Validation failed with ${failures} error(s).`);
  process.exitCode = 1;
} else {
  console.log("[arc-validate] ARC spec OK");
}
