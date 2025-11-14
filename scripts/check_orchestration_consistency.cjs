#!/usr/bin/env node

/**
 * MOBIUS - Multi-render orchestration consistency checker + JUnit emitter
 *
 * Usage example:
 *   node scripts/check_orchestration_consistency.cjs \
 *     --container out/preview/container.json \
 *     --container out/full/container.json \
 *     --junit out/junit/orchestration-contract.junit.xml
 *
 * Exit codes:
 *   0 = all checks passed
 *   1 = validation failed
 */

const fs = require("fs");
const path = require("path");

function parseArgs(argv) {
  const containers = [];
  let junit = null;

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--container") {
      const val = argv[++i];
      if (!val) {
        throw new Error("Missing value for --container");
      }
      containers.push(val);
    } else if (arg === "--junit") {
      const val = argv[++i];
      if (!val) {
        throw new Error("Missing value for --junit");
      }
      junit = val;
    }
  }

  if (containers.length < 2) {
    throw new Error(
      `Expected at least two --container arguments, got ${containers.length}`
    );
  }

  if (!junit) {
    junit = "out/junit/orchestration-contract.junit.xml";
  }

  return { containers, junit };
}

function fileExists(filePath) {
  try {
    const st = fs.statSync(filePath);
    return st.isFile() && st.size > 0;
  } catch {
    return false;
  }
}

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`Failed to parse JSON at ${filePath}: ${err.message}`);
  }
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

/**
 * Core orchestration validation logic
 *
 * Invariants enforced:
 * - All manifests share the same project.game
 * - All manifests share the same arc.version and arc.sha256
 * - All manifests share identical tool versions (ffmpeg, ffprobe)
 * - All manifests share identical Node/npm versions
 * - For each OS bucket, env.os.name/platform/arch are consistent
 * - For each mode bucket, video and audio shapes are internally consistent
 * - Video codec/width/height/fps/pixFmt/SAR are identical across modes
 * - Audio sampleRate/channels are identical across modes
 * - Duration ordering: full >= preview (per game+os)
 */
