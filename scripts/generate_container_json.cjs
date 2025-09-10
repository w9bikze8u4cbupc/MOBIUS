const fs = require("fs");
const os = require("os");
const cp = require("child_process");
const path = require("path");

// Get environment variables or use defaults
const GAME = process.env.GAME || "space-invaders";
const RUNNER_OS = (process.env.RUNNER_OS || 
  (process.platform === "win32" ? "Windows" : 
   process.platform === "darwin" ? "macOS" : "Linux")).trim();

// Map runner OS to directory slug
const slug = RUNNER_OS === "Windows" ? "windows" : 
             RUNNER_OS === "macOS" ? "macos" : "linux";

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
  }
};

// Write container.json to the correct location
const goldenRoot = process.env.GOLDEN_ROOT || path.join("tests", "golden");
const dir = path.join(goldenRoot, GAME, slug);
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, "container.json"), JSON.stringify(container, null, 2));

console.log(`Generated container.json for ${GAME} on ${RUNNER_OS} at ${dir}`);