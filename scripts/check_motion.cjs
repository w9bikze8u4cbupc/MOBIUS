#!/usr/bin/env node
const fs = require("fs");

function snapFrame(t) {
  return Math.round(t * 60) / 60;
}

function fail(msg, junit) {
  console.error(msg);
  if (junit) {
    fs.writeFileSync(
      junit,
      `<?xml version="1.0"?>
<testsuite name="motion-contract" tests="1">
  <testcase name="motion-validation">
    <failure message="${msg.replace(/"/g, '&quot;')}"></failure>
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
<testsuite name="motion-contract" tests="1">
  <testcase name="motion-validation"></testcase>
</testsuite>`
    );
  }
  console.log("Motion contract OK");
}

const args = process.argv.slice(2);
const inputIndex = args.indexOf("--input");
if (inputIndex === -1) fail("Missing --input", null);

const contractIndex = args.indexOf("--contract");
const junitIndex = args.indexOf("--junit");

const input = args[inputIndex + 1];
const contract =
  contractIndex !== -1
    ? args[contractIndex + 1]
    : "docs/spec/motion_contract_v1.0.0.json";
const junit = junitIndex !== -1 ? args[junitIndex + 1] : null;

if (!input) fail("Missing --input", junit);

const data = JSON.parse(fs.readFileSync(input, "utf8"));
const spec = JSON.parse(fs.readFileSync(contract, "utf8"));

if (data.motionContractVersion !== spec.motionContractVersion) {
  fail("Version mismatch", junit);
}

const motions = Array.isArray(data.motions) ? data.motions : [];
if (motions.length === 0) fail("No motions defined", junit);

const allowedTypes =
  spec?.properties?.motions?.items?.properties?.type?.enum || [];
const allowedEasings =
  spec?.properties?.motions?.items?.properties?.easing?.enum || [];

const propertyMap = {
  fade: ["opacity"],
  slide: ["position"],
  zoom: ["scale"],
  pulse: ["scale", "opacity"],
  highlight: ["position"],
  focus_zoom: ["scale"],
  soft_slide_in: ["position"],
};

const safety = {
  slide: (params, id) => {
    const allowedDirections = ["up", "down", "left", "right"];
    if (!allowedDirections.includes(params.direction)) {
      fail(`Invalid slide direction: ${id}`, junit);
    }
    if (typeof params.distance !== "number") {
      fail(`Slide motions require numeric distance: ${id}`, junit);
    }
    if (params.distance < 0 || params.distance > 1) {
      fail(`Slide distance must remain within safe area: ${id}`, junit);
    }
  },
  fade: (params, id) => {
    if (!("from" in params) || !("to" in params)) {
      fail(`Fade motions require from/to params: ${id}`, junit);
    }
    const values = [params.from, params.to];
    if (values.some((v) => typeof v !== "number" || v < 0 || v > 1)) {
      fail(`Fade opacity must stay within [0,1]: ${id}`, junit);
    }
  },
  zoom: (params, id) => {
    if (!("scaleFrom" in params) || !("scaleTo" in params)) {
      fail(`Zoom motions require scaleFrom/scaleTo params: ${id}`, junit);
    }
    const values = [params.scaleFrom, params.scaleTo];
    if (values.some((v) => typeof v !== "number" || v <= 0)) {
      fail(`Zoom scale must remain positive: ${id}`, junit);
    }
    if (params.center && Array.isArray(params.center)) {
      const [x, y] = params.center;
      if ([x, y].some((v) => typeof v !== "number" || v < 0 || v > 1)) {
        fail(`Zoom center must remain within safe area: ${id}`, junit);
      }
    }
  },
  pulse: (params, id) => {
    if (typeof params.scale !== "number" || params.scale <= 0) {
      fail(`Pulse scale must be positive: ${id}`, junit);
    }
    if (
      typeof params.opacity !== "number" ||
      params.opacity < 0 ||
      params.opacity > 1
    ) {
      fail(`Pulse opacity must remain within [0,1]: ${id}`, junit);
    }
  },
  highlight: (params, id) => {
    if (!params.bounds) {
      fail(`Highlight motions require bounds: ${id}`, junit);
    }
    const { x = 0, y = 0, width = 1, height = 1 } = params.bounds;
    const values = [x, y, width, height];
    if (values.some((v) => typeof v !== "number" || v < 0 || v > 1)) {
      fail(`Highlight bounds must stay within safe area: ${id}`, junit);
    }
  },
  focus_zoom: (params, id) => {
    safety.zoom(params, id);
  },
  soft_slide_in: (params, id) => {
    safety.slide(params, id);
  },
};

if (motions.length > 20) fail("Too many motions in scene", junit);

const seenByVisual = {};
const events = [];
let totalDuration = 0;

for (const m of motions) {
  if (!allowedTypes.includes(m.type)) {
    fail(`Invalid motion type: ${m.id}`, junit);
  }
  if (!allowedEasings.includes(m.easing)) {
    fail(`Invalid easing function: ${m.id}`, junit);
  }
  if (typeof m.params !== "object" || m.params === null) {
    fail(`params must be object: ${m.id}`, junit);
  }
  if (typeof m.startSec !== "number" || m.startSec < 0) {
    fail(`startSec must be >= 0: ${m.id}`, junit);
  }
  if (typeof m.endSec !== "number") {
    fail(`endSec must be numeric: ${m.id}`, junit);
  }

  if (snapFrame(m.startSec) !== m.startSec)
    fail(`startSec not snapped: ${m.id}`, junit);

  if (snapFrame(m.endSec) !== m.endSec)
    fail(`endSec not snapped: ${m.id}`, junit);

  if (m.startSec >= m.endSec)
    fail(`Invalid timing: ${m.id}`, junit);

  const duration = m.endSec - m.startSec;

  if (duration < 0.0833)
    fail(`Motion too short: ${m.id}`, junit);

  if (duration > 4.0)
    fail(`Motion too long: ${m.id}`, junit);

  totalDuration += duration;

  const guard = safety[m.type];
  if (guard) {
    guard(m.params, m.id);
  }

  if (!seenByVisual[m.visualId]) seenByVisual[m.visualId] = [];

  const properties = propertyMap[m.type] || [m.type];

  for (const prev of seenByVisual[m.visualId]) {
    const overlap = m.startSec < prev.endSec && m.endSec > prev.startSec;
    if (overlap) {
      const sharesProperty = prev.properties.some((prop) =>
        properties.includes(prop)
      );
      if (sharesProperty) {
        fail(
          `Contradictory overlapping motions on same property: ${m.id}`,
          junit
        );
      }
    }
  }
  seenByVisual[m.visualId].push({
    startSec: m.startSec,
    endSec: m.endSec,
    properties,
  });

  events.push({ time: m.startSec, delta: 1, id: m.id });
  events.push({ time: m.endSec, delta: -1, id: m.id });
}

events.sort((a, b) => (a.time === b.time ? a.delta - b.delta : a.time - b.time));

let concurrent = 0;
let maxConcurrent = 0;
for (const evt of events) {
  concurrent += evt.delta;
  maxConcurrent = Math.max(maxConcurrent, concurrent);
  if (concurrent > 3) {
    fail(`Too many concurrent motions detected at ${evt.time}s`, junit);
  }
}

if (maxConcurrent > 3) {
  fail("Exceeded maximum concurrent motions", junit);
}

if (totalDuration > 12) {
  fail("Total motion time exceeds global budget", junit);
}

ok(junit);
