#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseArgs(argv) {
  const parsed = {};
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      parsed[key] = next;
      i += 1;
    } else {
      parsed[key] = true;
    }
  }
  return parsed;
}

function log(message) {
  console.log(`[consistency] ${message}`);
}

function run(cmd) {
  log(`exec: ${cmd}`);
  return execSync(cmd, { encoding: "utf8", stdio: "pipe" });
}

function ensureSpecField(value, fieldPath) {
  if (value === undefined || value === null) {
    throw new Error(`ARC spec missing required field: ${fieldPath}`);
  }
  return value;
}

function formatCommand(template, replacements) {
  return template.replace(/<([^>]+)>/g, (_, key) => {
    const replacement = replacements[key];
    if (replacement === undefined) {
      throw new Error(`Missing replacement for <${key}> in command template: ${template}`);
    }
    return replacement;
  });
}

const args = parseArgs(process.argv);
const GAME = args.game || "sushi-go";
const PLATFORM = args.platform || process.platform;
const OUT_DIR = args["output-dir"] || "consistency_out";

fs.mkdirSync(OUT_DIR, { recursive: true });

const arcPath = path.resolve(__dirname, "../docs/spec/authoritative_rendering_contract.json");
if (!fs.existsSync(arcPath)) {
  throw new Error(`ARC spec missing at ${arcPath}`);
}
const arc = JSON.parse(fs.readFileSync(arcPath, "utf8"));

const videoSpec = ensureSpecField(arc.video, "video");
const resolution = ensureSpecField(videoSpec.resolution, "video.resolution");
const fpsSpec = ensureSpecField(videoSpec.fps, "video.fps");
const pixFmt = ensureSpecField(videoSpec.pix_fmt, "video.pix_fmt");
const sar = ensureSpecField(videoSpec.sar, "video.sar");
const acceptedFps = ensureSpecField(fpsSpec.accepted_avg_frame_rate, "video.fps.accepted_avg_frame_rate");

const extractionSpec = ensureSpecField(arc.extraction, "extraction");
const previewFrames = ensureSpecField(extractionSpec.preview_5s_expected_frames, "extraction.preview_5s_expected_frames");
const extractionCommands = ensureSpecField(extractionSpec.commands, "extraction.commands");
const extractFramesCmdTemplate = ensureSpecField(extractionCommands.extract_frames, "extraction.commands.extract_frames");
const probeCmdTemplate = ensureSpecField(extractionCommands.probe, "extraction.commands.probe");

const goldenSpec = ensureSpecField(arc.golden_tests, "golden_tests");
const ssimSpec = ensureSpecField(goldenSpec.ssim, "golden_tests.ssim");
const ssimSoftPass = ensureSpecField(ssimSpec.soft_pass, "golden_tests.ssim.soft_pass");
const ssimPass = ensureSpecField(ssimSpec.pass, "golden_tests.ssim.pass");

function assertEqual(name, got, expected) {
  if (got !== expected) {
    throw new Error(`${name} mismatch: expected ${expected}, got ${got}`);
  }
}

//
// 1. Render preview video (5s)
//
const preview = path.join(OUT_DIR, `${GAME}_${PLATFORM}_preview.mp4`);
run(`node scripts/render.js --project-id ${GAME} --mode preview --preview-seconds 5 --out ${preview}`);

//
// 2. ffprobe metadata
//
const probeJson = path.join(OUT_DIR, "ffprobe.json");
const probeCmd = formatCommand(probeCmdTemplate, {
  input: preview,
  video: preview,
  frames_dir: path.join(OUT_DIR, "frames")
});
const probeOutput = run(probeCmd);
fs.writeFileSync(probeJson, probeOutput);

//
// 3. Validate metadata vs standards
//
const probe = JSON.parse(fs.readFileSync(probeJson, "utf8"));
const stream = probe.streams[0];

assertEqual("width", String(stream.width), String(ensureSpecField(resolution.width, "video.resolution.width")));
assertEqual("height", String(stream.height), String(ensureSpecField(resolution.height, "video.resolution.height")));
assertEqual("pix_fmt", stream.pix_fmt, pixFmt);
assertEqual("sar", stream.sample_aspect_ratio, sar);

const fps = stream.avg_frame_rate;
if (!acceptedFps.includes(fps)) {
  throw new Error(`FPS invalid: ${fps}`);
}

//
// 4. Extract frames
//
const framesDir = path.join(OUT_DIR, "frames");
fs.mkdirSync(framesDir, { recursive: true });
const extractFramesCmd = formatCommand(extractFramesCmdTemplate, {
  input: preview,
  video: preview,
  frames_dir: framesDir
});
run(extractFramesCmd);

const frames = fs.readdirSync(framesDir).filter(f => f.endsWith(".png"));
const minFrames = ensureSpecField(previewFrames.min, "extraction.preview_5s_expected_frames.min");
const maxFrames = ensureSpecField(previewFrames.max, "extraction.preview_5s_expected_frames.max");
if (frames.length < minFrames || frames.length > maxFrames) {
  throw new Error(`Frame count out of range: ${frames.length}`);
}

//
// 5. SSIM against golden
//
const goldenDir = `tests/golden/${GAME}/${PLATFORM}/frames`;
const ssimLog = path.join(OUT_DIR, "ssim.log");
run(
  `ffmpeg -i "${framesDir}/%05d.png" -i "${goldenDir}/%05d.png" -lavfi ssim="stats_file=${ssimLog}" -f null -`
);

const ssimRaw = fs.readFileSync(ssimLog, "utf8");
const matches = [...ssimRaw.matchAll(/All:(\d+\.\d+)/g)];
if (matches.length === 0) {
  throw new Error("Unable to parse SSIM results");
}
const avgSSIM = matches.reduce((acc, m) => acc + parseFloat(m[1]), 0) / matches.length;

log(`Average SSIM: ${avgSSIM}`);

if (avgSSIM < ssimSoftPass) {
  throw new Error(`SSIM below soft-pass threshold (${ssimSoftPass}): ${avgSSIM}`);
}

if (avgSSIM < ssimPass) {
  log(`Average SSIM below pass threshold (${ssimPass}) but above soft-pass; review required.`);
}

//
// 6. JUnit output
//
const junitPath = path.join(OUT_DIR, "junit.xml");

fs.writeFileSync(
  junitPath,
  `<?xml version="1.0" encoding="UTF-8"?>
<testsuite name="rendering_consistency" tests="3">
  <testcase name="metadata">
    <system-out><![CDATA[
${JSON.stringify(stream, null, 2)}
    ]]></system-out>
  </testcase>

  <testcase name="frames">
    <system-out>Frames extracted: ${frames.length}</system-out>
  </testcase>

  <testcase name="ssim">
    <system-out>SSIM: ${avgSSIM}</system-out>
  </testcase>
</testsuite>`
);

log("Rendering consistency check complete.");
