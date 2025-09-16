#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const assertPerfBaselineShape = require('./lib/assertPerfBaselineShape.cjs');
const probeVideo = require('./lib/probeVideo.cjs');
const computePerfKey = require('./lib/computePerfKey.cjs');

const PERF_BASELINE_SCHEMA_VERSION = assertPerfBaselineShape.SCHEMA_VERSION;
const perfDir = process.env.PERF_DIR || 'reports/perf';
const tolerance = parseFloat(process.env.PERF_TOLERANCE || '0.05'); // 5% by default
const branch = (process.env.GITHUB_REF_NAME || '').toLowerCase();
const isMain = /^(main|master)$/.test(branch);
const warnOnly = process.env.PERF_WARN_ONLY === '1' || !isMain;
const requireBaselineOnMain = process.env.PERF_REQUIRE_BASELINE_ON_MAIN === '1';

function exists(p) { try { return p && fs.existsSync(p); } catch { return false; } }

const candidatePaths = [
  process.env.PERF_BASELINE_PATH,
  path.resolve(__dirname, '..', 'baselines', 'perf.json'),
  path.resolve(__dirname, '..', 'perf_baseline.json'),
].filter(Boolean);

const baselinePath = candidatePaths.find(exists);
if (!baselinePath) {
  console.error('[perf-baseline] No baseline file found. Tried:', candidatePaths.join(' | '));
  process.exit(1);
}
console.log('[perf-baseline] Using baseline:', baselinePath);

