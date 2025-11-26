#!/usr/bin/env node
/**
 * MOBIUS checklist validator CLI
 *
 * This script evaluates a subset of the "Simple End-to-End Checklist" for tutorial generation.
 * It relies on existing artifacts (container.json, golden JUnit XML, manifests) and converts
 * them into a simple pass/fail report keyed by checklist IDs (e.g., G05, I01, J02).
 *
 * The implementation is intentionally lightweight so that new checks can be added incrementally
 * without changing upstream generators. Missing artifacts are treated as explicit failures
 * with human-readable reasons to help CI and manual runs debug issues quickly.
 */

const fs = require('node:fs');
const path = require('node:path');

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const [key, value] = arg.split('=');
      const name = key.replace(/^--/, '');
      if (value !== undefined) {
        args[name] = value;
      } else {
        const next = argv[i + 1];
        if (next && !next.startsWith('--')) {
          args[name] = next;
          i += 1;
        } else {
          args[name] = true;
        }
      }
    } else {
      args._.push(arg);
    }
  }
  return args;
}

function fileExists(filepath) {
  try {
    fs.accessSync(filepath, fs.constants.R_OK);
    return true;
  } catch (err) {
    return false;
  }
}

function loadJson(filepath) {
  if (!fileExists(filepath)) {
    return { exists: false, data: null, error: `File not found: ${filepath}` };
  }
  try {
    const raw = fs.readFileSync(filepath, 'utf8');
    return { exists: true, data: JSON.parse(raw) };
  } catch (err) {
    return { exists: true, data: null, error: `Failed to parse JSON: ${err.message}` };
  }
}

function parseJUnitSummary(content) {
  const suiteMatch = content.match(/<testsuite[^>]*>/i);
  if (!suiteMatch) {
    return { tests: 0, failures: 0, errors: 0 };
  }
  const attrs = suiteMatch[0];
  const extract = (name) => {
    const m = attrs.match(new RegExp(`${name}="(\d+)"`, 'i'));
    return m ? Number(m[1]) : 0;
  };
  return {
    tests: extract('tests'),
    failures: extract('failures'),
    errors: extract('errors'),
  };
}

function loadJUnitSummary(filepath) {
  if (!fileExists(filepath)) {
    return { exists: false, tests: 0, failures: 0, errors: 0, error: `File not found: ${filepath}` };
  }
  try {
    const content = fs.readFileSync(filepath, 'utf8');
    const summary = parseJUnitSummary(content);
    return { exists: true, ...summary };
  } catch (err) {
    return { exists: true, tests: 0, failures: 0, errors: 0, error: `Failed to read JUnit XML: ${err.message}` };
  }
}

function evaluateChecklist({ container, containerPath, junitSummary, junitPath }) {
  const results = [];
  const pushResult = (id, description, passed, reason) => {
    results.push({ id, description, passed, reason: reason || '' });
  };

  const containerExists = Boolean(container && container.exists && container.data);
  pushResult(
    'I01',
    'Container JSON is present and readable',
    containerExists,
    containerExists ? '' : container?.error || `Missing container at ${containerPath}`
  );

  const videos = containerExists ? container.data.videos || [] : [];
  const hasVideos = videos.length > 0;
  pushResult(
    'G05',
    'At least one MP4 is listed in container output',
    containerExists && hasVideos,
    containerExists
      ? hasVideos
        ? ''
        : 'No videos listed in container.json'
      : 'container.json unavailable'
  );

  const referenceDuration = containerExists ? container.data.referenceDuration : undefined;
  const firstDuration = hasVideos ? videos[0].duration : undefined;
  const durationPass =
    containerExists &&
    typeof referenceDuration === 'number' &&
    typeof firstDuration === 'number' &&
    Math.abs(firstDuration - referenceDuration) <= 1;
  pushResult(
    'G06',
    'Video duration matches reference within 1s tolerance',
    durationPass,
    (() => {
      if (!containerExists) return 'container.json unavailable';
      if (typeof referenceDuration !== 'number') return 'referenceDuration missing from container.json';
      if (typeof firstDuration !== 'number') return 'video duration missing';
      return `Duration mismatch: expected ~${referenceDuration}s got ${firstDuration}s`;
    })()
  );

  const captions = containerExists ? container.data.captions || [] : [];
  const captionsPresent = captions.length > 0;
  pushResult(
    'I02',
    'Caption tracks are present',
    containerExists && captionsPresent,
    containerExists
      ? captionsPresent
        ? ''
        : 'No captions listed in container.json'
      : 'container.json unavailable'
  );

  const manifestPresent = containerExists && (container.data.manifest || container.data.checksums);
  pushResult(
    'I03',
    'Manifest or checksums generated',
    Boolean(manifestPresent),
    manifestPresent ? '' : containerExists ? 'Manifest/checksums missing' : 'container.json unavailable'
  );

  const junitExists = junitSummary?.exists;
  pushResult(
    'J01',
    'Golden JUnit XML exists',
    Boolean(junitExists),
    junitExists ? '' : junitSummary?.error || `Missing JUnit report at ${junitPath}`
  );

  const junitHasTests = junitExists && junitSummary.tests > 0;
  pushResult(
    'J02',
    'Golden comparison executed (tests > 0)',
    junitHasTests,
    junitExists ? (junitHasTests ? '' : 'No tests recorded in JUnit XML') : 'JUnit XML unavailable'
  );

  const junitAllPass = junitHasTests && junitSummary.failures === 0 && junitSummary.errors === 0;
  pushResult(
    'J03',
    'Golden comparison has zero failures/errors',
    junitAllPass,
    junitHasTests
      ? junitAllPass
        ? ''
        : `Failures: ${junitSummary.failures}, Errors: ${junitSummary.errors}`
      : junitExists
        ? 'JUnit XML recorded no tests'
        : 'JUnit XML unavailable'
  );

  return results;
}

