#!/usr/bin/env node
/**
 * MOBIUS Storyboard Contract Validator (Phase E2)
 *
 * Usage:
 *   node scripts/check_storyboard.cjs --input path/to/storyboard.json \
 *     --contract docs/spec/storyboard_contract.json \
 *     --junit out/junit/storyboard-contract.xml
 *
 * Exits:
 *   0 on success
 *   2 on contract violation
 *   3 on IO/usage error
 */

const fs = require("fs");
const path = require("path");

// --- Simple CLI arg parsing --------------------------------------------------

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) {
        args[key] = true;
      } else {
        args[key] = next;
        i++;
      }
    }
  }
  return args;
}

// --- Minimal JSON reader -----------------------------------------------------

function readJson(filePath, label) {
  try {
    const txt = fs.readFileSync(filePath, "utf8");
    return JSON.parse(txt);
  } catch (err) {
    console.error(`[STORYBOARD] Failed to read ${label} at ${filePath}: ${err.message}`);
    process.exitCode = 3;
    throw err;
  }
}

// --- Core validation ---------------------------------------------------------

function validateStoryboard(storyboard, contract) {
  const errors = [];
  const warnings = [];

  // Version
  if (storyboard.storyboardContractVersion !== contract.contractVersion) {
    errors.push(
      `storyboardContractVersion mismatch: expected ${contract.contractVersion}, got ${storyboard.storyboardContractVersion}`
    );
  }

  // Basic required fields
  if (!storyboard.game || !storyboard.game.slug || !storyboard.game.name) {
    errors.push("game.slug and game.name must be present and non-empty");
  }

  if (!storyboard.resolution) {
    errors.push("resolution block is missing");
  } else {
    const { width, height, fps } = storyboard.resolution;
    if (!Number.isInteger(width) || width < 1) {
      errors.push("resolution.width must be a positive integer");
    }
    if (!Number.isInteger(height) || height < 1) {
      errors.push("resolution.height must be a positive integer");
    }
    if (typeof fps !== "number" || fps <= 0) {
      errors.push("resolution.fps must be a positive number");
    }
  }

  if (!Array.isArray(storyboard.scenes) || storyboard.scenes.length === 0) {
    errors.push("scenes must be a non-empty array");
    return { errors, warnings };
  }

  // Safe area threshold for normalized coordinates
  const SAFE_MARGIN = 0.05;

  // Validate scenes
  let lastIndex = -1;
  for (const scene of storyboard.scenes) {
    const id = scene.id || "<unknown>";
    const prefix = `scene[${id}]`;

    if (typeof scene.index !== "number") {
      errors.push(`${prefix}: index must be a number`);
    } else {
      if (scene.index < lastIndex) {
        errors.push(`${prefix}: index must be non-decreasing`);
      }
      lastIndex = scene.index;
    }

    if (typeof scene.durationSec !== "number" || scene.durationSec < 0.5) {
      errors.push(`${prefix}: durationSec must be >= 0.5`);
    }

    if (!scene.segmentId || typeof scene.segmentId !== "string") {
      errors.push(`${prefix}: segmentId must be a non-empty string`);
    }

    // Visuals
    if (!Array.isArray(scene.visuals)) {
      errors.push(`${prefix}: visuals must be an array`);
    } else {
      for (const visual of scene.visuals) {
        const vid = visual.id || "<unknown>";
        const vPrefix = `${prefix}.visual[${vid}]`;

        if (!visual.assetId) {
          errors.push(`${vPrefix}: assetId must be set`);
        }
        if (typeof visual.layer !== "number" || visual.layer < 0) {
          errors.push(`${vPrefix}: layer must be a non-negative number`);
        }

        if (!visual.placement) {
          errors.push(`${vPrefix}: placement is missing`);
        } else {
          const { x, y, width, height } = visual.placement;
          if (![x, y, width, height].every((v) => typeof v === "number")) {
            errors.push(`${vPrefix}: placement values must be numbers`);
          } else {
            // Normalized safe-area checks (if values look like [0,1])
            if (
              x >= 0 && x <= 1 &&
              y >= 0 && y <= 1 &&
              width >= 0 && width <= 1 &&
              height >= 0 && height <= 1
            ) {
              if (x < SAFE_MARGIN || y < SAFE_MARGIN) {
                warnings.push(`${vPrefix}: placement is near top/left edge (check safe area)`);
              }
              if (x + width > 1 - SAFE_MARGIN || y + height > 1 - SAFE_MARGIN) {
                warnings.push(`${vPrefix}: placement is near bottom/right edge (check safe area)`);
              }
            }
          }
        }

        // Motion checks
        if (visual.motion && typeof visual.motion === "object") {
          const m = visual.motion;
          if (!m.type) {
            errors.push(`${vPrefix}: motion.type must be set when motion is present`);
          } else if (!["fade", "slide", "zoom", "pulse"].includes(m.type)) {
            errors.push(`${vPrefix}: motion.type '${m.type}' is not allowed`);
          }

          if (m.startSec != null && (typeof m.startSec !== "number" || m.startSec < 0)) {
            errors.push(`${vPrefix}: motion.startSec must be >= 0 when set`);
          }
          if (m.endSec != null && (typeof m.endSec !== "number" || m.endSec < 0)) {
            errors.push(`${vPrefix}: motion.endSec must be >= 0 when set`);
          }
          if (
            typeof m.startSec === "number" &&
            typeof m.endSec === "number" &&
            m.endSec < m.startSec
          ) {
            errors.push(`${vPrefix}: motion.endSec must be >= motion.startSec`);
          }
          if (
            typeof m.endSec === "number" &&
            typeof scene.durationSec === "number" &&
            m.endSec > scene.durationSec + 1e-6
          ) {
            errors.push(
              `${vPrefix}: motion.endSec (${m.endSec}) must be <= scene.durationSec (${scene.durationSec})`
            );
          }

          if (m.easing && !["linear", "easeInOutCubic", "easeOutQuad"].includes(m.easing)) {
            errors.push(`${vPrefix}: motion.easing '${m.easing}' is not allowed`);
          }
        }
      }
    }

    // Overlays
    if (!Array.isArray(scene.overlays)) {
      errors.push(`${prefix}: overlays must be an array`);
    } else {
      for (const overlay of scene.overlays) {
        const oid = overlay.id || "<unknown>";
        const oPrefix = `${prefix}.overlay[${oid}]`;

        if (!overlay.text || typeof overlay.text !== "string") {
          errors.push(`${oPrefix}: text must be a non-empty string`);
        }

        if (!overlay.placement) {
          errors.push(`${oPrefix}: placement is missing`);
        } else {
          const { x, y, width, height } = overlay.placement;
          if (![x, y, width, height].every((v) => typeof v === "number")) {
            errors.push(`${oPrefix}: placement values must be numbers`);
          }
        }

        if (typeof overlay.startSec !== "number" || overlay.startSec < 0) {
          errors.push(`${oPrefix}: startSec must be >= 0`);
        }
        if (typeof overlay.endSec !== "number" || overlay.endSec <= overlay.startSec) {
          errors.push(`${oPrefix}: endSec must be > startSec`);
        }
        if (overlay.endSec > scene.durationSec + 1e-6) {
          errors.push(
            `${oPrefix}: endSec (${overlay.endSec}) must be <= scene.durationSec (${scene.durationSec})`
          );
        }
      }
    }
  }

  return { errors, warnings };
}

