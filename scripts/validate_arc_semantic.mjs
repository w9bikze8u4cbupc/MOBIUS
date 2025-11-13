#!/usr/bin/env node
import fs from "fs";
import path from "path";

class SemanticError extends Error {}

function fail(message) {
  throw new SemanticError(message);
}

function assertFiniteNumber(value, name, { min = -Infinity, max = Infinity } = {}) {
  if (!Number.isFinite(value)) {
    fail(`${name} must be a finite number`);
  }

  if (value < min || value > max) {
    fail(`${name} must be between ${min} and ${max}`);
  }
}

function loadArc(filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    fail(`Unable to load ARC file at ${filePath}: ${error.message}`);
  }
}

function resolveArcPath(argPath) {
  if (!argPath) {
    return path.resolve(process.cwd(), "docs/spec/authoritative_rendering_contract.json");
  }

  return path.resolve(process.cwd(), argPath);
}

function validateArc(arc) {
  if (!arc || typeof arc !== "object") {
    fail("ARC must be a JSON object");
  }

  if (!arc.validation || typeof arc.validation !== "object") {
    fail("ARC must define a validation section");
  }

  if (!arc.validation.ssim || typeof arc.validation.ssim !== "object") {
    fail("ARC must define validation.ssim");
  }

  assertFiniteNumber(arc.validation.ssim.min, "validation.ssim.min", {
    min: 0.0,
    max: 1.0,
  });

  if (arc.validation.ssim.min < 0.8) {
    console.warn(
      `⚠ validation.ssim.min is ${arc.validation.ssim.min} (< 0.8). This may be too lenient for golden checks.`
    );
  }

  // Per-platform overrides (optional)
  if (arc.validation.ssim.perPlatform) {
    const perPlatform = arc.validation.ssim.perPlatform;
    const platforms = ["windows", "macos", "linux"];

    if (typeof perPlatform !== "object" || perPlatform === null || Array.isArray(perPlatform)) {
      fail("validation.ssim.perPlatform must be an object if present");
    }

    platforms.forEach((os) => {
      if (!perPlatform[os]) return;

      const osMin = perPlatform[os].min;
      const name = `validation.ssim.perPlatform.${os}.min`;

      assertFiniteNumber(osMin, name, { min: 0.0, max: 1.0 });

      if (osMin < arc.validation.ssim.min) {
        fail(
          `${name} (${osMin}) must be >= global validation.ssim.min (${arc.validation.ssim.min})`
        );
      }

      if (osMin < 0.8) {
        console.warn(
          `⚠ ${name} is ${osMin} (< 0.8). This may be too lenient for ${os} golden checks.`
        );
      }
    });
  }
}

function main() {
  const arcArg = process.argv[2];
  const arcPath = resolveArcPath(arcArg);

  try {
    const arc = loadArc(arcPath);
    validateArc(arc);
    console.log(`ARC semantic validation passed for ${arcPath}`);
  } catch (error) {
    if (error instanceof SemanticError) {
      console.error(`ARC semantic validation failed: ${error.message}`);
    } else {
      console.error(`ARC semantic validation error: ${error.message}`);
    }
    process.exit(1);
  }
}

main();
