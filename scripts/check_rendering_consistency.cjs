#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { version: PACKAGE_VERSION } = require("../package.json");

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

fs.mkdirSync(OUT_DIR, { recursive: true });

const ARC_METADATA = {
  version: PACKAGE_VERSION,
  video: {
    width: 1920,
    height: 1080,
    fps: 30,
    pixFmt: "yuv420p",
    sar: "1:1",
  },
  audio: {
    sampleRate: 48000,
    channels: 2,
    targetLufs: -16,
    truePeakCeiling: -1,
  },
  extraction: {
    method: "ffmpeg-frames",
    frameCountTolerancePct: Number(((1 / 150) * 100).toFixed(3)),
  },
  validation: {
    ssim: {
      min: 0.92,
    },
  },
};

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
const avgSSIM =
  matches.reduce((acc, m) => acc + parseFloat(m[1]), 0) / matches.length;

log(`Average SSIM: ${avgSSIM}`);

if (avgSSIM < 0.92) {
  throw new Error(`SSIM too low: ${avgSSIM}`);
}

//
// 6. JUnit output
//
const junitPath = path.join(OUT_DIR, "junit.xml");

function arcToJUnitPropertiesXml(arc) {
  const props = [];

  const pushProp = (name, value) => {
    if (value === undefined || value === null) return;
    props.push(
      `    <property name="${String(name)}" value="${String(value).replace(/"/g, "&quot;")}" />`
    );
  };

  pushProp("arc.version", arc.version);
  if (arc.video) {
    pushProp("arc.video.width", arc.video.width);
    pushProp("arc.video.height", arc.video.height);
    pushProp("arc.video.fps", arc.video.fps);
    pushProp("arc.video.pixFmt", arc.video.pixFmt);
    pushProp("arc.video.sar", arc.video.sar);
  }
  if (arc.audio) {
    pushProp("arc.audio.sampleRate", arc.audio.sampleRate);
    pushProp("arc.audio.channels", arc.audio.channels);
    pushProp("arc.audio.targetLufs", arc.audio.targetLufs);
    pushProp("arc.audio.truePeakCeiling", arc.audio.truePeakCeiling);
  }
  if (arc.extraction) {
    pushProp("arc.extraction.method", arc.extraction.method);
    pushProp(
      "arc.extraction.frameCountTolerancePct",
      arc.extraction.frameCountTolerancePct
    );
  }
  if (arc.validation && arc.validation.ssim) {
    pushProp("arc.validation.ssim.min", arc.validation.ssim.min);
  }

  if (props.length === 0) {
    return "";
  }

  return [
    "  <properties>",
    ...props,
    "  </properties>",
  ].join("\n");
}

function buildJUnitXml(testSuiteName, testCases, { failures, arc }) {
  const testsCount = testCases.length;

  const testCasesXml = testCases
    .map((tc) => {
      const className = tc.classname || testSuiteName;
      const parts = [];
      if (tc.failureMessage || tc.systemOut !== undefined) {
        parts.push(`  <testcase name="${tc.name}" classname="${className}">`);
        if (tc.failureMessage) {
          parts.push(
            `    <failure><![CDATA[${tc.failureMessage}]]></failure>`
          );
        }
        if (tc.systemOut !== undefined) {
          const systemOutValue = String(tc.systemOut).replace(
            /]]>/g,
            "]]]]><![CDATA[>"
          );
          parts.push(`    <system-out><![CDATA[${systemOutValue}]]></system-out>`);
        }
        parts.push("  </testcase>");
        return parts.join("\n");
      }
      return `  <testcase name="${tc.name}" classname="${className}" />`;
    })
    .join("\n");

  const propertiesXml = arc ? arcToJUnitPropertiesXml(arc) : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<testsuite name="${testSuiteName}" tests="${testsCount}" failures="${failures}">
${propertiesXml ? propertiesXml + "\n" : ""}${testCasesXml}
</testsuite>
`;
}

const testCases = [
  {
    name: "metadata",
    classname: "rendering_consistency",
    systemOut: `${JSON.stringify(stream, null, 2)}`,
  },
  {
    name: "frames",
    classname: "rendering_consistency",
    systemOut: `Frames extracted: ${frames.length}`,
  },
  {
    name: "ssim",
    classname: "rendering_consistency",
    systemOut: `SSIM: ${avgSSIM}`,
  },
];

const junitXml = buildJUnitXml("rendering_consistency", testCases, {
  failures: 0,
  arc: ARC_METADATA,
});

fs.writeFileSync(junitPath, junitXml);

log("Rendering consistency check complete.");
