#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        args[key] = next;
        i++;
      } else {
        args[key] = true;
      }
    }
  }

  if (!args.dir) {
    throw new Error('Missing required argument --dir <snapshotDir>');
  }

  if (!args.junit) {
    args.junit = path.join('out', 'junit', 'golden-snapshot-contract.junit.xml');
  }

  return args;
}

function ensureDirSync(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function writeJUnit(junitPath, cases) {
  if (!junitPath) return;
  ensureDirSync(path.dirname(junitPath));

  const tests = cases.length;
  const failures = cases.filter((c) => c.status === 'failed').length;
  const casesXml = cases
    .map((c) => {
      if (c.status === 'failed') {
        return `    <testcase name="${escapeXml(c.name)}"><failure message="${escapeXml(
          c.message || 'Failed'
        )}"/></testcase>`;
      }
      return `    <testcase name="${escapeXml(c.name)}"/>`;
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<testsuite name="golden-snapshot-contract" tests="${tests}" failures="${failures}">\n${casesXml}\n</testsuite>`;
  fs.writeFileSync(junitPath, xml, 'utf8');
}

function addCase(cases, name, passed, message) {
  cases.push({
    name,
    status: passed ? 'passed' : 'failed',
    message: passed ? undefined : message,
  });
}

function directoryHasFiles(dir) {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    return entries.some((entry) => entry.isFile() || entry.isDirectory());
  } catch {
    return false;
  }
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv);
  } catch (err) {
    console.error(`[golden-snapshot-check] ${err.message}`);
    process.exit(1);
  }

  const snapshotDir = path.resolve(args.dir);
  const cases = [];
  let hasFailures = false;

  const dirExists = fs.existsSync(snapshotDir) && fs.statSync(snapshotDir).isDirectory();
  addCase(cases, 'snapshot-dir-exists', dirExists, `Snapshot directory missing: ${snapshotDir}`);
  if (!dirExists) {
    writeJUnit(args.junit, cases);
    process.exit(1);
  }

  const manifestPath = path.join(snapshotDir, 'snapshot_manifest.json');
  const manifestExists = fs.existsSync(manifestPath);
  addCase(cases, 'manifest-exists', manifestExists, 'snapshot_manifest.json not found');

  let manifest = null;
  if (manifestExists) {
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      addCase(cases, 'manifest-parses', true);
    } catch (err) {
      addCase(cases, 'manifest-parses', false, `Failed to parse manifest: ${err.message}`);
    }
  }

  if (manifest && manifest.project) {
    addCase(
      cases,
      'manifest-has-game',
      Boolean(manifest.project.game),
      'snapshot_manifest.project.game missing'
    );
    addCase(cases, 'manifest-has-os', Boolean(manifest.project.os), 'snapshot_manifest.project.os missing');
    addCase(
      cases,
      'manifest-has-mode',
      Boolean(manifest.project.mode),
      'snapshot_manifest.project.mode missing'
    );
  }

  const requiredFiles = ['arc.json', 'container.json'];
  for (const file of requiredFiles) {
    const p = path.join(snapshotDir, file);
    const exists = fs.existsSync(p);
    addCase(cases, `${file}-exists`, exists, `${file} missing in snapshot`);
  }

  const framesDir = path.join(snapshotDir, 'frames');
  const framesExist = fs.existsSync(framesDir) && fs.statSync(framesDir).isDirectory();
  addCase(cases, 'frames-dir-exists', framesExist, 'frames/ directory missing');
  if (framesExist) {
    addCase(cases, 'frames-dir-nonempty', directoryHasFiles(framesDir), 'frames/ directory is empty');
  }

  const logsDir = path.join(snapshotDir, 'logs');
  if (fs.existsSync(logsDir)) {
    addCase(cases, 'logs-dir-available', true);
  }

  hasFailures = cases.some((c) => c.status === 'failed');
  writeJUnit(args.junit, cases);

  if (hasFailures) {
    console.error('[golden-snapshot-check] Snapshot integrity failed');
    process.exit(1);
  }

  console.log('[golden-snapshot-check] Snapshot integrity passed');
}

if (require.main === module) {
  main();
}
