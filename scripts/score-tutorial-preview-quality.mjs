#!/usr/bin/env node

/**
 * score-tutorial-preview-quality.mjs — Advisory cookbook-style quality scorer.
 *
 * Scores a generated tutorial preview against cookbook-style presentation
 * heuristics. Produces an advisory quality report without changing render output.
 * This is NOT a blocking gate — existing reproducibility validators remain authoritative.
 *
 * Usage:
 *   node scripts/score-tutorial-preview-quality.mjs
 *   node scripts/score-tutorial-preview-quality.mjs --dir out/tutorial-preview
 *   node scripts/score-tutorial-preview-quality.mjs --dir out/tutorial-preview --out out/tutorial-preview/quality-report.json
 *
 * Exit codes:
 *   0 = report generated (regardless of score)
 *   1 = script error (missing required inputs, malformed JSON)
 */

import { existsSync, readFileSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);

function getArg(name) {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1 || idx + 1 >= args.length) return null;
  return args[idx + 1];
}

const dir = getArg('dir') || resolve('out/tutorial-preview');
const outPath = getArg('out') || join(dir, 'quality-report.json');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function loadJson(filePath) {
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function fileSize(filePath) {
  try { return statSync(filePath).size; } catch { return 0; }
}

// ---------------------------------------------------------------------------
// Scoring categories
// ---------------------------------------------------------------------------
const observations = [];
const categories = {};

function observe(category, level, message) {
  observations.push({ category, level, message });
}

function scoreCategory(name, score, maxScore, details) {
  categories[name] = { score, maxScore, pct: Math.round((score / maxScore) * 100), details };
}

// ---------------------------------------------------------------------------
// Load required files
// ---------------------------------------------------------------------------
console.log('[quality-score] Cookbook-Style Tutorial Quality Scoring');
console.log(`  dir: ${dir}`);

const script = loadJson(join(dir, 'script.json'));
const storyboard = loadJson(join(dir, 'storyboard.json'));
const renderConfig = loadJson(join(dir, 'render-config.json'));
const manifest = loadJson(join(dir, 'manifest.json'));
const ffprobe = loadJson(join(dir, 'ffprobe.json'));
const vqaManifest = loadJson(join(dir, 'visual-qa/visual-qa-manifest.json'));

const captionsPath = join(dir, 'captions.srt');
const captionsContent = existsSync(captionsPath) ? readFileSync(captionsPath, 'utf8') : null;

if (!script || !storyboard || !ffprobe) {
  console.error('[quality-score] ERROR: Required files missing (script.json, storyboard.json, or ffprobe.json)');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 1. Structure Clarity (cookbook: clear sequential steps)
// ---------------------------------------------------------------------------
{
  let score = 0;
  const maxScore = 20;
  const segments = script.segments || [];

  // Has hook/intro segment
  if (segments.some((s) => s.type === 'hook' || s.type === 'intro')) {
    score += 4;
    observe('structureClarity', 'pass', 'Has opening hook/intro segment');
  } else {
    observe('structureClarity', 'warn', 'Missing opening hook/intro segment');
  }

  // Has end card
  if (segments.some((s) => s.type === 'end_card' || s.type === 'recap')) {
    score += 4;
    observe('structureClarity', 'pass', 'Has closing end card/recap');
  } else {
    observe('structureClarity', 'warn', 'Missing closing end card/recap');
  }

  // Segment count in cookbook range (8-15 for a good tutorial)
  if (segments.length >= 8 && segments.length <= 15) {
    score += 6;
    observe('structureClarity', 'pass', `Segment count (${segments.length}) in optimal cookbook range 8-15`);
  } else if (segments.length >= 5) {
    score += 3;
    observe('structureClarity', 'warn', `Segment count (${segments.length}) below optimal range`);
  } else {
    observe('structureClarity', 'fail', `Segment count (${segments.length}) too low for a cookbook tutorial`);
  }

  // All segments have narration (readability)
  const withNarration = segments.filter((s) => s.narration && s.narration.length > 10);
  if (withNarration.length === segments.length) {
    score += 6;
    observe('structureClarity', 'pass', 'All segments have meaningful narration text');
  } else {
    const missing = segments.length - withNarration.length;
    score += Math.max(0, 6 - missing);
    observe('structureClarity', 'warn', `${missing} segment(s) have short/missing narration`);
  }

  scoreCategory('structureClarity', score, maxScore, 'Clear cookbook-style sequential structure');
}

// ---------------------------------------------------------------------------
// 2. Step Sequencing (cookbook: logical learning order)
// ---------------------------------------------------------------------------
{
  let score = 0;
  const maxScore = 15;
  const segments = script.segments || [];
  const types = segments.map((s) => s.type);

  // Starts with hook/intro before content
  const firstContent = types.findIndex((t) => !['hook', 'intro', 'game_identity'].includes(t));
  if (firstContent > 0) {
    score += 5;
    observe('stepSequencing', 'pass', 'Content begins after introductory segment(s)');
  } else if (firstContent === 0 && types[0] === 'hook') {
    score += 5;
  } else {
    score += 2;
    observe('stepSequencing', 'warn', 'Content starts abruptly without introduction');
  }

  // Ends with recap/end_card
  const lastType = types[types.length - 1];
  if (lastType === 'end_card' || lastType === 'recap') {
    score += 5;
    observe('stepSequencing', 'pass', 'Ends with recap/end card');
  } else {
    observe('stepSequencing', 'warn', 'Does not end with recap/end card');
  }

  // Has core mechanic before scoring (proper learning order)
  const coreIdx = types.indexOf('core_mechanic');
  const scoringIdx = types.indexOf('scoring');
  if (coreIdx >= 0 && scoringIdx >= 0 && coreIdx < scoringIdx) {
    score += 5;
    observe('stepSequencing', 'pass', 'Core mechanic taught before scoring rules');
  } else if (coreIdx >= 0 || scoringIdx >= 0) {
    score += 3;
    observe('stepSequencing', 'warn', 'Sequencing of core mechanic vs scoring could be improved');
  } else {
    score += 2;
  }

  scoreCategory('stepSequencing', score, maxScore, 'Logical cookbook learning order');
}

// ---------------------------------------------------------------------------
// 3. Caption Coverage
// ---------------------------------------------------------------------------
{
  let score = 0;
  const maxScore = 15;

  if (captionsContent) {
    const cuePattern = /^\d+\s*\n\d{2}:\d{2}:\d{2},\d{3}\s*-->\s*\d{2}:\d{2}:\d{2},\d{3}/gm;
    const cueCount = (captionsContent.match(cuePattern) || []).length;

    if (cueCount >= 20) {
      score += 8;
      observe('captionCoverage', 'pass', `${cueCount} caption cues provide full narration coverage`);
    } else if (cueCount >= 10) {
      score += 5;
      observe('captionCoverage', 'warn', `${cueCount} cues — partial coverage`);
    } else {
      observe('captionCoverage', 'fail', `Only ${cueCount} caption cues`);
    }

    // Caption density relative to duration
    const duration = parseFloat(ffprobe.format?.duration || '0');
    if (duration > 0 && cueCount > 0) {
      const cuesPerMinute = cueCount / (duration / 60);
      if (cuesPerMinute >= 10) {
        score += 7;
        observe('captionCoverage', 'pass', `Caption density: ${cuesPerMinute.toFixed(1)} cues/min (good pacing)`);
      } else if (cuesPerMinute >= 5) {
        score += 4;
        observe('captionCoverage', 'warn', `Caption density: ${cuesPerMinute.toFixed(1)} cues/min (sparse)`);
      } else {
        score += 2;
        observe('captionCoverage', 'warn', `Caption density: ${cuesPerMinute.toFixed(1)} cues/min (very sparse)`);
      }
    }
  } else {
    observe('captionCoverage', 'fail', 'No captions.srt found');
  }

  scoreCategory('captionCoverage', score, maxScore, 'Caption accessibility and pacing');
}

// ---------------------------------------------------------------------------
// 4. Visual Review Coverage
// ---------------------------------------------------------------------------
{
  let score = 0;
  const maxScore = 15;

  if (vqaManifest) {
    const frameCount = vqaManifest.frameCount || 0;
    const timestamps = vqaManifest.timestamps || [];

    if (frameCount >= 8) {
      score += 7;
      observe('visualReviewCoverage', 'pass', `${frameCount} review frames extracted`);
    } else if (frameCount >= 4) {
      score += 4;
      observe('visualReviewCoverage', 'warn', `Only ${frameCount} review frames`);
    } else {
      observe('visualReviewCoverage', 'fail', `${frameCount} frames insufficient for review`);
    }

    // Timestamp spread across video
    if (timestamps.length >= 2) {
      const duration = vqaManifest.videoDuration || parseFloat(ffprobe.format?.duration || '0');
      const firstTs = timestamps[0];
      const lastTs = timestamps[timestamps.length - 1];
      const coverage = duration > 0 ? (lastTs - firstTs) / duration : 0;
      if (coverage > 0.8) {
        score += 8;
        observe('visualReviewCoverage', 'pass', `Frames span ${(coverage * 100).toFixed(0)}% of video duration`);
      } else if (coverage > 0.5) {
        score += 5;
        observe('visualReviewCoverage', 'warn', `Frames span only ${(coverage * 100).toFixed(0)}% of video`);
      } else {
        score += 2;
        observe('visualReviewCoverage', 'fail', `Frames span only ${(coverage * 100).toFixed(0)}% of video`);
      }
    }
  } else {
    observe('visualReviewCoverage', 'fail', 'No visual QA manifest found');
  }

  scoreCategory('visualReviewCoverage', score, maxScore, 'Human visual review frame coverage');
}

// ---------------------------------------------------------------------------
// 5. Pacing / Duration
// ---------------------------------------------------------------------------
{
  let score = 0;
  const maxScore = 10;

  const duration = parseFloat(ffprobe.format?.duration || '0');
  const segments = script.segments || [];

  // Duration in ideal tutorial range (60-120s for a cookbook quick-start)
  if (duration >= 60 && duration <= 120) {
    score += 5;
    observe('pacing', 'pass', `Duration ${duration.toFixed(0)}s in ideal cookbook tutorial range (60-120s)`);
  } else if (duration >= 45 && duration <= 180) {
    score += 3;
    observe('pacing', 'warn', `Duration ${duration.toFixed(0)}s is acceptable but not ideal`);
  } else {
    observe('pacing', 'fail', `Duration ${duration.toFixed(0)}s outside expected range`);
  }

  // Average segment duration (cookbook: 5-10s per step is ideal)
  if (segments.length > 0) {
    const avgSec = duration / segments.length;
    if (avgSec >= 4 && avgSec <= 12) {
      score += 5;
      observe('pacing', 'pass', `Average ${avgSec.toFixed(1)}s/segment (good pacing for comprehension)`);
    } else if (avgSec >= 2 && avgSec <= 20) {
      score += 3;
      observe('pacing', 'warn', `Average ${avgSec.toFixed(1)}s/segment (could be tighter)`);
    } else {
      score += 1;
      observe('pacing', 'warn', `Average ${avgSec.toFixed(1)}s/segment (pacing issue)`);
    }
  }

  scoreCategory('pacing', score, maxScore, 'Tutorial pacing and duration');
}

// ---------------------------------------------------------------------------
// 6. Reproducibility Confidence
// ---------------------------------------------------------------------------
{
  let score = 0;
  const maxScore = 10;

  // All core files present
  const coreFiles = ['preview.mp4', 'script.json', 'storyboard.json', 'captions.srt', 'render-config.json', 'manifest.json', 'ffprobe.json'];
  const allCorePresent = coreFiles.every((f) => existsSync(join(dir, f)) && fileSize(join(dir, f)) > 0);
  if (allCorePresent) {
    score += 5;
    observe('reproducibility', 'pass', 'All 7 core files present and non-zero');
  } else {
    observe('reproducibility', 'fail', 'Some core files missing or empty');
  }

  // Visual QA files present
  const vqaPresent = existsSync(join(dir, 'visual-qa/contact-sheet.jpg')) && existsSync(join(dir, 'visual-qa/visual-qa-manifest.json'));
  if (vqaPresent) {
    score += 5;
    observe('reproducibility', 'pass', 'Visual QA outputs present');
  } else {
    score += 2;
    observe('reproducibility', 'warn', 'Visual QA outputs incomplete');
  }

  scoreCategory('reproducibility', score, maxScore, 'Reproducibility and completeness confidence');
}

// ---------------------------------------------------------------------------
// 7. Asset Completeness
// ---------------------------------------------------------------------------
{
  let score = 0;
  const maxScore = 10;

  // Manifest references all pipeline stages
  if (manifest) {
    const stages = ['script', 'storyboard', 'captions', 'render'];
    const present = stages.filter((s) => manifest[s]);
    score += Math.round((present.length / stages.length) * 5);
    if (present.length === stages.length) {
      observe('assetCompleteness', 'pass', 'Manifest covers all pipeline stages');
    } else {
      observe('assetCompleteness', 'warn', `Manifest missing stages: ${stages.filter((s) => !manifest[s]).join(', ')}`);
    }
  }

  // Render config has scenes matching script
  if (renderConfig && script) {
    const rcScenes = renderConfig.scenes?.length || 0;
    const scriptSegs = script.segments?.length || 0;
    if (rcScenes === scriptSegs) {
      score += 5;
      observe('assetCompleteness', 'pass', `Render config scenes (${rcScenes}) match script segments (${scriptSegs})`);
    } else {
      score += 2;
      observe('assetCompleteness', 'warn', `Render scenes (${rcScenes}) != script segments (${scriptSegs})`);
    }
  }

  scoreCategory('assetCompleteness', score, maxScore, 'Pipeline asset alignment');
}

// ---------------------------------------------------------------------------
// 8. Tutorial Readability Proxy
// ---------------------------------------------------------------------------
{
  let score = 0;
  const maxScore = 5;
  const segments = script.segments || [];

  // Average narration length (cookbook: 15-60 words per step)
  const narrationLengths = segments.map((s) => (s.narration || '').split(/\s+/).length);
  const avgWords = narrationLengths.reduce((a, b) => a + b, 0) / (narrationLengths.length || 1);

  if (avgWords >= 15 && avgWords <= 60) {
    score += 5;
    observe('readability', 'pass', `Average ${avgWords.toFixed(0)} words/segment (clear cookbook density)`);
  } else if (avgWords >= 8 && avgWords <= 100) {
    score += 3;
    observe('readability', 'warn', `Average ${avgWords.toFixed(0)} words/segment (could be more concise)`);
  } else {
    score += 1;
    observe('readability', 'warn', `Average ${avgWords.toFixed(0)} words/segment (readability concern)`);
  }

  scoreCategory('readability', score, maxScore, 'Narration readability for cookbook-style presentation');
}

// ---------------------------------------------------------------------------
// Overall score
// ---------------------------------------------------------------------------
const totalScore = Object.values(categories).reduce((sum, c) => sum + c.score, 0);
const totalMax = Object.values(categories).reduce((sum, c) => sum + c.maxScore, 0);
const overallPct = Math.round((totalScore / totalMax) * 100);

// ---------------------------------------------------------------------------
// Quality report
// ---------------------------------------------------------------------------
const report = {
  version: '1.0.0',
  generatedAt: new Date().toISOString(),
  mode: 'advisory',
  fixture: manifest?.game?.name || 'unknown',
  overallScore: { score: totalScore, maxScore: totalMax, pct: overallPct },
  categories,
  observations,
  recommendations: [],
};

// Generate recommendations based on lowest-scoring categories
const sortedCategories = Object.entries(categories).sort((a, b) => a[1].pct - b[1].pct);
for (const [name, cat] of sortedCategories.slice(0, 3)) {
  if (cat.pct < 80) {
    report.recommendations.push(`Improve "${name}" (${cat.pct}%): ${cat.details}`);
  }
}

if (report.recommendations.length === 0) {
  report.recommendations.push('All categories scoring well. Consider adding visual polish or a second fixture for generality testing.');
}

// Write report
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(report, null, 2));

// Console output
console.log('');
console.log(`[quality-score] Overall: ${totalScore}/${totalMax} (${overallPct}%)`);
console.log('');
for (const [name, cat] of Object.entries(categories)) {
  const bar = cat.pct >= 80 ? 'GOOD' : cat.pct >= 60 ? 'FAIR' : 'LOW';
  console.log(`  ${name}: ${cat.score}/${cat.maxScore} (${cat.pct}%) [${bar}]`);
}
console.log('');
console.log(`[quality-score] Report written to: ${outPath}`);
console.log('[quality-score] Mode: advisory (non-blocking)');
