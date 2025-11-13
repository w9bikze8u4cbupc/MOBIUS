#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

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
const ARC_PATH = args.arc
  ? path.resolve(args.arc)
  : path.resolve(__dirname, "../docs/spec/authoritative_rendering_contract.json");
const arc = loadArc(ARC_PATH);
const ARC_PLATFORM = normalizePlatform(PLATFORM);
const OUT_DIR = args["output-dir"] || "consistency_out";

fs.mkdirSync(OUT_DIR, { recursive: true });

const SSIM_MIN = getEffectiveSsimMin(arc, ARC_PLATFORM);

log(`Using ARC file: ${ARC_PATH}`);
logArcSummary(arc);
log(`Effective SSIM min for ${ARC_PLATFORM}: ${SSIM_MIN}`);

function log(msg) {
  console.log(`[consistency] ${msg}`);
}

function run(cmd) {
  log(`exec: ${cmd}`);
  return execSync(cmd, { encoding: "utf8", stdio: "pipe" });
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
run(
  `ffprobe -v error -select_streams v:0 -show_entries stream=width,height,avg_frame_rate,r_frame_rate,pix_fmt,sample_aspect_ratio -of json "${preview}" > ${probeJson}`
);

//
// 3. Validate metadata vs standards
//
const probe = JSON.parse(fs.readFileSync(probeJson, "utf8"));
const stream = probe.streams[0];

function assertEqual(name, got, expected) {
  if (got !== expected) {
    throw new Error(`${name} mismatch: expected ${expected}, got ${got}`);
  }
}

assertEqual("width", String(stream.width), "1920");
assertEqual("height", String(stream.height), "1080");
assertEqual("pix_fmt", stream.pix_fmt, "yuv420p");
assertEqual("sar", stream.sample_aspect_ratio, "1:1");

//
// FPS: allow "30" or "30000/1001" extraction, but expect actual rendering = 30
//
const fps = stream.avg_frame_rate;
if (!(fps === "30" || fps === "30/1" || fps === "30000/1001")) {
  throw new Error(`FPS invalid: ${fps}`);
}

//
// 4. Extract frames
//
const framesDir = path.join(OUT_DIR, "frames");
fs.mkdirSync(framesDir, { recursive: true });

run(`ffmpeg -i "${preview}" -vf fps=30 "${framesDir}/%05d.png"`);

const frames = fs.readdirSync(framesDir).filter(f => f.endsWith(".png"));
if (frames.length < 149 || frames.length > 151) {
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
if (matches.length === 0) {
  throw new Error("Unable to parse SSIM values from ffmpeg output");
}

const avgSSIM =
  matches.reduce((acc, m) => acc + parseFloat(m[1]), 0) / matches.length;
const avgSsimDisplay = avgSSIM.toFixed(4);
const avgSsimForJUnit = avgSSIM.toFixed(6);
const thresholdDisplay = SSIM_MIN.toFixed(4);

log(
  `Average SSIM: ${avgSsimDisplay} (threshold ${thresholdDisplay} for ${ARC_PLATFORM})`
);

if (avgSSIM < SSIM_MIN) {
  throw new Error(
    `SSIM below threshold: value=${avgSsimDisplay} threshold=${thresholdDisplay} platform=${ARC_PLATFORM}`
  );
}

//
// 6. JUnit output
//
const junitPath = path.join(OUT_DIR, "junit.xml");
const propertiesXml = arcToJUnitPropertiesXml(arc);

fs.writeFileSync(
  junitPath,
  `<?xml version="1.0" encoding="UTF-8"?>
<testsuite name="rendering_consistency" tests="3">
${propertiesXml}
  <testcase name="metadata">
    <system-out><![CDATA[
${JSON.stringify(stream, null, 2)}
    ]]></system-out>
  </testcase>

  <testcase name="frames">
    <system-out>Frames extracted: ${frames.length}</system-out>
  </testcase>

  <testcase name="ssim">
    <system-out>SSIM: ${avgSsimForJUnit} threshold=${thresholdDisplay} platform=${ARC_PLATFORM}</system-out>
  </testcase>
</testsuite>`
);

log("Rendering consistency check complete.");

function loadArc(filePath) {
  const resolvedPath = path.resolve(filePath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`ARC file not found: ${resolvedPath}`);
  }

  try {
    const raw = fs.readFileSync(resolvedPath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`Failed to load ARC from ${resolvedPath}: ${error.message}`);
  }
}

function normalizePlatform(platform) {
  const token = String(platform).toLowerCase();
  if (token === "win32" || token === "windows" || token === "win") return "windows";
  if (token === "darwin" || token === "macos" || token === "mac" || token === "osx") {
    return "macos";
  }
  if (token === "linux") return "linux";
  return token;
}

function getEffectiveSsimMin(arcConfig, platform) {
  const globalMin = arcConfig?.validation?.ssim?.min;
  if (!Number.isFinite(globalMin)) {
    throw new Error("ARC validation.ssim.min is not configured or not numeric");
  }

  const perPlatform = arcConfig?.validation?.ssim?.perPlatform;
  if (!perPlatform || typeof perPlatform !== "object") {
    return globalMin;
  }

  const osConfig = perPlatform[platform];
  if (!osConfig || typeof osConfig !== "object") {
    return globalMin;
  }

  const osMin = osConfig.min;
  if (!Number.isFinite(osMin)) {
    return globalMin;
  }

  return osMin;
}

function logArcSummary(arcConfig) {
  if (arcConfig?.validation?.ssim) {
    log(`SSIM: global.min=${arcConfig.validation.ssim.min}`);

    if (arcConfig.validation.ssim.perPlatform) {
      const per = arcConfig.validation.ssim.perPlatform;
      const line = ["windows", "macos", "linux"]
        .filter((os) => per[os] && per[os].min !== undefined)
        .map((os) => `${os}=${per[os].min}`)
        .join(", ");
      if (line) {
        log(`      perPlatform: ${line}`);
      }
    }
  } else {
    log("SSIM: <missing validation.ssim section in ARC>");
  }
}

function arcToJUnitPropertiesXml(arcConfig) {
  if (!arcConfig?.validation?.ssim) {
    return "";
  }

  const props = [];
  const pushProp = (name, value) => {
    if (value === undefined || value === null) return;
    props.push(
      `    <property name="${escapeXml(name)}" value="${escapeXml(String(value))}" />`
    );
  };

  pushProp("arc.validation.ssim.min", arcConfig.validation.ssim.min);

  const per = arcConfig.validation.ssim.perPlatform;
  if (per && typeof per === "object") {
    ["windows", "macos", "linux"].forEach((os) => {
      if (!per[os]) return;
      pushProp(`arc.validation.ssim.perPlatform.${os}.min`, per[os].min);
    });
  }

  if (props.length === 0) {
    return "";
  }

  return `  <properties>\n${props.join("\n")}\n  </properties>\n`;
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
