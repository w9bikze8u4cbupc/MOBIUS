#!/usr/bin/env node
/* MOBIUS — Rendering Consistency Check (ARC-driven)
 *
 * This script enforces the Authoritative Rendering Contract (ARC):
 *   docs/spec/authoritative_rendering_contract.json
 *
 * It will:
 *   1. Render a 5s preview for a given game.
 *   2. Probe video metadata and validate against ARC.video + ARC.audio.
 *   3. Extract frames and validate frame count vs ARC.extraction.
 *   4. Compare against golden frames using SSIM thresholds from ARC.golden_tests.
 *   5. Emit JUnit XML and consistency artifacts.
 */

import fs from "fs";
import path from "path";
import { execSync } from "child_process";

// --------------------------
// CLI args
// --------------------------
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      out[key] = true;
    } else {
      out[key] = next;
      i++;
    }
  }
  return out;
}

const argv = parseArgs(process.argv.slice(2));
const GAME = argv.game || "sushi-go";
const PLATFORM = argv.platform || process.platform; // e.g. "win32", "darwin", "linux" or runner label
const OUT_DIR = argv.outDir || argv["output-dir"] || "consistency_out";

// --------------------------
// Helpers
// --------------------------
function log(msg) {
  console.log(`[consistency] ${msg}`);
}

