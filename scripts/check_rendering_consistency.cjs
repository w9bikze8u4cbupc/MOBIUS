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
const OUT_DIR = args["output-dir"] || "consistency_out";

const ARC = {
  version: "1.0.0",
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
    method: "ffmpeg",
    frameCountTolerancePct: 1,
  },
  validation: {
    ssim: {
      min: 0.92,
      target: 0.95,
    },
  },
};

fs.mkdirSync(OUT_DIR, { recursive: true });

function log(msg) {
  console.log(`[consistency] ${msg}`);
}

function run(cmd) {
  log(`exec: ${cmd}`);
  return execSync(cmd, { encoding: "utf8", stdio: "pipe" });
}

function loadArc() {
  return ARC;
}

function logArcSummary(arc) {
  const video = arc.video
    ? `${arc.video.width}x${arc.video.height}@${arc.video.fps} ${arc.video.pixFmt} ${arc.video.sar}`
    : "<missing video>";
  const audio = arc.audio
    ? `${arc.audio.sampleRate}Hz/${arc.audio.channels}ch (LUFS ${arc.audio.targetLufs}, TP ${arc.audio.truePeakCeiling}dBTP)`
    : "<missing audio>";
  const ssim = arc.validation?.ssim?.min ?? "<missing>";
  log(`ARC version ${arc.version || "n/a"}`);
  log(`ARC video ${video}`);
  log(`ARC audio ${audio}`);
  log(`ARC validation SSIM min ${ssim}`);
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function arcToJUnitPropertiesXml(arc) {
  if (!arc) return "";
  const properties = [];

  if (arc.version) properties.push({ name: "arc.version", value: arc.version });

  if (arc.video) {
    if (arc.video.width) properties.push({ name: "arc.video.width", value: arc.video.width });
    if (arc.video.height) properties.push({ name: "arc.video.height", value: arc.video.height });
    if (arc.video.fps) properties.push({ name: "arc.video.fps", value: arc.video.fps });
    if (arc.video.pixFmt) properties.push({ name: "arc.video.pixFmt", value: arc.video.pixFmt });
    if (arc.video.sar) properties.push({ name: "arc.video.sar", value: arc.video.sar });
  }

  if (arc.audio) {
    if (arc.audio.sampleRate)
      properties.push({ name: "arc.audio.sampleRate", value: arc.audio.sampleRate });
    if (arc.audio.channels) properties.push({ name: "arc.audio.channels", value: arc.audio.channels });
    if (arc.audio.targetLufs !== undefined)
      properties.push({ name: "arc.audio.targetLufs", value: arc.audio.targetLufs });
    if (arc.audio.truePeakCeiling !== undefined)
      properties.push({ name: "arc.audio.truePeakCeiling", value: arc.audio.truePeakCeiling });
  }

  if (arc.extraction) {
    if (arc.extraction.method)
      properties.push({ name: "arc.extraction.method", value: arc.extraction.method });
    if (arc.extraction.frameCountTolerancePct !== undefined)
      properties.push({
        name: "arc.extraction.frameCountTolerancePct",
        value: arc.extraction.frameCountTolerancePct,
      });
  }

  if (arc.validation?.ssim?.min !== undefined) {
    properties.push({ name: "arc.validation.ssim.min", value: arc.validation.ssim.min });
  }

  if (properties.length === 0) return "";

  const lines = properties
    .map(prop => `    <property name="${escapeXml(prop.name)}" value="${escapeXml(prop.value)}"/>`)
    .join("\n");
  return `  <properties>\n${lines}\n  </properties>`;
}

function buildArcContractTestCase(arc) {
  const nameParts = [];

  if (arc.video) {
    nameParts.push(
      `${arc.video.width}x${arc.video.height}@${arc.video.fps}fps`,
      `pixFmt=${arc.video.pixFmt || "n/a"}`,
      `sar=${arc.video.sar || "n/a"}`
    );
  } else {
    nameParts.push("video=<missing>");
  }

  if (arc.audio) {
    nameParts.push(
      `audio=${arc.audio.sampleRate || "?"}Hz/${arc.audio.channels || "?"}ch`,
      `LUFS=${arc.audio.targetLufs ?? "?"}`,
      `TP=${arc.audio.truePeakCeiling ?? "?"}dBTP`
    );
  } else {
    nameParts.push("audio=<missing>");
  }

  if (arc.validation?.ssim) {
    nameParts.push(`ssim.min=${arc.validation.ssim.min}`);
  } else {
    nameParts.push("ssim.min=<missing>");
  }

  const prettyName = `arc-contract[${nameParts.join(" | ")}]`;

  const missing = [];
  if (!arc.video) missing.push("video");
  if (!arc.audio) missing.push("audio");
  if (!arc.validation || !arc.validation.ssim) missing.push("validation.ssim");

  if (missing.length > 0) {
    return {
      name: prettyName,
      classname: "rendering.arc",
      failureMessage: `ARC is missing required sections: ${missing.join(", ")}`,
    };
  }

  return {
    name: prettyName,
    classname: "rendering.arc",
  };
}

function buildJUnitXml(name, testCases, { arc } = {}) {
  const tests = testCases.length;
  const failures = testCases.filter(test => Boolean(test.failureMessage)).length;

  const lines = [
    "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
    `<testsuite name="${escapeXml(name)}" tests="${tests}" failures="${failures}">`,
  ];

  const propertiesBlock = arcToJUnitPropertiesXml(arc);
  if (propertiesBlock) {
    lines.push(propertiesBlock);
  }

  for (const testCase of testCases) {
    lines.push(
      `  <testcase name="${escapeXml(testCase.name)}" classname="${escapeXml(
        testCase.classname || name
      )}">`
    );
    if (testCase.failureMessage) {
      lines.push(`    <failure message="${escapeXml(testCase.failureMessage)}"/>`);
    }
    if (testCase.systemOut) {
      lines.push("    <system-out><![CDATA[");
      lines.push(testCase.systemOut);
      lines.push("    ]]></system-out>");
    }
    lines.push("  </testcase>");
  }

  lines.push("</testsuite>");
  return lines.join("\n");
}

function writeJUnitReport(junitPath, testCases, arc) {
  const xml = buildJUnitXml("rendering-consistency", testCases, { arc });
  fs.writeFileSync(junitPath, `${xml}\n`);
}

function verifyVideoMetadata(stream, arc) {
  if (!arc.video) {
    throw new Error("ARC video specification missing");
  }

  const expectedWidth = String(arc.video.width);
  const expectedHeight = String(arc.video.height);
  const expectedPixFmt = arc.video.pixFmt;
  const expectedSar = arc.video.sar;
  const expectedFps = arc.video.fps;

  if (String(stream.width) !== expectedWidth) {
    throw new Error(`width mismatch: expected ${expectedWidth}, got ${stream.width}`);
  }
  if (String(stream.height) !== expectedHeight) {
    throw new Error(`height mismatch: expected ${expectedHeight}, got ${stream.height}`);
  }
  if (stream.pix_fmt !== expectedPixFmt) {
    throw new Error(`pix_fmt mismatch: expected ${expectedPixFmt}, got ${stream.pix_fmt}`);
  }
  if (stream.sample_aspect_ratio !== expectedSar) {
    throw new Error(`sar mismatch: expected ${expectedSar}, got ${stream.sample_aspect_ratio}`);
  }

  const fpsAllowed = new Set([String(expectedFps), `${expectedFps}/1`, "30000/1001"]);
  if (!fpsAllowed.has(stream.avg_frame_rate)) {
    throw new Error(`fps invalid: ${stream.avg_frame_rate}`);
  }
}

function computeFrameWindow(arc) {
  const seconds = 5;
  const fps = arc.video?.fps || 30;
  const expected = Math.round(fps * seconds);
  const tolerancePct = arc.extraction?.frameCountTolerancePct ?? 1;
  const tolerance = Math.max(1, Math.round((expected * tolerancePct) / 100));
  return {
    expected,
    min: expected - tolerance,
    max: expected + tolerance,
    tolerance,
  };
}

function averageSSIM(matches) {
  return matches.reduce((acc, value) => acc + value, 0) / matches.length;
}

async function main() {
  const arc = loadArc();
  logArcSummary(arc);

  const testCases = [];
  testCases.push(buildArcContractTestCase(arc));

  const preview = path.join(OUT_DIR, `${GAME}_${PLATFORM}_preview.mp4`);
  let renderError = null;
  try {
    run(
      `node scripts/render.js --project-id ${GAME} --mode preview --preview-seconds 5 --out ${preview}`
    );
  } catch (error) {
    renderError = error;
    log(`Preview render failed: ${error.message}`);
  }

  const probeJson = path.join(OUT_DIR, "ffprobe.json");
  let metadataError = renderError
    ? new Error(`Preview render failed: ${renderError.message}`)
    : null;
  let stream = null;
  if (!renderError) {
    try {
      run(
        `ffprobe -v error -select_streams v:0 -show_entries stream=width,height,avg_frame_rate,r_frame_rate,pix_fmt,sample_aspect_ratio -of json "${preview}" > ${probeJson}`
      );
      const probe = JSON.parse(fs.readFileSync(probeJson, "utf8"));
      stream = probe.streams?.[0];
      if (!stream) {
        throw new Error("ffprobe: no video stream detected");
      }
      verifyVideoMetadata(stream, arc);
    } catch (error) {
      metadataError = error;
      log(`Metadata validation failed: ${error.message}`);
    }
  }

  testCases.push({
    name: "metadata",
    classname: "rendering.metadata",
    failureMessage: metadataError ? metadataError.message : undefined,
    systemOut: stream ? JSON.stringify(stream, null, 2) : undefined,
  });

  const framesDir = path.join(OUT_DIR, "frames");
  let framesError = renderError
    ? new Error(`Preview render failed: ${renderError.message}`)
    : null;
  let framesCount = 0;
  if (!renderError) {
    try {
      fs.mkdirSync(framesDir, { recursive: true });
      run(`ffmpeg -i "${preview}" -vf fps=${arc.video?.fps || 30} "${framesDir}/%05d.png"`);
      const frames = fs.readdirSync(framesDir).filter(file => file.endsWith(".png"));
      framesCount = frames.length;
      const { min, max, expected, tolerance } = computeFrameWindow(arc);
      if (framesCount < min || framesCount > max) {
        throw new Error(
          `frame count out of range: expected ${expected} ±${tolerance}, got ${framesCount}`
        );
      }
    } catch (error) {
      framesError = error;
      log(`Frame extraction failed: ${error.message}`);
    }
  }

  testCases.push({
    name: "frames",
    classname: "rendering.frames",
    failureMessage: framesError ? framesError.message : undefined,
    systemOut:
      framesCount || framesError
        ? `Frames extracted: ${framesCount}`
        : undefined,
  });

  const goldenDir = `tests/golden/${GAME}/${PLATFORM}/frames`;
  const ssimLog = path.join(OUT_DIR, "ssim.log");
  let ssimError = renderError
    ? new Error(`Preview render failed: ${renderError.message}`)
    : null;
  let avgSSIM = null;
  if (!renderError && !framesError) {
    try {
      run(
        `ffmpeg -i "${framesDir}/%05d.png" -i "${goldenDir}/%05d.png" -lavfi ssim="stats_file=${ssimLog}" -f null -`
      );
      const ssimRaw = fs.readFileSync(ssimLog, "utf8");
      const matches = [...ssimRaw.matchAll(/All:(\d+\.\d+)/g)].map(match => parseFloat(match[1]));
      if (matches.length === 0) {
        throw new Error("SSIM log did not contain any frame statistics");
      }
      avgSSIM = averageSSIM(matches);
      log(`Average SSIM: ${avgSSIM}`);
      if (avgSSIM < arc.validation?.ssim?.min) {
        throw new Error(`SSIM too low: ${avgSSIM}`);
      }
    } catch (error) {
      ssimError = error;
      log(`SSIM evaluation failed: ${error.message}`);
    }
  } else if (!renderError && framesError) {
    ssimError = new Error(`Frame extraction failed: ${framesError.message}`);
  }

  testCases.push({
    name: "ssim",
    classname: "rendering.ssim",
    failureMessage: ssimError ? ssimError.message : undefined,
    systemOut: avgSSIM !== null ? `SSIM: ${avgSSIM}` : undefined,
  });

  const junitPath = path.join(OUT_DIR, "junit.xml");
  writeJUnitReport(junitPath, testCases, arc);

  const hasFailures = testCases.some(test => Boolean(test.failureMessage));
  if (hasFailures) {
    log("Rendering consistency check completed with failures.");
    process.exitCode = 1;
  } else {
    log("Rendering consistency check complete.");
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