function formatTable(results) {
  const lines = results.map((r) => {
    const status = r.passed ? 'PASS' : 'FAIL';
    return `${r.id}: ${status}${r.reason ? ` - ${r.reason}` : ''}`;
  });
  return lines.join('\n');
}

function buildJsonSummary(results) {
  const summary = { results: {}, stats: { passed: 0, failed: 0, total: results.length } };
  for (const r of results) {
    summary.results[r.id] = {
      passed: r.passed,
      description: r.description,
      reason: r.reason,
    };
    if (r.passed) summary.stats.passed += 1; else summary.stats.failed += 1;
  }
  return summary;
}

function xmlEscape(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function generateJUnitXml(results) {
  const failures = results.filter((r) => !r.passed).length;
  const tests = results.length;
  const suiteAttrs = `name="mobius-checklist" tests="${tests}" failures="${failures}" errors="0" time="0"`;
  const cases = results
    .map((r) => {
      const reason = r.reason ? xmlEscape(r.reason) : '';
      if (r.passed) {
        return `    <testcase classname="checklist" name="${xmlEscape(r.id)}" time="0"/>`;
      }
      return [
        `    <testcase classname="checklist" name="${xmlEscape(r.id)}" time="0">`,
        `      <failure message="${reason || 'Checklist item failed'}"></failure>`,
        '    </testcase>',
      ].join('\n');
    })
    .join('\n');
  return [`<testsuite ${suiteAttrs}>`, cases, '</testsuite>', ''].join('\n');
}

function printUsage() {
  console.log(`Usage: node scripts/validate_mobius_checklist.cjs --game <name> [--os <os>] [--container <path>] [--golden-junit <path>] [--junit-out <path>] [--format text|json]`);
  console.log('\nExamples:');
  console.log('  npm run checklist:validate -- --game sushi-go --os windows');
  console.log('  npm run checklist:validate -- --game sushi-go --container exports/sushi-go/windows/container.json --junit-out out/junit/checklist.xml');
}

function runCLI() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.h || !args.game) {
    printUsage();
    process.exit(1);
  }

  const game = args.game;
  const os = args.os || 'windows';
  const containerPath = args.container || path.join('exports', game, os, 'container.json');
  const junitPath = args['golden-junit'] || path.join('exports', game, os, 'golden.junit.xml');
  const format = args.format || 'text';

  const container = loadJson(containerPath);
  const junitSummary = loadJUnitSummary(junitPath);

  const results = evaluateChecklist({ container, containerPath, junitSummary, junitPath });
  const summary = buildJsonSummary(results);

  if (format === 'json') {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log(formatTable(results));
  }

  if (args['junit-out']) {
    const junitXml = generateJUnitXml(results);
    fs.mkdirSync(path.dirname(args['junit-out']), { recursive: true });
    fs.writeFileSync(args['junit-out'], junitXml, 'utf8');
  }

  process.exit(summary.stats.failed > 0 ? 1 : 0);
}

if (require.main === module) {
  runCLI();
}

module.exports = {
  parseArgs,
  loadJson,
  loadJUnitSummary,
  evaluateChecklist,
  buildJsonSummary,
  generateJUnitXml,
  parseJUnitSummary,
  formatTable,
};