// --- JUnit emission ----------------------------------------------------------

function buildJUnitXml(result) {
  const { errors, warnings } = result;
  const tests = 1;
  const failures = errors.length > 0 ? 1 : 0;
  const skipped = 0;

  let xml = "";
  xml += '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += `<testsuite name="storyboard-contract" tests="${tests}" failures="${failures}" skipped="${skipped}">\n`;
  xml += `  <testcase classname="storyboard" name="contract">\n`;

  if (errors.length > 0) {
    const msg = errors.join(" | ");
    xml += `    <failure message="STORYBOARD_CONTRACT_FAILED">${escapeXml(msg)}</failure>\n`;
  } else if (warnings.length > 0) {
    const msg = warnings.join(" | ");
    xml += `    <system-out>${escapeXml("WARNINGS: " + msg)}</system-out>\n`;
  }

  xml += "  </testcase>\n";
  xml += "</testsuite>\n";
  return xml;
}

function escapeXml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// --- Main --------------------------------------------------------------------

(function main() {
  const args = parseArgs(process.argv);
  const inputPath = args.input;
  const contractPath =
    args.contract || path.join("docs", "spec", "storyboard_contract.json");
  const junitPath = args.junit;

  if (!inputPath) {
    console.error(
      "[STORYBOARD] Usage: node scripts/check_storyboard.cjs --input path/to/storyboard.json [--contract path/to/storyboard_contract.json] [--junit path/to/report.xml]"
    );
    process.exit(3);
  }

  const storyboard = readJson(inputPath, "storyboard payload");
  const contract = readJson(contractPath, "storyboard contract");

  const { errors, warnings } = validateStoryboard(storyboard, contract);

  if (warnings.length > 0) {
    console.warn("[STORYBOARD] Warnings:");
    for (const w of warnings) {
      console.warn("  - " + w);
    }
  }

  if (errors.length > 0) {
    console.error("[STORYBOARD] Contract violations:");
    for (const e of errors) {
      console.error("  - " + e);
    }
  }

  const junitXml = buildJUnitXml({ errors, warnings });

  if (junitPath) {
    fs.mkdirSync(path.dirname(junitPath), { recursive: true });
    fs.writeFileSync(junitPath, junitXml, "utf8");
    console.log(`[STORYBOARD] Wrote JUnit report to ${junitPath}`);
  } else {
    console.log(junitXml);
  }

  if (errors.length > 0) {
    process.exit(2);
  } else {
    console.log("[STORYBOARD] Storyboard contract validation passed.");
    process.exit(0);
  }
})();
