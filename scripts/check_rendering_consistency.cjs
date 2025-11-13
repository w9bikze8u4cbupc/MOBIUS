#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ARC_PATH = path.join(__dirname, "..", "docs", "spec", "authoritative_rendering_contract.json");

function loadArcContract() {
  if (!fs.existsSync(ARC_PATH)) {
    return { validation: { ssim: { min: 0.92 } } };
  }

  const raw = fs.readFileSync(ARC_PATH, "utf8");
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`Unable to parse ARC contract: ${err.message}`);
  }
}

const arc = loadArcContract();

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

function log(msg) {
  console.log(`[consistency] ${msg}`);
}

function run(cmd) {
  log(`exec: ${cmd}`);
  return execSync(cmd, { encoding: "utf8", stdio: "pipe" });
}

function normalizePlatform(value) {
  if (!value) return "any";
  const lower = String(value).toLowerCase();
  if (lower === "win32" || lower === "windows") return "windows";
  if (lower === "darwin" || lower === "macos") return "macos";
  if (lower === "linux") return "linux";
  return lower;
}

function frameMatches(mask, frameIndex) {
  if (mask.frames === "all") return true;
  return (
    typeof mask.frames.start === "number" &&
    typeof mask.frames.end === "number" &&
    frameIndex >= mask.frames.start &&
    frameIndex <= mask.frames.end
  );
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function fillRectMask(maskArray, width, height, rect) {
  const startX = clamp(Math.floor(rect.x), 0, width);
  const startY = clamp(Math.floor(rect.y), 0, height);
  const endX = clamp(Math.ceil(rect.x + rect.width), 0, width);
  const endY = clamp(Math.ceil(rect.y + rect.height), 0, height);

  for (let y = startY; y < endY; y += 1) {
    const row = y * width;
    for (let x = startX; x < endX; x += 1) {
      maskArray[row + x] = 1;
    }
  }
}

function rasterizePolygon(points, width, height, maskArray) {
  const ys = points.map((p) => p[1]);
  let minY = Math.floor(Math.min(...ys));
  let maxY = Math.ceil(Math.max(...ys));
  minY = clamp(minY, 0, height - 1);
  maxY = clamp(maxY, 0, height - 1);

  for (let y = minY; y <= maxY; y += 1) {
    const scanline = y + 0.5;
    const intersections = [];
    for (let i = 0; i < points.length; i += 1) {
      const p1 = points[i];
      const p2 = points[(i + 1) % points.length];
      const y1 = p1[1];
      const y2 = p2[1];
      if ((y1 <= scanline && y2 > scanline) || (y2 <= scanline && y1 > scanline)) {
        const t = (scanline - y1) / (y2 - y1);
        const x = p1[0] + t * (p2[0] - p1[0]);
        intersections.push(x);
      }
    }
    intersections.sort((a, b) => a - b);
    for (let i = 0; i + 1 < intersections.length; i += 2) {
      const x1 = intersections[i];
      const x2 = intersections[i + 1];
      const startX = clamp(Math.floor(Math.min(x1, x2)), 0, width);
      const endX = clamp(Math.ceil(Math.max(x1, x2)), 0, width);
      for (let x = startX; x < endX; x += 1) {
        maskArray[y * width + x] = 1;
      }
    }
  }
}

function buildMaskForFrame(width, height, masks, platform, frameIndex) {
  if (!Array.isArray(masks) || masks.length === 0) {
    return null;
  }

  const maskArray = new Uint8Array(width * height);
  let hasMask = false;

  masks.forEach((mask) => {
    if (!mask) return;
    if (mask.platform !== "any" && mask.platform !== platform) return;
    if (!frameMatches(mask, frameIndex)) return;

    if (mask.type === "rect" && mask.rect) {
      fillRectMask(maskArray, width, height, mask.rect);
      hasMask = true;
      return;
    }

    if (mask.type === "poly" && Array.isArray(mask.points)) {
      const numericPoints = mask.points
        .map((pt) => [Number(pt[0]), Number(pt[1])])
        .filter((pt) => Number.isFinite(pt[0]) && Number.isFinite(pt[1]));
      if (numericPoints.length >= 3) {
        rasterizePolygon(numericPoints, width, height, maskArray);
        hasMask = true;
      }
    }
  });

  return hasMask ? maskArray : null;
}

function applyMaskToBuffer(buffer, maskArray) {
  if (!maskArray) return buffer;
  const out = Buffer.from(buffer);
  for (let i = 0; i < maskArray.length && i < out.length; i += 1) {
    if (maskArray[i]) {
      out[i] = 0;
    }
  }
  return out;
}

function computeSSIM(bufferA, bufferB, maskArray) {
  if (bufferA.length !== bufferB.length) {
    throw new Error("SSIM buffers must be the same length");
  }

  const c1 = (0.01 * 255) ** 2;
  const c2 = (0.03 * 255) ** 2;

  let count = 0;
  let sumA = 0;
  let sumB = 0;

  for (let i = 0; i < bufferA.length; i += 1) {
    if (maskArray && maskArray[i]) continue;
    sumA += bufferA[i];
    sumB += bufferB[i];
    count += 1;
  }

  if (count === 0) {
    return 1;
  }

  const meanA = sumA / count;
  const meanB = sumB / count;

  let varianceA = 0;
  let varianceB = 0;
  let covariance = 0;

  for (let i = 0; i < bufferA.length; i += 1) {
    if (maskArray && maskArray[i]) continue;
    const diffA = bufferA[i] - meanA;
    const diffB = bufferB[i] - meanB;
    varianceA += diffA * diffA;
    varianceB += diffB * diffB;
    covariance += diffA * diffB;
  }

  varianceA /= count;
  varianceB /= count;
  covariance /= count;

  const numerator = (2 * meanA * meanB + c1) * (2 * covariance + c2);
  const denominator =
    (meanA * meanA + meanB * meanB + c1) * (varianceA + varianceB + c2);

  if (denominator === 0) {
    return 1;
  }

  return numerator / denominator;
}

function extractFrameBuffer(filePath, width, height) {
  const cmd = `ffmpeg -v error -i "${filePath}" -f rawvideo -pix_fmt gray -`;
  return execSync(cmd, {
    encoding: "buffer",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: width * height * 4,
  });
}

//
// 1. Render preview video (5s)
//
const normalizedPlatform = normalizePlatform(PLATFORM);
const maskDefinitions = Array.isArray(arc.validation?.masks)
  ? arc.validation.masks
  : [];
const ssimMinimum =
  typeof arc.validation?.ssim?.min === "number" ? arc.validation.ssim.min : 0.92;

const preview = path.join(OUT_DIR, `${GAME}_${normalizedPlatform}_preview.mp4`);
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
const goldenDir = `tests/golden/${GAME}/${normalizedPlatform}/frames`;

if (maskDefinitions.length > 0) {
  console.log(`Masks: ${maskDefinitions.length} mask(s) defined`);
  maskDefinitions.forEach((m) =>
    console.log(
      `  - ${m.name} (${m.type}) platform=${m.platform} frames=${JSON.stringify(m.frames)}`
    )
  );
} else {
  console.log("Masks: none");
}

const sortedFrames = [...frames].sort();
let totalSSIM = 0;
let frameCount = 0;

sortedFrames.forEach((frameFile, idx) => {
  const frameIndex = idx;
  const actualPath = path.join(framesDir, frameFile);
  const goldenPath = path.join(goldenDir, frameFile);

  if (!fs.existsSync(goldenPath)) {
    throw new Error(`Missing golden frame: ${goldenPath}`);
  }

  const actualGray = extractFrameBuffer(actualPath, stream.width, stream.height);
  const goldenGray = extractFrameBuffer(goldenPath, stream.width, stream.height);
  const maskArray = buildMaskForFrame(
    stream.width,
    stream.height,
    maskDefinitions,
    normalizedPlatform,
    frameIndex
  );

  const maskedActual = applyMaskToBuffer(actualGray, maskArray);
  const maskedGolden = applyMaskToBuffer(goldenGray, maskArray);
  const ssimValue = computeSSIM(maskedActual, maskedGolden, maskArray);

  if (ssimValue < ssimMinimum) {
    throw new Error(
      `SSIM for frame ${frameFile} below threshold: ${ssimValue} < ${ssimMinimum}`
    );
  }

  totalSSIM += ssimValue;
  frameCount += 1;
});

const avgSSIM = frameCount === 0 ? 1 : totalSSIM / frameCount;

log(`Average SSIM: ${avgSSIM}`);

if (avgSSIM < ssimMinimum) {
  throw new Error(`Average SSIM below threshold: ${avgSSIM} < ${ssimMinimum}`);
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
    <system-out><![CDATA[SSIM: ${avgSSIM}
Masks: ${maskDefinitions.length}
${maskDefinitions.map((m) => `${m.name} (${m.type}) platform=${m.platform} frames=${JSON.stringify(m.frames)}`).join("\n")}
]]></system-out>
  </testcase>
</testsuite>`
);

log("Rendering consistency check complete.");
