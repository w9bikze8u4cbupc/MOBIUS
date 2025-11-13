#!/usr/bin/env node
import fs from "fs";
import path from "path";

const arcPath = path.resolve("docs/spec/authoritative_rendering_contract.json");

function fail(message) {
  console.error(`ARC semantic validation failed: ${message}`);
  process.exit(1);
}

let arcRaw;
try {
  arcRaw = fs.readFileSync(arcPath, "utf8");
} catch (err) {
  fail(`unable to read ARC file at ${arcPath}`);
}

let arc;
try {
  arc = JSON.parse(arcRaw);
} catch (err) {
  fail(`ARC file is not valid JSON: ${err.message}`);
}

if (!arc.validation || typeof arc.validation !== "object") {
  fail("validation section missing");
}

if (!arc.validation.ssim || typeof arc.validation.ssim !== "object") {
  fail("validation.ssim must be defined");
}

if (typeof arc.validation.ssim.min !== "number") {
  fail("validation.ssim.min must be a number");
}

if (arc.validation.ssim.min <= 0 || arc.validation.ssim.min > 1) {
  fail("validation.ssim.min must be within (0,1]");
}

const masks = arc.validation?.masks;
if (masks !== undefined) {
  if (!Array.isArray(masks)) {
    fail("validation.masks must be an array");
  }

  const seenNames = new Set();

  masks.forEach((mask, idx) => {
    const prefix = `validation.masks[${idx}]`;

    if (!mask || typeof mask !== "object") {
      fail(`${prefix} must be an object`);
    }

    if (typeof mask.name !== "string" || !mask.name.trim()) {
      fail(`${prefix}.name must be a non-empty string`);
    }

    const name = mask.name.trim();
    if (seenNames.has(name)) {
      fail(`${prefix}.name must be unique (duplicate: ${name})`);
    }
    seenNames.add(name);

    if (!["rect", "poly"].includes(mask.type)) {
      fail(`${prefix}.type must be "rect" or "poly"`);
    }

    if (!["any", "windows", "macos", "linux"].includes(mask.platform)) {
      fail(`${prefix}.platform must be any/windows/macos/linux`);
    }

    if (mask.frames !== "all") {
      if (
        !mask.frames ||
        typeof mask.frames.start !== "number" ||
        typeof mask.frames.end !== "number"
      ) {
        fail(`${prefix}.frames must be "all" or {start,end}`);
      }
      if (mask.frames.start < 0 || mask.frames.end < mask.frames.start) {
        fail(`${prefix}.frames.start/end values invalid`);
      }
    }

    if (mask.type === "rect") {
      if (
        !mask.rect ||
        typeof mask.rect.x !== "number" ||
        typeof mask.rect.y !== "number" ||
        typeof mask.rect.width !== "number" ||
        typeof mask.rect.height !== "number"
      ) {
        fail(`${prefix}.rect must define x,y,width,height as numbers`);
      }
      if (mask.rect.width <= 0 || mask.rect.height <= 0) {
        fail(`${prefix}.rect width/height must be > 0`);
      }
    }

    if (mask.type === "poly") {
      if (!Array.isArray(mask.points) || mask.points.length < 3) {
        fail(`${prefix}.points must be array of ≥3 [x,y] pairs`);
      }
      mask.points.forEach((point, pointIdx) => {
        if (!Array.isArray(point) || point.length !== 2) {
          fail(`${prefix}.points[${pointIdx}] must be [x,y]`);
        }
        const [x, y] = point;
        if (typeof x !== "number" || typeof y !== "number") {
          fail(`${prefix}.points[${pointIdx}] values must be numbers`);
        }
      });
    }
  });
}

console.log("✔ ARC semantic validation passed.");
