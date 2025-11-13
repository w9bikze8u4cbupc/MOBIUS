import fs from "fs";
import path from "path";

const arcPath = path.resolve("docs/spec/authoritative_rendering_contract.json");
if (!fs.existsSync(arcPath)) {
  console.error("ARC file not found at", arcPath);
  process.exit(1);
}

const arc = JSON.parse(fs.readFileSync(arcPath, "utf8"));

function invariant(condition, message) {
  if (!condition) {
    console.error("❌ ARC semantic validation failed:", message);
    process.exit(1);
  }
}

function assertNumber(value, message) {
  invariant(typeof value === "number" && Number.isFinite(value), message);
}

// Version semantics
invariant(/^\d+\.\d+\.\d+$/.test(arc.version), "version must follow semver");

// Video checks
const video = arc.video || {};
const resolution = video.resolution || {};
assertNumber(resolution.width, "video.resolution.width must be numeric");
assertNumber(resolution.height, "video.resolution.height must be numeric");
invariant(resolution.width > 0 && resolution.height > 0, "resolution must be positive");
assertNumber(video.fps, "video.fps must be numeric");
invariant(video.fps > 0, "video.fps must be positive");
invariant(typeof video.pixFmt === "string" && video.pixFmt.length > 0, "video.pixFmt required");
invariant(/^[0-9]+:[0-9]+$/.test(video.sar), "video.sar must be in 'num:den' format");
if (video.colorSpace) {
  invariant(typeof video.colorSpace === "string", "video.colorSpace must be string if provided");
}

// Audio checks
const audio = arc.audio || {};
assertNumber(audio.sampleRate, "audio.sampleRate must be numeric");
invariant(audio.sampleRate > 0, "audio.sampleRate must be positive");
assertNumber(audio.channels, "audio.channels must be numeric");
invariant(Number.isInteger(audio.channels) && audio.channels > 0, "audio.channels must be positive integer");
assertNumber(audio.target_lufs, "audio.target_lufs must be numeric");
assertNumber(audio.true_peak_ceiling, "audio.true_peak_ceiling must be numeric");
invariant(audio.true_peak_ceiling <= 0, "audio.true_peak_ceiling must be <= 0 dBFS");

// Extraction checks
const extraction = arc.extraction || {};
invariant(typeof extraction.method === "string", "extraction.method required");
assertNumber(extraction.frameCountTolerancePct, "extraction.frameCountTolerancePct must be numeric");
invariant(extraction.frameCountTolerancePct >= 0 && extraction.frameCountTolerancePct <= 5, "extraction.frameCountTolerancePct must be between 0 and 5");

// Validation checks
const validation = arc.validation || {};
const ssim = validation.ssim || {};
assertNumber(ssim.min, "validation.ssim.min must be numeric");
assertNumber(ssim.softPass, "validation.ssim.softPass must be numeric");
invariant(ssim.min <= 1 && ssim.min >= 0, "validation.ssim.min must be 0-1");
invariant(ssim.softPass <= 1 && ssim.softPass >= 0, "validation.ssim.softPass must be 0-1");
invariant(ssim.min >= ssim.softPass, "validation.ssim.min must be >= softPass");

if (validation.artifacts) {
  invariant(Array.isArray(validation.artifacts), "validation.artifacts must be array when defined");
  const requiredArtifacts = ["ffprobe.json", "frames", "ssim.log", "junit.xml"];
  for (const artifact of requiredArtifacts) {
    invariant(validation.artifacts.includes(artifact), `validation.artifacts must include ${artifact}`);
  }
}

// Platform checks
const platforms = arc.platforms || {};
const requiredPlatforms = ["windows", "macos", "linux"];
for (const name of requiredPlatforms) {
  invariant(Object.prototype.hasOwnProperty.call(platforms, name), `platform '${name}' must be specified`);
  const platformConfig = platforms[name];
  invariant(typeof platformConfig === "object" && platformConfig !== null, `platform '${name}' must be an object`);
  invariant(typeof platformConfig.ffmpeg === "string" && platformConfig.ffmpeg.length > 0, `platform '${name}' must specify ffmpeg version`);
  invariant(typeof platformConfig.hardwareAcceleration === "string", `platform '${name}' must specify hardwareAcceleration`);
}

// Governance checks
const governance = arc.governance || {};
invariant(typeof governance.baselineLabel === "string" && governance.baselineLabel.length > 0, "governance.baselineLabel required");
invariant(typeof governance.rfcLabel === "string" && governance.rfcLabel.length > 0, "governance.rfcLabel required");
assertNumber(governance.requiredApprovals, "governance.requiredApprovals must be numeric");
invariant(Number.isInteger(governance.requiredApprovals) && governance.requiredApprovals > 0, "governance.requiredApprovals must be positive integer");

console.log("✔ ARC semantic validation passed.");