function writeJUnit(cases, junitPath = 'reports/junit/perf_baseline.xml') {
  const tests = cases.length;
  const failures = cases.filter(c => c.fail && !c.warnOnly).length;
  const skipped = cases.filter(c => c.fail && c.warnOnly).length;
  
  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<testsuite name="perf-baseline" tests="${tests}" failures="${failures}" skipped="${skipped}">`,
    ...cases.map(c => {
      const name = `${c.game}-${c.platform}-${c.resolution||'unknown'}-${c.codec||'unknown'}`;
      let testCaseContent = '';
      
      if (c.fail && c.warnOnly) {
        // Warn-only mode - mark as skipped instead of failed
        const message = `Perf regression (warn-only mode): ${c.measured.toFixed(2)} < allowed ${c.allowed.toFixed(2)} (baseline ${c.baseline.toFixed(2)})`;
        testCaseContent = `<skipped message="${message}"/>
    <system-out>${JSON.stringify({
      measured: c.measured,
      allowed: c.allowed,
      baseline: c.baseline,
      tolerance: c.tolerance,
      ffmpeg: c.ffmpeg,
      node: c.node,
    })}</system-out>`;
      } else if (c.fail) {
        // Failed mode
        const message = `Perf regression: ${c.measured.toFixed(2)} < allowed ${c.allowed.toFixed(2)} (baseline ${c.baseline.toFixed(2)})`;
        testCaseContent = `<failure message="${message}"/>
    <system-out>${JSON.stringify({
      measured: c.measured,
      allowed: c.allowed,
      baseline: c.baseline,
      tolerance: c.tolerance,
      ffmpeg: c.ffmpeg,
      node: c.node,
    })}</system-out>`;
      } else {
        // Passed
        testCaseContent = `<system-out>${JSON.stringify({
      measured: c.measured,
      allowed: c.allowed,
      baseline: c.baseline,
      tolerance: c.tolerance,
      ffmpeg: c.ffmpeg,
      node: c.node,
    })}</system-out>`;
      }
      
      return `  <testcase classname="perf-baseline" name="${name}">
    ${testCaseContent}
  </testcase>`;
    }),
    '</testsuite>'
  ].join('\n');

  fs.mkdirSync(path.dirname(junitPath), { recursive: true });
  fs.writeFileSync(junitPath, xml);
}

function comparePerfToBaseline() {
  // Load baseline
  let baseline = {};
  try {
    // Load and validate baseline
    if (fs.existsSync(baselinePath)) {
      const baselineData = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
      assertPerfBaselineShape(baselineData);
      baseline = baselineData.entries.reduce((acc, entry) => {
        const key = `${entry.game}|${entry.platform}`;
        acc[key] = entry.min_fps;
        return acc;
      }, {});
    }
  } catch (err) {
    console.error('Error loading or validating perf baseline:', err.message);
    process.exit(1);
  }

  const perfFiles = fs.readdirSync(perfDir).filter(f => f.endsWith('.json'));

  if (perfFiles.length === 0) {
    console.log(`[perf-baseline] No performance reports found in ${perfDir}`);
    process.exit(0);
  }

  const reportPath = path.join(perfDir, perfFiles[0]);
  const reportData = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  
  // Handle both single report and array of reports
  const reports = Array.isArray(reportData) ? reportData : [reportData];
  const cases = [];
  
  // Pass warnOnly flag to cases
  for (const report of reports) {
    // Use probeVideo to get standardized resolution/codec info
    const videoPath = path.join('media', report.game, 'video.mp4');
    let videoInfo = { resolution: 'unknown', codec: 'unknown' };
    try {
      if (fs.existsSync(videoPath)) {
        videoInfo = probeVideo(videoPath);
      }
    } catch (err) {
      console.warn(`Could not probe video for ${report.game}: ${err.message}`);
    }
    
    // Normalize keys
    const normalizedResolution = videoInfo.width && videoInfo.height ? 
      `${videoInfo.width}x${videoInfo.height}` : videoInfo.resolution;
    const normalizedCodec = (videoInfo.codec || 'unknown').toLowerCase();
    const normalizedMeasuredFps = Math.round(report.fps * 100) / 100; // Round to 2 decimal places
    
    // Compute perf key
    const perfKey = computePerfKey({
      game: report.game,
      platform: report.platform,
      resolution: normalizedResolution,
      codec: normalizedCodec
    });
    
    const key = `${report.game}|${report.platform}`;
    const base = baseline[key];
    const measured = normalizedMeasuredFps;
    const allowed = base ? base * (1 - tolerance) : 0;
    
    // On main branch, fail if baseline is missing
    if (!base && requireBaselineOnMain) {
      cases.push({
        game: report.game,
        platform: report.platform,
        resolution: normalizedResolution,
        codec: normalizedCodec,
        measured,
        allowed,
        baseline: base,
        tolerance,
        ffmpeg: process.env.FFMPEG_VERSION || 'unknown',
        node: process.version,
        fail: true,
        reason: 'missing baseline'
      });
      continue;
    }
    
    cases.push({
      game: report.game,
      platform: report.platform,
      resolution: normalizedResolution,
      codec: normalizedCodec,
      measured,
      allowed,
      baseline: base,
      tolerance,
      ffmpeg: process.env.FFMPEG_VERSION || 'unknown',
      node: process.version,
      fail: base ? measured < allowed : false,
      warnOnly: warnOnly // Pass warnOnly flag
    });
  }
  
  // After computing failures/summaries, write JUnit report
  writeJUnit(cases);

  const failures = cases.filter(c => c.fail);

  if (failures.length) {
    const lines = failures.map(x => {
      if (x.reason === 'missing baseline') {
        return `- ${x.game}-${x.platform}: missing baseline on main branch`;
      }
      return `- ${x.game}-${x.platform}: measured=${x.measured.toFixed(2)} < allowed=${x.allowed.toFixed(2)} (baseline=${x.baseline.toFixed(2)})`;
    });
    console.log('[perf-baseline] Perf issues detected:\n' + lines.join('\n'));
    if (warnOnly) {
      console.log('[perf-baseline] WARN-ONLY mode: exiting with code 0 despite performance issues');
      process.exit(0);
    }
    process.exit(1);
  } else {
    console.log('[perf-baseline] No perf issues against baseline.');
  }
}

// Run the comparison
comparePerfToBaseline();