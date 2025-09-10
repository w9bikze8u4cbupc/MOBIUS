const fs = require("fs");
const os = require("os");
const cp = require("child_process");
const path = require("path");

// Get environment variables or use defaults
const GAME = process.env.GAME || "space-invaders";
const PLATFORM = process.env.PLATFORM || process.env.RUNNER_OS;
const RUNNER_OS = PLATFORM ||
  (process.platform === "win32" ? "Windows" : 
   process.platform === "darwin" ? "macOS" : "Linux");

// Map runner OS to directory slug (case-insensitive comparison)
const slug = RUNNER_OS.toLowerCase() === "windows" ? "windows" : 
             RUNNER_OS.toLowerCase() === "macos" ? "macos" : "linux";

// Function to extract version information
function getVersion(cmd, args, regex) {
  try {
    let output = cp.spawnSync(cmd, args, { encoding: "utf8" });
    if (output.status === 0) {
      let match = (output.stdout || "").match(regex);
      return match ? match[1] : "unknown";
    }
  } catch {}
  return "unknown";
}

// Function to get video properties using ffprobe
function getVideoProperties(videoPath) {
  try {
    const res = cp.spawnSync('ffprobe', [
      '-v', 'error',
      '-show_entries', 'stream=codec_name,width,height,pix_fmt,avg_frame_rate,sample_aspect_ratio',
      '-of', 'json',
      videoPath
    ], { encoding: 'utf8' });
    
    if (res.status === 0) {
      const data = JSON.parse(res.stdout);
      const videoStream = data.streams.find(s => s.codec_type === 'video');
      if (videoStream) {
        return {
          codec: videoStream.codec_name,
          width: parseInt(videoStream.width),
          height: parseInt(videoStream.height),
          pix_fmt: videoStream.pix_fmt,
          fps: videoStream.avg_frame_rate,
          sample_aspect_ratio: videoStream.sample_aspect_ratio || '1:1'
        };
      }
    }
  } catch (err) {
    console.error('Error getting video properties:', err.message);
  }
  
  // Fallback values
  return {
    codec: "h264",
    width: 960,
    height: 540,
    pix_fmt: "yuv420p",
    fps: "30/1",
    sample_aspect_ratio: "1:1"
  };
}

// Get actual video properties
const videoPath = `dist/${GAME}/${slug}/tutorial.mp4`;
const videoProps = getVideoProperties(videoPath);

// Build container.json structure
const container = {
  tools: {
    ffmpeg: { version: getVersion("ffmpeg", ["-version"], /ffmpeg version (\S+)/) },
    ffprobe: { version: getVersion("ffprobe", ["-version"], /ffprobe version (\S+)/) }
  },
  env: {
    node: { version: (process.version || "").replace(/^v/, "") || "unknown" },
    npm: { version: getVersion("npm", ["-v"], /(\d+\.\d+\.\d+)/) },
    git: {
      version: getVersion("git", ["--version"], /git version (\S+)/),
      branch: getVersion("git", ["rev-parse", "--abbrev-ref", "HEAD"], /(.*)/),
      commit: getVersion("git", ["rev-parse", "HEAD"], /(.*)/)
    },
    os: {
      name: RUNNER_OS,
      platform: os.platform(),
      release: os.release(),
      arch: os.arch()
    }
  },
  media: {
    video: [
      {
        "path": videoPath,
        "codec": videoProps.codec,
        "width": videoProps.width,
        "height": videoProps.height,
        "pix_fmt": videoProps.pix_fmt,
        "fps": videoProps.fps,
        "sample_aspect_ratio": videoProps.sample_aspect_ratio,
        "bitrateKbps": 8000,
        "durationSec": 0,
        "sha256": ""
      }
    ],
    captions: [
      { path: `dist/${GAME}/${slug}/tutorial.srt`, language: "en", charCount: 0, sha256: "" }
    ],
    images: [
      { path: `dist/${GAME}/${slug}/poster.jpg`, width: 1920, height: 1080, sha256: "" }
    ]
  }
};

// Write container.json to the correct location
const goldenRoot = process.env.GOLDEN_ROOT || path.join("tests", "golden");
const dir = path.join(goldenRoot, GAME, slug);
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, "container.json"), JSON.stringify(container, null, 2));

console.log(`Generated container.json for ${GAME} on ${RUNNER_OS} at ${dir}`);