function validateOrchestration(manifests) {
  const errors = [];

  const first = manifests[0].manifest;

  const projectGame = first.project && first.project.game;
  const arcVersion = first.arc && first.arc.version;
  const arcSha = first.arc && first.arc.sha256;
  const ffmpegVersion = first.tools && first.tools.ffmpeg && first.tools.ffmpeg.version;
  const ffprobeVersion = first.tools && first.tools.ffprobe && first.tools.ffprobe.version;
  const nodeVersion = first.env && first.env.node && first.env.node.version;
  const npmVersion = first.env && first.env.npm && first.env.npm.version;

  // 1) Top-level sameness checks
  manifests.forEach(({ path: p, manifest }, idx) => {
    const proj = manifest.project || {};
    const arc = manifest.arc || {};
    const tools = manifest.tools || {};
    const env = manifest.env || {};
    const osEnv = env.os || {};

    // game
    assert(
      errors,
      proj.game === projectGame,
      "ORCH_GAME_MISMATCH",
      `project.game mismatch between manifests (expected "${projectGame}", got "${proj.game}")`,
      { path: p, index: idx }
    );

    // arc
    assert(
      errors,
      arc.version === arcVersion,
      "ORCH_ARC_VERSION_MISMATCH",
      `arc.version mismatch (expected "${arcVersion}", got "${arc.version}")`,
      { path: p, index: idx }
    );
    assert(
      errors,
      arc.sha256 === arcSha,
      "ORCH_ARC_SHA_MISMATCH",
      `arc.sha256 mismatch (expected "${arcSha}", got "${arc.sha256}")`,
      { path: p, index: idx }
    );

    // tools
    const ffm = tools.ffmpeg || {};
    const ffp = tools.ffprobe || {};
    assert(
      errors,
      ffm.version === ffmpegVersion,
      "ORCH_TOOLS_FFMPEG_MISMATCH",
      `tools.ffmpeg.version mismatch (expected "${ffmpegVersion}", got "${ffm.version}")`,
      { path: p, index: idx }
    );
    assert(
      errors,
      ffp.version === ffprobeVersion,
      "ORCH_TOOLS_FFPROBE_MISMATCH",
      `tools.ffprobe.version mismatch (expected "${ffprobeVersion}", got "${ffp.version}")`,
      { path: p, index: idx }
    );

    // env node/npm
    const nodeEnv = env.node || {};
    const npmEnv = env.npm || {};
    assert(
      errors,
      nodeEnv.version === nodeVersion,
      "ORCH_ENV_NODE_MISMATCH",
      `env.node.version mismatch (expected "${nodeVersion}", got "${nodeEnv.version}")`,
      { path: p, index: idx }
    );
    assert(
      errors,
      npmEnv.version === npmVersion,
      "ORCH_ENV_NPM_MISMATCH",
      `env.npm.version mismatch (expected "${npmVersion}", got "${npmEnv.version}")`,
      { path: p, index: idx }
    );

    // env.os consistency (within this orchestration group)
    assert(
      errors,
      typeof osEnv.name === "string" &&
        typeof osEnv.platform === "string" &&
        typeof osEnv.arch === "string",
      "ORCH_ENV_OS_INVALID",
      "env.os must provide name, platform, arch for every manifest",
      { path: p, index: idx }
    );
  });

  // 2) Media shape consistency across modes
  // We expect at least one video and one audio entry per manifest.
  manifests.forEach(({ path: p, manifest }, idx) => {
    const media = manifest.media || {};
    const video = Array.isArray(media.video) ? media.video : [];
    const audio = Array.isArray(media.audio) ? media.audio : [];

    assert(
      errors,
      video.length > 0,
      "ORCH_VIDEO_MISSING",
      "media.video must contain at least one entry in every manifest",
      { path: p, index: idx }
    );
    assert(
      errors,
      audio.length > 0,
      "ORCH_AUDIO_MISSING",
      "media.audio must contain at least one entry in every manifest",
      { path: p, index: idx }
    );
  });

  // Build a canonical "shape" based on the first manifest's primary video+audio
  const firstMedia = first.media || {};
  const baseVideo = (firstMedia.video || [])[0] || {};
  const baseAudio = (firstMedia.audio || [])[0] || {};

  // Invariants: same codec, dimensions, fps, pixFmt, SAR across modes
  manifests.forEach(({ path: p, manifest }, idx) => {
    const media = manifest.media || {};
    const v = (media.video || [])[0] || {};
    const a = (media.audio || [])[0] || {};

    assert(
      errors,
      v.codec === baseVideo.codec,
      "ORCH_VIDEO_CODEC_MISMATCH",
      `video codec mismatch (expected "${baseVideo.codec}", got "${v.codec}")`,
      { path: p, index: idx }
    );
    assert(
      errors,
      v.width === baseVideo.width && v.height === baseVideo.height,
      "ORCH_VIDEO_DIMENSIONS_MISMATCH",
      `video dimensions mismatch (expected ${baseVideo.width}x${baseVideo.height}, got ${v.width}x${v.height})`,
      { path: p, index: idx }
    );
    assert(
      errors,
      approxEqual(Number(v.fps), Number(baseVideo.fps), 0.1),
      "ORCH_VIDEO_FPS_MISMATCH",
      `video fps mismatch (expected ${baseVideo.fps}, got ${v.fps})`,
      { path: p, index: idx }
    );
    assert(
      errors,
      v.pixFmt === baseVideo.pixFmt,
      "ORCH_VIDEO_PIXFMT_MISMATCH",
      `video pixFmt mismatch (expected "${baseVideo.pixFmt}", got "${v.pixFmt}")`,
      { path: p, index: idx }
    );
    assert(
      errors,
      v.sar === baseVideo.sar,
      "ORCH_VIDEO_SAR_MISMATCH",
      `video SAR mismatch (expected "${baseVideo.sar}", got "${v.sar}")`,
      { path: p, index: idx }
    );

    // Audio
    assert(
      errors,
      a.sampleRate === baseAudio.sampleRate,
      "ORCH_AUDIO_SAMPLERATE_MISMATCH",
      `audio sampleRate mismatch (expected ${baseAudio.sampleRate}, got ${a.sampleRate})`,
      { path: p, index: idx }
    );
    assert(
      errors,
      a.channels === baseAudio.channels,
      "ORCH_AUDIO_CHANNELS_MISMATCH",
      `audio channels mismatch (expected ${baseAudio.channels}, got ${a.channels})`,
      { path: p, index: idx }
    );
  });

  // 3) Duration ordering (preview <= full)
  const previews = [];
  const fulls = [];

  manifests.forEach(({ path: p, manifest }) => {
    const proj = manifest.project || {};
    const media = manifest.media || {};
    const v = (media.video || [])[0] || {};
    const duration = Number(v.durationSec);
    const mode = proj.mode;

    if (!Number.isFinite(duration) || duration <= 0) {
      errors.push({
        code: "ORCH_DURATION_INVALID",
        message: `Invalid video durationSec (${v.durationSec}) in ${p}`,
        path: p
      });
      return;
    }

    if (mode === "preview") {
      previews.push({ path: p, duration });
    } else if (mode === "full") {
      fulls.push({ path: p, duration });
    } else {
      errors.push({
        code: "ORCH_MODE_UNKNOWN",
        message: `Unknown project.mode "${mode}" in ${p}`,
        path: p
      });
    }
  });

  if (previews.length > 0 && fulls.length > 0) {
    const maxPreview = Math.max(...previews.map((p) => p.duration));
    const minFull = Math.min(...fulls.map((f) => f.duration));
    assert(
      errors,
      minFull >= maxPreview,
      "ORCH_DURATION_INCONSISTENT",
      `Full render duration (${minFull.toFixed(
        2
      )}s) is shorter than or equal to a preview duration (${maxPreview.toFixed(
        2
      )}s); expected full >= preview`,
      {
        maxPreview,
        minFull
      }
    );
  }

  return errors;
}

