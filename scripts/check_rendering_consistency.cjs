#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

function resolveRepoPath(relativePath) {
  return path.resolve(__dirname, "..", relativePath);
}

const ARC_PATH = resolveRepoPath("docs/spec/authoritative_rendering_contract.json");

function loadArc() {
  const raw = fs.readFileSync(ARC_PATH, "utf8");
  return JSON.parse(raw);
}

function logArcSummary(arc) {
  // Keep this output concise but explicit, so CI logs always show expectations.
  console.log("── ARC SUMMARY ───────────────────────────────────────────");
  if (arc.version) {
    console.log(`ARC version: ${arc.version}`);
  }

  if (arc.video) {
    console.log(
      `Video: ${arc.video.width}x${arc.video.height} @ ${arc.video.fps}fps, ` +
        `pix_fmt=${arc.video.pixFmt || "n/a"}, sar=${arc.video.sar || "n/a"}`
    );
  } else {
    console.log("Video: <missing video section in ARC>");
  }

  if (arc.audio) {
    console.log(
      `Audio: sampleRate=${arc.audio.sampleRate}Hz, channels=${arc.audio.channels}, ` +
        `targetLufs=${arc.audio.targetLufs}, truePeakCeiling=${arc.audio.truePeakCeiling} dBTP`
    );
  } else {
    console.log("Audio: <missing audio section in ARC>");
  }

  if (arc.extraction) {
    console.log(
      `Extraction: method=${arc.extraction.method}, ` +
        `frameCountTolerancePct=${arc.extraction.frameCountTolerancePct}`
    );
  } else {
    console.log("Extraction: <missing extraction section in ARC>");
  }

  if (arc.validation?.ssim) {
    console.log(`SSIM: min=${arc.validation.ssim.min}`);
  } else {
    console.log("SSIM: <missing validation.ssim section in ARC>");
  }

  console.log("───────────────────────────────────────────────────────────");
}

const args = {};
for (let i = 2; i < process.argv.length; i += 1) {
  const token = process.argv[i];
  if (!token.startsWith("--")) continue;
  const key = token.slice(2);
  const next = process.argv[i + 1];
  if (next && !next.startsWith("--")) {
    args[key] = next;
    i += 1;
  } else {
    args[key] = true;
  }
}

const GAME = args.game || "sushi-go";
const PLATFORM = args.platform || process.platform;
const OUT_DIR = args["output-dir"] || "consistency_out";

function log(msg) {
  console.log(`[consistency] ${msg}`);
}

function run(cmd) {
  log(`exec: ${cmd}`);
  return execSync(cmd, { encoding: "utf8", stdio: "pipe" });
}

function assertEqual(name, got, expected) {
  if (got !== expected) {
    throw new Error(`${name} mismatch: expected ${expected}, got ${got}`);
  }
}

function parseFps(value) {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string") {
    const parts = value.split("/");
    if (parts.length === 2) {
      const [num, den] = parts.map(Number);
      if (!Number.isNaN(num) && !Number.isNaN(den) && den !== 0) {
        return num / den;
      }
    }
    const numeric = Number(value);
    if (!Number.isNaN(numeric)) {
      return numeric;
    }
  }
  throw new Error(`Unable to parse FPS value: ${value}`);
}

async function main() {
  const arc = loadArc();
  logArcSummary(arc);

  fs.mkdirSync(OUT_DIR, { recursive: true });

  //
  // 1. Render preview video (5s)
  //
  const preview = path.join(OUT_DIR, `${GAME}_${PLATFORM}_preview.mp4`);
  run(
    `node scripts/render.js --project-id ${GAME} --mode preview --preview-seconds 5 --out ${preview}`
  );

  //
  // 2. ffprobe metadata
  //
  const probeJson = path.join(OUT_DIR, "ffprobe.json");
  run(
    `ffprobe -v error -select_streams v:0 -show_entries stream=width,height,avg_frame_rate,r_frame_rate,pix_fmt,sample_aspect_ratio -of json "${preview}" > ${probeJson}`
  );

  //
  // 3. Validate metadata vs standards
  //
  const probe = JSON.parse(fs.readFileSync(probeJson, "utf8"));
  const stream = probe.streams[0];
  const expectedVideo = arc.video || {};

  assertEqual("width", String(stream.width), String(expectedVideo.width));
  assertEqual("height", String(stream.height), String(expectedVideo.height));
  if (expectedVideo.pixFmt) {
    assertEqual("pix_fmt", stream.pix_fmt, expectedVideo.pixFmt);
  }
  if (expectedVideo.sar) {
    assertEqual("sar", stream.sample_aspect_ratio, expectedVideo.sar);
  }

  const fps = stream.avg_frame_rate;
  const acceptableFps = expectedVideo.acceptableAvgFrameRates || [];
  if (acceptableFps.length > 0) {
    if (!acceptableFps.includes(fps)) {
      throw new Error(`FPS invalid: ${fps}`);
    }
  } else if (expectedVideo.fps) {
    const expectedFps = String(expectedVideo.fps);
    if (!(fps === expectedFps || fps === `${expectedFps}/1`)) {
      throw new Error(`FPS invalid: ${fps}`);
    }
  }

  //
  // 4. Extract frames
  //
  const framesDir = path.join(OUT_DIR, "frames");
  fs.mkdirSync(framesDir, { recursive: true });

  const extraction = arc.extraction || {};
  const previewSeconds = 5;
  const targetFps = expectedVideo.fps ? parseFps(expectedVideo.fps) : 30;
  const ffmpegFps = extraction.fpsOverride || targetFps;

  run(`ffmpeg -i "${preview}" -vf fps=${ffmpegFps} "${framesDir}/%05d.png"`);

  const frames = fs.readdirSync(framesDir).filter(f => f.endsWith(".png"));
  const expectedFrameCount = Math.round(targetFps * previewSeconds);
  const tolerancePct = extraction.frameCountTolerancePct ?? 1;
  const minFrames = Math.floor(expectedFrameCount * (1 - tolerancePct / 100));
  const maxFrames = Math.ceil(expectedFrameCount * (1 + tolerancePct / 100));
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

  //
  // Parse SSIM
  //
  const ssimRaw = fs.readFileSync(ssimLog, "utf8");
  const matches = [...ssimRaw.matchAll(/All:(\d+\.\d+)/g)];
  const avgSSIM = matches.reduce((acc, m) => acc + parseFloat(m[1]), 0) / matches.length;

  log(`Average SSIM: ${avgSSIM}`);

  const ssimMin = arc.validation?.ssim?.min ?? 0.92;
  if (avgSSIM < ssimMin) {
    throw new Error(`SSIM too low: ${avgSSIM}`);
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
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
