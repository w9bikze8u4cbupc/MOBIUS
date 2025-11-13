#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

let hadFailure = false;

function fail(message) {
  console.error(`[arc:semantic] ${message}`);
  hadFailure = true;
}

function assertFiniteNumber(value, name, { min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY } = {}) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(`${name} must be a finite number`);
    return;
  }

  if (value < min || value > max) {
    fail(`${name} must be between ${min} and ${max} (got ${value})`);
  }
}

function loadArc() {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const arcPath = path.join(currentDir, "../docs/spec/authoritative_rendering_contract.json");
  const raw = fs.readFileSync(arcPath, "utf8");
  return JSON.parse(raw);
}

function validateAudio(arc) {
  if (!arc.audio) {
    fail("audio section missing from ARC");
    return;
  }

  if (arc.audio.sampleRate !== undefined) {
    assertFiniteNumber(arc.audio.sampleRate, "audio.sampleRate", { min: 8000, max: 192000 });
  }
  if (arc.audio.channels !== undefined) {
    assertFiniteNumber(arc.audio.channels, "audio.channels", { min: 1, max: 16 });
  }

  // Loudness targets
  assertFiniteNumber(arc.audio.targetLufs, "audio.targetLufs", {
    min: -40,
    max: -5,
  });
  assertFiniteNumber(arc.audio.truePeakCeiling, "audio.truePeakCeiling", {
    min: -10,
    max: -0.1,
  });

  if (arc.audio.targetLufs > arc.audio.truePeakCeiling) {
    fail(
      `audio.targetLufs (${arc.audio.targetLufs}) must be lower (more negative) than audio.truePeakCeiling (${arc.audio.truePeakCeiling})`
    );
  }

  // Tolerances (optional but recommended)
  if (arc.audio.toleranceLufs !== undefined) {
    assertFiniteNumber(arc.audio.toleranceLufs, "audio.toleranceLufs", {
      min: 0,
      max: 5,
    });
  }

  if (arc.audio.toleranceTruePeakDb !== undefined) {
    assertFiniteNumber(
      arc.audio.toleranceTruePeakDb,
      "audio.toleranceTruePeakDb",
      { min: 0, max: 5 }
    );
  }

  // Probe requirements
  if (arc.audio.requireEbur128Probe !== undefined) {
    if (typeof arc.audio.requireEbur128Probe !== "boolean") {
      fail("audio.requireEbur128Probe must be boolean when present");
    }
  }

  if (arc.audio.requireTruePeakProbe !== undefined) {
    if (typeof arc.audio.requireTruePeakProbe !== "boolean") {
      fail("audio.requireTruePeakProbe must be boolean when present");
    }
  }
}

function main() {
  try {
    const arc = loadArc();
    validateAudio(arc);
  } catch (error) {
    fail(error.message || String(error));
  }

  if (hadFailure) {
    process.exitCode = 1;
  } else {
    console.log("ARC semantic validation passed.");
  }
}

main();