function run(cmd) {
  log(`exec: ${cmd}`);
  return execSync(cmd, { encoding: "utf8", stdio: "pipe" });
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

// --------------------------
// Load ARC (Authoritative Rendering Contract)
// --------------------------
const ARC_PATH = path.resolve("docs/spec/authoritative_rendering_contract.json");

if (!fs.existsSync(ARC_PATH)) {
  throw new Error(
    `ARC spec missing at ${ARC_PATH}. This script must be kept in sync with docs/spec/authoritative_rendering_contract.json`
  );
}

const arc = JSON.parse(fs.readFileSync(ARC_PATH, "utf8"));

// Shortcuts
const videoSpec = arc.video;
const audioSpec = arc.audio;
const extractSpec = arc.extraction;
const goldenSpec = arc.golden_tests;

// --------------------------
// Prepare output
// --------------------------
ensureDir(OUT_DIR);

const previewPath = path.join(
  OUT_DIR,
  `${GAME}_${PLATFORM}_preview.mp4`.replace(/[\\/:]/g, "_")
);
const probeJsonPath = path.join(OUT_DIR, "ffprobe.json");
const framesDir = path.join(OUT_DIR, "frames");
const ssimLogPath = path.join(OUT_DIR, "ssim.log");
const junitPath = path.join(OUT_DIR, "junit.xml");

ensureDir(framesDir);

// --------------------------
// 1. Render 5s preview
// --------------------------
//
// NOTE: This assumes scripts/render.js supports:
//   --project-id <game> --mode preview --preview-seconds 5 --out <file>
// Adapt render.js if needed to honor --out.
log("Step 1: rendering 5s preview");
run(
  `node scripts/render.js ` +
    `--project-id ${GAME} ` +
    `--mode preview ` +
    `--preview-seconds 5 ` +
    `--out "${previewPath}"`
);

if (!fs.existsSync(previewPath)) {
  throw new Error(`Preview render missing at ${previewPath}`);
}

// --------------------------
// 2. ffprobe metadata
// --------------------------
log("Step 2: probing video metadata");

const probeCmd =
  `ffprobe -v error ` +
  `-select_streams v:0 ` +
  `-show_entries stream=width,height,avg_frame_rate,r_frame_rate,pix_fmt,sample_aspect_ratio ` +
  `-of json "${previewPath}"`;

const probeJson = run(probeCmd);
fs.writeFileSync(probeJsonPath, probeJson, "utf8");

const probe = JSON.parse(probeJson);
if (!probe.streams || !probe.streams.length) {
  throw new Error("ffprobe returned no video streams");
}
const stream = probe.streams[0];

// --------------------------
// 3. Validate metadata vs ARC
// --------------------------
log("Step 3: validating metadata against ARC");

function assertEqual(name, got, expected) {
  if (String(got) !== String(expected)) {
    throw new Error(`${name} mismatch: expected ${expected}, got ${got}`);
  }
}

function assertOneOf(name, got, allowed) {
  if (!allowed.map(String).includes(String(got))) {
    throw new Error(`${name} mismatch: expected one of ${allowed.join(", ")}, got ${got}`);
  }
}

// Resolution
assertEqual("width", stream.width, videoSpec.resolution.width);
assertEqual("height", stream.height, videoSpec.resolution.height);

// Pixel format
assertEqual("pix_fmt", stream.pix_fmt, videoSpec.pix_fmt);

// SAR
assertEqual("sample_aspect_ratio", stream.sample_aspect_ratio, videoSpec.sar);

// FPS
assertOneOf("avg_frame_rate", stream.avg_frame_rate, videoSpec.fps.accepted_avg_frame_rate);

// --------------------------
// 4. Extract frames + validate count
// --------------------------
log("Step 4: extracting frames and validating count");

const fpsExtractor = extractSpec.frame_extractor_fps;
const extractCmd = `ffmpeg -y -i "${previewPath}" -vf fps=${fpsExtractor} "${framesDir}/%05d.png"`;
run(extractCmd);

const frames = fs.readdirSync(framesDir).filter((f) => f.endsWith(".png"));
const expectedFramesRange = extractSpec.preview_5s_expected_frames;
const frameCount = frames.length;

log(`Extracted ${frameCount} frames`);

if (
  frameCount < expectedFramesRange.min ||
  frameCount > expectedFramesRange.max
) {
  throw new Error(
    `Frame count out of range: got ${frameCount}, expected between ${expectedFramesRange.min} and ${expectedFramesRange.max}`
  );
}

// Optional: placeholder detection based on size
const placeholderMinBytes = goldenSpec.placeholder_bytes_min || 0;
for (const f of frames) {
  const full = path.join(framesDir, f);
  const st = fs.statSync(full);
  if (st.size < placeholderMinBytes) {
    throw new Error(
      `Frame ${f} looks like a placeholder (size ${st.size} < ${placeholderMinBytes} bytes)`
    );
  }
}

// --------------------------
// 5. SSIM vs golden
// --------------------------
log("Step 5: computing SSIM vs golden baselines");

const goldenDir = path.join("tests", "golden", GAME, PLATFORM, "frames");
if (!fs.existsSync(goldenDir)) {
  throw new Error(
    `Golden frames not found at ${goldenDir}. Generate or promote baselines before running consistency checks.`
  );
}

const ssimCmd =
  `ffmpeg -y ` +
  `-i "${framesDir}/%05d.png" ` +
  `-i "${goldenDir}/%05d.png" ` +
  `-lavfi ssim="stats_file=${ssimLogPath}" -f null -`;

run(ssimCmd);

const ssimRaw = fs.readFileSync(ssimLogPath, "utf8");
const matches = [...ssimRaw.matchAll(/All:(\d+\.\d+)/g)];

if (!matches.length) {
  throw new Error("No SSIM values found in ssim.log");
}

const avgSSIM =
  matches.reduce((acc, m) => acc + parseFloat(m[1]), 0) / matches.length;

log(`Average SSIM: ${avgSSIM.toFixed(6)}`);

const passThreshold = goldenSpec.ssim.pass;
const softThreshold = goldenSpec.ssim.soft_pass;
let status = "FAIL";

if (avgSSIM >= passThreshold) {
  status = "PASS";
} else if (avgSSIM >= softThreshold) {
  status = "SOFT_PASS";
}

// For CI purposes, a SOFT_PASS is still a passing run; governance controls promotion.
if (status === "FAIL") {
  throw new Error(
    `SSIM too low: ${avgSSIM} (threshold: FAIL < ${softThreshold}, SOFT_PASS ≥ ${softThreshold}, PASS ≥ ${passThreshold})`
  );
}

// --------------------------
// 6. Emit JUnit report
// --------------------------
log("Step 6: writing JUnit report");

const junitXml = `<?xml version="1.0" encoding="UTF-8"?>
<testsuite name="rendering_consistency" tests="3">
  <testcase name="metadata">
    <system-out><![CDATA[
${JSON.stringify(stream, null, 2)}
    ]]></system-out>
  </testcase>

  <testcase name="frames">
    <system-out>Frames extracted: ${frameCount}</system-out>
  </testcase>

  <testcase name="ssim">
    <system-out>SSIM: ${avgSSIM.toFixed(6)} (status: ${status})</system-out>
  </testcase>
</testsuite>
`;

fs.writeFileSync(junitPath, junitXml, "utf8");

log("Rendering consistency check complete (status: " + status + ").");
