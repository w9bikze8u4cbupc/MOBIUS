#!/usr/bin/env node

/**
 * MOBIUS - container.json semantic validator + JUnit emitter
 *
 * Usage:
 *   node scripts/validate_container.cjs \
 *     --container out/container.json \
 *     --junit out/junit/packaging-contract.junit.xml
 *
 * Exit codes:
 *   0 = all checks passed
 *   1 = validation failed (see stderr + JUnit)
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");

function parseArgs(argv) {
  const args = { container: null, junit: null };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--container") {
      args.container = argv[++i];
    } else if (arg === "--junit") {
      args.junit = argv[++i];
    }
  }
  if (!args.container) {
    throw new Error("Missing --container <path> argument");
  }
  if (!args.junit) {
    args.junit = "out/junit/packaging-contract.junit.xml";
  }
  return args;
}

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`Failed to parse JSON at ${filePath}: ${err.message}`);
  }
}

function fileExists(filePath) {
  try {
    const st = fs.statSync(filePath);
    return st.isFile() && st.size > 0;
  } catch {
    return false;
  }
}

function computeSha256(filePath) {
  const hash = crypto.createHash("sha256");
  const fd = fs.openSync(filePath, "r");
  const bufferSize = 1024 * 1024;
  const buffer = Buffer.alloc(bufferSize);

  try {
    let bytesRead;
    do {
      bytesRead = fs.readSync(fd, buffer, 0, bufferSize, null);
      if (bytesRead > 0) {
        hash.update(buffer.slice(0, bytesRead));
      }
    } while (bytesRead > 0);
  } finally {
    fs.closeSync(fd);
  }

  return hash.digest("hex");
}

function runFfprobe(filePath, streamSelector) {
  const args = [
    "-v",
    "error",
    "-select_streams",
    streamSelector,
    "-show_entries",
    streamSelector.startsWith("v:")
      ? "stream=width,height,avg_frame_rate,r_frame_rate,pix_fmt,sample_aspect_ratio:format=duration"
      : "stream=sample_rate,channels:format=duration",
    "-of",
    "json",
    filePath
  ];
  const result = spawnSync("ffprobe", args, {
    encoding: "utf8"
  });

  if (result.error) {
    throw new Error(`ffprobe failed to start: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(
      `ffprobe exited with code ${result.status}: ${result.stderr || result.stdout}`
    );
  }

  try {
    return JSON.parse(result.stdout);
  } catch (err) {
    throw new Error(`Failed to parse ffprobe JSON: ${err.message}`);
  }
}

function toNumberFps(rateStr) {
  if (!rateStr || typeof rateStr !== "string") return null;
  const parts = rateStr.split("/");
  if (parts.length === 1) {
    const n = Number(rateStr);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  const num = Number(parts[0]);
  const den = Number(parts[1]);
  if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return null;
  return num / den;
}

function approxEqual(a, b, epsilon) {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return Math.abs(a - b) <= epsilon;
}

function assert(errors, condition, code, message, meta) {
  if (!condition) {
    errors.push({
      code,
      message,
      ...(meta || {})
    });
  }
}

function validateTopLevel(manifest, errors) {
  assert(
    errors,
    manifest && typeof manifest === "object",
    "TOP_LEVEL_INVALID",
    "container.json must be a JSON object"
  );

  const required = ["project", "arc", "tools", "env", "media"];
  for (const key of required) {
    assert(
      errors,
      Object.prototype.hasOwnProperty.call(manifest || {}, key),
      "TOP_LEVEL_MISSING",
      `Missing required top-level property "${key}"`,
      { key }
    );
  }
}

function validateProject(manifest, errors) {
  const project = manifest.project || {};
  const required = ["id", "game", "os", "mode", "timestamp"];
  for (const key of required) {
    assert(
      errors,
      typeof project[key] === "string" && project[key].length > 0,
      "PROJECT_FIELD_INVALID",
      `project.${key} must be a non-empty string`,
      { key }
    );
  }
  if (project.os) {
    assert(
      errors,
      ["windows", "macos", "linux"].includes(project.os),
      "PROJECT_OS_INVALID",
      `project.os must be one of windows|macos|linux (got "${project.os}")`
    );
  }
  if (project.mode) {
    assert(
      errors,
      ["preview", "full"].includes(project.mode),
      "PROJECT_MODE_INVALID",
      `project.mode must be one of preview|full (got "${project.mode}")`
    );
  }
}

function validateArc(manifest, errors) {
  const arc = manifest.arc || {};
  assert(
    errors,
    typeof arc.version === "string" && arc.version.length > 0,
    "ARC_VERSION_INVALID",
    "arc.version must be a non-empty string"
  );
  assert(
    errors,
    typeof arc.sha256 === "string" &&
      /^[0-9a-fA-F]{64}$/.test(arc.sha256 || ""),
    "ARC_SHA_INVALID",
    "arc.sha256 must be a 64-character hex string"
  );
}

function validateTools(manifest, errors) {
  const tools = manifest.tools || {};
  ["ffmpeg", "ffprobe"].forEach((toolName) => {
    const tool = tools[toolName] || {};
    assert(
      errors,
      typeof tool.version === "string" && tool.version.length > 0,
      "TOOLS_VERSION_INVALID",
      `${toolName}.version must be a non-empty string`,
      { tool: toolName }
    );
  });
}

function validateEnv(manifest, errors) {
  const env = manifest.env || {};
  const simple = ["node", "npm"];
  simple.forEach((name) => {
    const obj = env[name] || {};
    assert(
      errors,
      typeof obj.version === "string" && obj.version.length > 0,
      "ENV_VERSION_INVALID",
      `env.${name}.version must be a non-empty string`,
      { name }
    );
  });

  const git = env.git || {};
  ["version", "branch", "commit"].forEach((key) => {
    assert(
      errors,
      typeof git[key] === "string" && git[key].length > 0,
      "ENV_GIT_INVALID",
      `env.git.${key} must be a non-empty string`,
      { key }
    );
  });

  const os = env.os || {};
  assert(
    errors,
    ["Windows", "macOS", "Linux"].includes(os.name),
    "ENV_OS_NAME_INVALID",
    `env.os.name must be one of Windows|macOS|Linux (got "${os.name}")`
  );
  assert(
    errors,
    ["win32", "darwin", "linux"].includes(os.platform),
    "ENV_OS_PLATFORM_INVALID",
    `env.os.platform must be one of win32|darwin|linux (got "${os.platform}")`
  );
  assert(
    errors,
    ["x64", "arm64"].includes(os.arch),
    "ENV_OS_ARCH_INVALID",
    `env.os.arch must be one of x64|arm64 (got "${os.arch}")`
  );
}

function validateMediaFiles(baseDir, manifest, errors) {
  const media = manifest.media || {};
  const videoList = Array.isArray(media.video) ? media.video : [];
  const audioList = Array.isArray(media.audio) ? media.audio : [];
  const captionsList = Array.isArray(media.captions || []) ? media.captions : [];
  const imagesList = Array.isArray(media.images || []) ? media.images : [];

  // VIDEO
  videoList.forEach((v, idx) => {
    const relPath = v.path;
    const fullPath = path.resolve(baseDir, relPath || "");
    assert(
      errors,
      typeof relPath === "string" && relPath.length > 0,
      "VIDEO_PATH_INVALID",
      `media.video[${idx}].path must be a non-empty string`,
      { index: idx }
    );
    assert(
      errors,
      fileExists(fullPath),
      "VIDEO_FILE_MISSING",
      `media.video[${idx}].path points to a missing or empty file: ${fullPath}`,
      { index: idx, path: fullPath }
    );

    // ffprobe check
    if (fileExists(fullPath)) {
      try {
        const info = runFfprobe(fullPath, "v:0");
        const stream = (info.streams || [])[0] || {};
        const format = info.format || {};

        const durProbe = Number(format.duration || 0);
        const durManifest = Number(v.durationSec);
        assert(
          errors,
          approxEqual(durManifest, durProbe, 0.25),
          "VIDEO_DURATION_MISMATCH",
          `media.video[${idx}].durationSec (${durManifest}) deviates too much from ffprobe duration (${durProbe})`,
          { index: idx, manifestDuration: durManifest, probeDuration: durProbe }
        );

        const fpsProbe =
          toNumberFps(stream.avg_frame_rate) ||
          toNumberFps(stream.r_frame_rate) ||
          null;
        const fpsManifest = Number(v.fps);
        if (fpsProbe && fpsManifest) {
          assert(
            errors,
            approxEqual(fpsManifest, fpsProbe, 0.1),
            "VIDEO_FPS_MISMATCH",
            `media.video[${idx}].fps (${fpsManifest}) deviates from ffprobe fps (${fpsProbe})`,
            { index: idx, manifestFps: fpsManifest, probeFps: fpsProbe }
          );
        }

        const widthProbe = Number(stream.width);
        const heightProbe = Number(stream.height);
        assert(
          errors,
          widthProbe === v.width && heightProbe === v.height,
          "VIDEO_SIZE_MISMATCH",
          `media.video[${idx}].width/height (${v.width}x${v.height}) do not match ffprobe (${widthProbe}x${heightProbe})`,
          {
            index: idx,
            manifestWidth: v.width,
            manifestHeight: v.height,
            probeWidth: widthProbe,
            probeHeight: heightProbe
          }
        );

        const pixFmtProbe = stream.pix_fmt;
        const sarProbe = stream.sample_aspect_ratio;
        if (v.pixFmt) {
          assert(
            errors,
            pixFmtProbe === v.pixFmt,
            "VIDEO_PIXFMT_MISMATCH",
            `media.video[${idx}].pixFmt ("${v.pixFmt}") does not match ffprobe ("${pixFmtProbe}")`,
            { index: idx, manifestPixFmt: v.pixFmt, probePixFmt: pixFmtProbe }
          );
        }
        if (v.sar) {
          assert(
            errors,
            sarProbe === v.sar,
            "VIDEO_SAR_MISMATCH",
            `media.video[${idx}].sar ("${v.sar}") does not match ffprobe ("${sarProbe}")`,
            { index: idx, manifestSar: v.sar, probeSar: sarProbe }
          );
        }

        // bitrate sanity check
        const st = fs.statSync(fullPath);
        const bits = st.size * 8;
        const kbps = bits / 1000 / (durProbe || durManifest || 1);
        const manifestBitrate = Number(v.bitrateKbps);
        if (manifestBitrate > 0 && kbps > 0) {
          const ratio = kbps / manifestBitrate;
          const within = ratio > 0.7 && ratio < 1.3;
          assert(
            errors,
            within,
            "VIDEO_BITRATE_SUSPECT",
            `media.video[${idx}].bitrateKbps (${manifestBitrate}) differs significantly from computed bitrate (${kbps.toFixed(
              0
            )})`,
            {
              index: idx,
              manifestBitrateKbps: manifestBitrate,
              computedBitrateKbps: kbps
            }
          );
        }
      } catch (err) {
        errors.push({
          code: "VIDEO_FFPROBE_ERROR",
          message: `ffprobe failed for media.video[${idx}]: ${err.message}`,
          index: idx,
          path: fullPath
        });
      }
    }

    // SHA256
    if (fileExists(fullPath) && typeof v.sha256 === "string") {
      const actual = computeSha256(fullPath);
      assert(
        errors,
        actual.toLowerCase() === v.sha256.toLowerCase(),
        "VIDEO_SHA_MISMATCH",
        `media.video[${idx}].sha256 does not match computed file hash`,
        { index: idx, manifestSha: v.sha256, computedSha: actual }
      );
    }
  });

  // AUDIO
  audioList.forEach((a, idx) => {
    const relPath = a.path;
    const fullPath = path.resolve(baseDir, relPath || "");
    assert(
      errors,
      typeof relPath === "string" && relPath.length > 0,
      "AUDIO_PATH_INVALID",
      `media.audio[${idx}].path must be a non-empty string`,
      { index: idx }
    );
    assert(
      errors,
      fileExists(fullPath),
      "AUDIO_FILE_MISSING",
      `media.audio[${idx}].path points to a missing or empty file: ${fullPath}`,
      { index: idx, path: fullPath }
    );

    if (fileExists(fullPath)) {
      try {
        const info = runFfprobe(fullPath, "a:0");
        const format = info.format || {};
        const durProbe = Number(format.duration || 0);
        const durManifest = Number(a.durationSec);
        assert(
          errors,
          approxEqual(durManifest, durProbe, 0.25),
          "AUDIO_DURATION_MISMATCH",
          `media.audio[${idx}].durationSec (${durManifest}) deviates too much from ffprobe duration (${durProbe})`,
          { index: idx, manifestDuration: durManifest, probeDuration: durProbe }
        );
      } catch (err) {
        errors.push({
          code: "AUDIO_FFPROBE_ERROR",
          message: `ffprobe failed for media.audio[${idx}]: ${err.message}`,
          index: idx,
          path: fullPath
        });
      }
    }

    // SHA256
    if (fileExists(fullPath) && typeof a.sha256 === "string") {
      const actual = computeSha256(fullPath);
      assert(
        errors,
        actual.toLowerCase() === a.sha256.toLowerCase(),
        "AUDIO_SHA_MISMATCH",
        `media.audio[${idx}].sha256 does not match computed file hash`,
        { index: idx, manifestSha: a.sha256, computedSha: actual }
      );
    }
  });

  // CAPTIONS
  captionsList.forEach((c, idx) => {
    const relPath = c.path;
    const fullPath = path.resolve(baseDir, relPath || "");
    if (relPath) {
      assert(
        errors,
        fileExists(fullPath),
        "CAPTIONS_FILE_MISSING",
        `media.captions[${idx}].path points to a missing or empty file: ${fullPath}`,
        { index: idx, path: fullPath }
      );
      if (fileExists(fullPath) && typeof c.sha256 === "string") {
        const actual = computeSha256(fullPath);
        assert(
          errors,
          actual.toLowerCase() === c.sha256.toLowerCase(),
          "CAPTIONS_SHA_MISMATCH",
          `media.captions[${idx}].sha256 does not match computed file hash`,
          { index: idx, manifestSha: c.sha256, computedSha: actual }
        );
      }
    }
  });

  // IMAGES
  imagesList.forEach((img, idx) => {
    const relPath = img.path;
    const fullPath = path.resolve(baseDir, relPath || "");
    if (relPath) {
      assert(
        errors,
        fileExists(fullPath),
        "IMAGE_FILE_MISSING",
        `media.images[${idx}].path points to a missing or empty file: ${fullPath}`,
        { index: idx, path: fullPath }
      );
      if (fileExists(fullPath) && typeof img.sha256 === "string") {
        const actual = computeSha256(fullPath);
        assert(
          errors,
          actual.toLowerCase() === img.sha256.toLowerCase(),
          "IMAGE_SHA_MISMATCH",
          `media.images[${idx}].sha256 does not match computed file hash`,
          { index: idx, manifestSha: img.sha256, computedSha: actual }
        );
      }
    }
  });
}

function generateJUnit(junitPath, manifest, errors) {
  const haveErrors = errors.length > 0;
  const projectId = manifest.project && manifest.project.id;
  const arcVersion = manifest.arc && manifest.arc.version;
  const nameSuffix = projectId ? ` (${projectId})` : "";
  const testName = `packaging-contract${nameSuffix}`;
  const classname = "mobius.packaging";

  // Ensure directory exists
  const dir = path.dirname(junitPath);
  fs.mkdirSync(dir, { recursive: true });

  const escaped = (s) =>
    String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");

  const failureText = haveErrors
    ? errors
        .map(
          (e) =>
            `${e.code}: ${e.message}` +
            (e.path ? ` [path=${e.path}]` : "") +
            (typeof e.index === "number" ? ` [index=${e.index}]` : "")
        )
        .join("\n")
    : "";

  const lines = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push(
    `<testsuite name="packaging-contract" tests="1" failures="${
      haveErrors ? 1 : 0
    }">`
  );
  if (projectId) {
    lines.push(
      `  <properties><property name="project.id" value="${escaped(
        projectId
      )}"/>${
        arcVersion
          ? `<property name="arc.version" value="${escaped(arcVersion)}"/>`
          : ""
      }</properties>`
    );
  }
  lines.push(
    `  <testcase classname="${escaped(classname)}" name="${escaped(
      testName
    )}">`
  );
  if (haveErrors) {
    lines.push(
      `    <failure message="Packaging contract failed" type="ValidationError">`
    );
    lines.push(escaped(failureText));
    lines.push("    </failure>");
  }
  lines.push("  </testcase>");
  lines.push("</testsuite>");

  fs.writeFileSync(junitPath, lines.join("\n"), "utf8");
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv);
  } catch (err) {
    console.error(`[packaging] ${err.message}`);
    process.exit(1);
  }

  const containerPath = path.resolve(args.container);
  const baseDir = path.dirname(containerPath);

  if (!fileExists(containerPath)) {
    console.error(
      `[packaging] container.json not found or empty at ${containerPath}`
    );
    process.exit(1);
  }

  let manifest;
  try {
    manifest = readJson(containerPath);
  } catch (err) {
    console.error(`[packaging] ${err.message}`);
    process.exit(1);
  }

  const errors = [];

  validateTopLevel(manifest, errors);
  validateProject(manifest, errors);
  validateArc(manifest, errors);
  validateTools(manifest, errors);
  validateEnv(manifest, errors);
  validateMediaFiles(baseDir, manifest, errors);

  // deterministic ordering
  errors.sort((a, b) => {
    if (a.code === b.code) {
      return (a.message || "").localeCompare(b.message || "");
    }
    return (a.code || "").localeCompare(b.code || "");
  });

  if (errors.length > 0) {
    console.error(
      `[packaging] Validation failed with ${errors.length} error(s):`
    );
    for (const e of errors) {
      console.error(
        `  - ${e.code}: ${e.message}${
          e.path ? ` [path=${e.path}]` : ""
        }${typeof e.index === "number" ? ` [index=${e.index}]` : ""}`
      );
    }
  } else {
    console.log("[packaging] container.json passed semantic validation");
  }

  try {
    const junitPath = path.resolve(args.junit);
    generateJUnit(junitPath, manifest, errors);
    console.log(`[packaging] JUnit written to ${junitPath}`);
  } catch (err) {
    console.error(`[packaging] Failed to write JUnit: ${err.message}`);
  }

  process.exit(errors.length > 0 ? 1 : 0);
}

if (require.main === module) {
  main();
}
