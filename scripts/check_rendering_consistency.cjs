#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

function parseArgs() {
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
  return args;
}

const args = parseArgs();
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

function runCapture(cmd) {
  return run(`${cmd} 2>&1`);
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function loadArc() {
  const arcPath = path.join(__dirname, "../docs/spec/authoritative_rendering_contract.json");
  return JSON.parse(fs.readFileSync(arcPath, "utf8"));
}

function logArcSummary(arc) {
  if (arc.audio) {
    console.log(
      `Audio: sampleRate=${arc.audio.sampleRate}Hz, channels=${arc.audio.channels}, ` +
        `targetLufs=${arc.audio.targetLufs}, truePeakCeiling=${arc.audio.truePeakCeiling} dBTP`
    );
    if (arc.audio.toleranceLufs !== undefined || arc.audio.toleranceTruePeakDb !== undefined) {
      console.log(
        `       tolerances: ±${arc.audio.toleranceLufs ?? "?"} LUFS, ` +
          `±${arc.audio.toleranceTruePeakDb ?? "?"} dBTP`
      );
    }
    if (
      arc.audio.requireEbur128Probe !== undefined ||
      arc.audio.requireTruePeakProbe !== undefined
    ) {
      console.log(
        `       probes: ebur128=${arc.audio.requireEbur128Probe ?? false}, ` +
          `truePeak=${arc.audio.requireTruePeakProbe ?? false}`
      );
    }
  } else {
    console.log("Audio: <missing audio section in ARC>");
  }
}

function arcToJUnitPropertiesXml(arc) {
  const props = [];
  function pushProp(name, value) {
    if (value === undefined || value === null) return;
    props.push(`    <property name="${escapeXml(name)}" value="${escapeXml(value)}" />`);
  }

  if (arc.video) {
    pushProp("arc.video.width", arc.video.width);
    pushProp("arc.video.height", arc.video.height);
    pushProp("arc.video.pixelFormat", arc.video.pixelFormat);
    pushProp("arc.video.sampleAspectRatio", arc.video.sampleAspectRatio);
    pushProp("arc.video.frameRate", arc.video.frameRate);
    if (Array.isArray(arc.video.allowedFrameRates)) {
      pushProp("arc.video.allowedFrameRates", arc.video.allowedFrameRates.join(","));
    }
    pushProp("arc.video.previewSeconds", arc.video.previewSeconds);
  }

  if (arc.audio) {
    pushProp("arc.audio.sampleRate", arc.audio.sampleRate);
    pushProp("arc.audio.channels", arc.audio.channels);
    pushProp("arc.audio.targetLufs", arc.audio.targetLufs);
    pushProp("arc.audio.truePeakCeiling", arc.audio.truePeakCeiling);
    if (arc.audio.toleranceLufs !== undefined) {
      pushProp("arc.audio.toleranceLufs", arc.audio.toleranceLufs);
    }
    if (arc.audio.toleranceTruePeakDb !== undefined) {
      pushProp("arc.audio.toleranceTruePeakDb", arc.audio.toleranceTruePeakDb);
    }
    if (arc.audio.requireEbur128Probe !== undefined) {
      pushProp("arc.audio.requireEbur128Probe", arc.audio.requireEbur128Probe);
    }
    if (arc.audio.requireTruePeakProbe !== undefined) {
      pushProp("arc.audio.requireTruePeakProbe", arc.audio.requireTruePeakProbe);
    }
  }

  if (arc.ssim) {
    pushProp("arc.ssim.pass", arc.ssim.pass);
    pushProp("arc.ssim.softPass", arc.ssim.softPass);
  }

  if (props.length === 0) {
    return "";
  }

  return `  <properties>\n${props.join("\n")}\n  </properties>\n`;
}

function buildArcContractTestCase(arc) {
  return {
    name: "arc-contract",
    classname: "rendering.contract",
    systemOut: JSON.stringify(arc, null, 2),
  };
}

function buildAudioContractTestCase(arc, measured) {
  const name = `audio-contract[targetLufs=${arc.audio.targetLufs} LUFS | ` +
    `tol=${arc.audio.toleranceLufs ?? "?"} | ` +
    `ceiling=${arc.audio.truePeakCeiling} dBTP | ` +
    `tolTP=${arc.audio.toleranceTruePeakDb ?? "?"}]`;

  const classname = "rendering.audio";

  // If probes are required but we have no data, fail loudly.
  if (!measured) {
    const missing = [];
    if (arc.audio.requireEbur128Probe) missing.push("EBUR128");
    if (arc.audio.requireTruePeakProbe) missing.push("true-peak");

    if (missing.length > 0) {
      return {
        name,
        classname,
        failureMessage: `Audio probes required by ARC but missing: ${missing.join(", ")}`,
      };
    }

    // Probes not required and no data: treat as neutral pass.
    return { name, classname, systemOut: "Audio probes not run" };
  }

  const { integratedLufs, truePeakDbtp } = measured;
  const failures = [];

  const tolLufs = arc.audio.toleranceLufs ?? 0.5;
  const tolPeak = arc.audio.toleranceTruePeakDb ?? 0.5;

  const lufsDelta = Math.abs(integratedLufs - arc.audio.targetLufs);
  if (lufsDelta > tolLufs) {
    failures.push(
      `Integrated loudness ${integratedLufs.toFixed(2)} LUFS outside tolerance ` +
        `±${tolLufs} of target ${arc.audio.targetLufs}`
    );
  }

  const peakOvershoot = truePeakDbtp - arc.audio.truePeakCeiling;
  if (peakOvershoot > tolPeak) {
    failures.push(
      `True peak ${truePeakDbtp.toFixed(2)} dBTP exceeds ceiling ${arc.audio.truePeakCeiling} ` +
        `by more than ${tolPeak} dB (overshoot=${peakOvershoot.toFixed(2)} dB)`
    );
  }

  if (failures.length > 0) {
    return {
      name,
      classname,
      failureMessage: failures.join(" | "),
      systemOut: JSON.stringify(measured, null, 2),
    };
  }

  return { name, classname, systemOut: JSON.stringify(measured, null, 2) };
}

function buildJUnitXml(arc, testCases) {
  const total = testCases.length;
  const failures = testCases.filter(tc => Boolean(tc.failureMessage)).length;
  const propertiesXml = arcToJUnitPropertiesXml(arc);
  const casesXml = testCases
    .map(tc => {
      const classname = tc.classname ? ` classname="${escapeXml(tc.classname)}"` : "";
      let body = "";
      if (tc.failureMessage) {
        body += `    <failure message="${escapeXml(tc.failureMessage)}" />\n`;
      }
      if (tc.systemOut) {
        body += `    <system-out><![CDATA[${tc.systemOut}]]></system-out>\n`;
      }
      return `  <testcase name="${escapeXml(tc.name)}"${classname}>\n${body}  </testcase>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<testsuite name="rendering_consistency" tests="${total}" failures="${failures}">\n${propertiesXml}${casesXml}\n</testsuite>\n`;
}

function writeJUnit(arc, testCases, outPath) {
  const xml = buildJUnitXml(arc, testCases);
  fs.writeFileSync(outPath, xml);
}

function runAudioProbe(previewPath, outDir) {
  try {
    const logOutput = runCapture(
      `ffmpeg -hide_banner -i "${previewPath}" -filter_complex ebur128=dualmono=1 -f null -`
    );
    const logPath = path.join(outDir, "ebur128.log");
    fs.writeFileSync(logPath, logOutput);

    const lufsMatch = logOutput.match(/Integrated loudness:[\s\S]*?I:\s*(-?\d+(?:\.\d+)?) LUFS/i);
    const peakMatch = logOutput.match(/True peak:[\s\S]*?(?:Peak|Peak level):\s*(-?\d+(?:\.\d+)?) dB/i);

    if (!lufsMatch || !peakMatch) {
      log("Audio probe completed but metrics could not be parsed.");
      return null;
    }

    const integratedLufs = parseFloat(lufsMatch[1]);
    const truePeakDbtp = parseFloat(peakMatch[1]);
    const metrics = { integratedLufs, truePeakDbtp };

    const metricsJsonPath = path.join(outDir, "preview_audio_metrics.json");
    const metricsJson = {
      integrated_lufs: integratedLufs,
      true_peak_dbfs: truePeakDbtp,
    };
    fs.writeFileSync(metricsJsonPath, JSON.stringify(metricsJson, null, 2));

    log(`Audio metrics: integrated_lufs=${integratedLufs.toFixed(2)} LUFS, true_peak=${truePeakDbtp.toFixed(2)} dBTP`);
    return metrics;
  } catch (error) {
    log(`Audio probe failed: ${error.message}`);
    return null;
  }
}

function main() {
  const arc = loadArc();
  logArcSummary(arc);

  const previewSeconds = arc.video?.previewSeconds ?? 5;
  const preview = path.join(OUT_DIR, `${GAME}_${PLATFORM}_preview.mp4`);

  run(
    `node scripts/render.js --project-id ${GAME} --mode preview --preview-seconds ${previewSeconds} --out ${preview}`
  );

  const probeJson = path.join(OUT_DIR, "ffprobe.json");
  run(
    `ffprobe -v error -select_streams v:0 -show_entries stream=width,height,avg_frame_rate,r_frame_rate,pix_fmt,sample_aspect_ratio -of json "${preview}" > ${probeJson}`
  );

  const probe = JSON.parse(fs.readFileSync(probeJson, "utf8"));
  const stream = probe.streams[0];

  const testCases = [];
  testCases.push(buildArcContractTestCase(arc));

  const metadataFailures = [];
  const expectedWidth = arc.video?.width;
  if (expectedWidth !== undefined && String(stream.width) !== String(expectedWidth)) {
    metadataFailures.push(`width expected ${expectedWidth}, got ${stream.width}`);
  }

  const expectedHeight = arc.video?.height;
  if (expectedHeight !== undefined && String(stream.height) !== String(expectedHeight)) {
    metadataFailures.push(`height expected ${expectedHeight}, got ${stream.height}`);
  }

  const expectedPixFmt = arc.video?.pixelFormat;
  if (expectedPixFmt && stream.pix_fmt !== expectedPixFmt) {
    metadataFailures.push(`pix_fmt expected ${expectedPixFmt}, got ${stream.pix_fmt}`);
  }

  const expectedSar = arc.video?.sampleAspectRatio;
  if (expectedSar && stream.sample_aspect_ratio !== expectedSar) {
    metadataFailures.push(`sample_aspect_ratio expected ${expectedSar}, got ${stream.sample_aspect_ratio}`);
  }

  const allowedFrameRates = arc.video?.allowedFrameRates || ["30", "30/1", "30000/1001"];
  if (!allowedFrameRates.includes(stream.avg_frame_rate)) {
    metadataFailures.push(`avg_frame_rate ${stream.avg_frame_rate} not in ${allowedFrameRates.join(", ")}`);
  }

  testCases.push({
    name: "metadata",
    classname: "rendering.metadata",
    failureMessage: metadataFailures.length > 0 ? metadataFailures.join(" | ") : undefined,
    systemOut: JSON.stringify(stream, null, 2),
  });

  const framesDir = path.join(OUT_DIR, "frames");
  fs.mkdirSync(framesDir, { recursive: true });
  run(`ffmpeg -i "${preview}" -vf fps=${arc.video?.frameRate ?? 30} "${framesDir}/%05d.png"`);

  const frames = fs.readdirSync(framesDir).filter(f => f.endsWith(".png"));
  const expectedFrames = Math.round((arc.video?.frameRate ?? 30) * previewSeconds);
  const frameLowerBound = expectedFrames - 1;
  const frameUpperBound = expectedFrames + 1;
  let frameFailure;
  if (frames.length < frameLowerBound || frames.length > frameUpperBound) {
    frameFailure = `Frame count out of range: got ${frames.length}, expected between ${frameLowerBound} and ${frameUpperBound}`;
  }

  testCases.push({
    name: "frames",
    classname: "rendering.frames",
    failureMessage: frameFailure,
    systemOut: `Frames extracted: ${frames.length}`,
  });

  const goldenDir = `tests/golden/${GAME}/${PLATFORM}/frames`;
  const ssimLog = path.join(OUT_DIR, "ssim.log");
  run(
    `ffmpeg -i "${framesDir}/%05d.png" -i "${goldenDir}/%05d.png" -lavfi ssim="stats_file=${ssimLog}" -f null -`
  );

  const ssimRaw = fs.readFileSync(ssimLog, "utf8");
  const matches = [...ssimRaw.matchAll(/All:(\d+\.\d+)/g)];
  const avgSSIM = matches.reduce((acc, m) => acc + parseFloat(m[1]), 0) / Math.max(matches.length, 1);
  log(`Average SSIM: ${avgSSIM}`);

  const softPass = arc.ssim?.softPass ?? 0.92;
  const pass = arc.ssim?.pass ?? 0.95;
  let ssimFailure;
  if (avgSSIM < softPass) {
    ssimFailure = `SSIM ${avgSSIM.toFixed(4)} below minimum ${softPass}`;
  }

  testCases.push({
    name: `ssim[pass>=${pass},soft>=${softPass}]`,
    classname: "rendering.ssim",
    failureMessage: ssimFailure,
    systemOut: `SSIM average=${avgSSIM}`,
  });

  const measuredAudio = arc.audio ? runAudioProbe(preview, OUT_DIR) : null;
  if (arc.audio) {
    testCases.push(buildAudioContractTestCase(arc, measuredAudio));
  }

  const junitPath = path.join(OUT_DIR, "junit.xml");
  writeJUnit(arc, testCases, junitPath);

  const failed = testCases.some(tc => Boolean(tc.failureMessage));
  if (failed) {
    log("Rendering consistency check completed with failures. See junit.xml for details.");
    process.exitCode = 1;
  } else {
    log("Rendering consistency check complete.");
  }
}

main();
