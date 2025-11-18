#!/usr/bin/env node
const fs = require("fs");

function fail(msg, junit) {
  console.error(msg);
  if (junit) {
    fs.writeFileSync(
      junit,
      `<?xml version="1.0"?>
<testsuite name="audio-mixing-contract" tests="1">
  <testcase name="audio-mixing-validation">
    <failure message="${msg}"></failure>
  </testcase>
</testsuite>`
    );
  }
  process.exit(1);
}

function ok(junit) {
  if (junit) {
    fs.writeFileSync(
      junit,
      `<?xml version="1.0"?>
<testsuite name="audio-mixing-contract" tests="1">
  <testcase name="audio-mixing-validation"></testcase>
</testsuite>`
    );
  }
  console.log("Audio mixing contract OK");
}

function load(p) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch (err) {
    fail(`Unable to load ${p}: ${err.message}`, junit);
  }
}

const args = process.argv.slice(2);
const inputIdx = args.indexOf("--input");
const contractIdx = args.indexOf("--contract");
const junitIdx = args.indexOf("--junit");

const input = inputIdx >= 0 ? args[inputIdx + 1] : null;
const contract = contractIdx >= 0
  ? args[contractIdx + 1]
  : "docs/spec/audio_mixing_contract_v1.0.0.json";
const junit = junitIdx >= 0 ? args[junitIdx + 1] : null;

if (!input) fail("Missing --input", junit);

const spec = load(contract);
const data = load(input);

if (data.audioMixingContractVersion !== spec.audioMixingContractVersion) {
  fail("Version mismatch", junit);
}

if (data.sampleRate !== 48000) {
  fail("Sample rate must be 48000 Hz", junit);
}

if (!data.mix) fail("Missing mix data", junit);

// Loudness rules
if (data.mix.lufsIntegrated < -16.2 || data.mix.lufsIntegrated > -15.8) {
  fail("Integrated loudness out of tolerance", junit);
}

if (data.mix.truePeakDbtp > -1.2) {
  fail("True peak exceeds allowed ceiling", junit);
}

if (!Array.isArray(data.voice) || data.voice.length === 0) {
  fail("At least one voice track required", junit);
}

for (const v of data.voice) {
  if (typeof v.startSec !== "number" || typeof v.endSec !== "number") {
    fail(`Voice track missing timing: ${v.id}`, junit);
  }
  if (Math.abs(v.startSec - Math.round(v.startSec * 100) / 100) > 1e-6) {
    fail(`Voice start must snap to 0.01s: ${v.id}`, junit);
  }
  if (Math.abs(v.endSec - Math.round(v.endSec * 100) / 100) > 1e-6) {
    fail(`Voice end must snap to 0.01s: ${v.id}`, junit);
  }
  if (v.lufsIntegrated > -17.8 || v.lufsIntegrated < -18.2) {
    fail(`Voice track loudness out of range: ${v.id}`, junit);
  }
  if (v.truePeakDbtp > -1.2) {
    fail(`Voice track peak too high: ${v.id}`, junit);
  }
}

if (!data.backgroundMusic) fail("Missing background music", junit);
if (data.backgroundMusic.lufsIntegrated > -25.5 || data.backgroundMusic.lufsIntegrated < -26.5) {
  fail("BGM loudness must be -26 LUFS", junit);
}

if (typeof data.backgroundMusic.entrySec === "number") {
  const snapped = Math.round(data.backgroundMusic.entrySec * 100) / 100;
  if (Math.abs(data.backgroundMusic.entrySec - snapped) > 1e-6) {
    fail("BGM entry must snap to 0.01s", junit);
  }
}

if (!data.ducking) fail("Missing ducking section", junit);
if (!spec.properties.ducking.properties.mode.enum.includes(data.ducking.mode)) {
  fail("Invalid ducking mode", junit);
}
if (data.ducking.mode === "envelope") {
  if (data.ducking.attackSec !== 0.15) fail("Invalid attackSec", junit);
  if (data.ducking.releaseSec !== 0.35) fail("Invalid releaseSec", junit);
}
if (data.ducking.dipDb !== -10) fail("Ducking amount must be -10 dB", junit);

ok(junit);