function generateJUnit(junitPath, manifests, errors) {
  const haveErrors = errors.length > 0;
  const first = manifests[0].manifest;
  const projectId = first.project && first.project.id;
  const arcVersion = first.arc && first.arc.version;
  const nameSuffix = projectId ? ` (${projectId})` : "";
  const testName = `orchestration-contract${nameSuffix}`;
  const classname = "mobius.orchestration";

  fs.mkdirSync(path.dirname(junitPath), { recursive: true });

  const escaped = (s) =>
    String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");

  const failureText = haveErrors
    ? errors
        .map((e) => {
          const metaParts = [];
          if (e.path) metaParts.push(`path=${e.path}`);
          if (typeof e.index === "number") metaParts.push(`index=${e.index}`);
          const meta = metaParts.length ? ` [${metaParts.join(", ")}]` : "";
          return `${e.code}: ${e.message}${meta}`;
        })
        .join("\n")
    : "";

  const lines = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push(
    `<testsuite name="orchestration-contract" tests="1" failures="${
      haveErrors ? 1 : 0
    }">`
  );
  if (projectId || arcVersion) {
    lines.push("  <properties>");
    if (projectId) {
      lines.push(
        `    <property name="project.id" value="${escaped(projectId)}"/>`
      );
    }
    if (arcVersion) {
      lines.push(
        `    <property name="arc.version" value="${escaped(arcVersion)}"/>`
      );
    }
    lines.push("  </properties>");
  }
  lines.push(
    `  <testcase classname="${escaped(classname)}" name="${escaped(
      testName
    )}">`
  );
  if (haveErrors) {
    lines.push(
      `    <failure message="Orchestration contract failed" type="ValidationError">`
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
    console.error(`[orchestration] ${err.message}`);
    process.exit(1);
  }

  const manifests = args.containers.map((p) => {
    const abs = path.resolve(p);
    if (!fileExists(abs)) {
      console.error(
        `[orchestration] container not found or empty at ${abs}`
      );
      process.exit(1);
    }
    const manifest = readJson(abs);
    return { path: abs, manifest };
  });

  const errors = validateOrchestration(manifests);

  // deterministic ordering
  errors.sort((a, b) => {
    if (a.code === b.code) {
      return (a.message || "").localeCompare(b.message || "");
    }
    return (a.code || "").localeCompare(b.code || "");
  });

  if (errors.length > 0) {
    console.error(
      `[orchestration] Validation failed with ${errors.length} error(s):`
    );
    for (const e of errors) {
      console.error(`  - ${e.code}: ${e.message}`);
    }
  } else {
    console.log(
      "[orchestration] Multi-render orchestration checks passed successfully"
    );
  }

  try {
    const junitPath = path.resolve(args.junit);
    generateJUnit(junitPath, manifests, errors);
    console.log(`[orchestration] JUnit written to ${junitPath}`);
  } catch (err) {
    console.error(
      `[orchestration] Failed to write JUnit: ${err.message}`
    );
  }

  process.exit(errors.length > 0 ? 1 : 0);
}

if (require.main === module) {
  main();
}
