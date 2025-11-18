#!/usr/bin/env node

/**
 * MOBIUS - Promote golden snapshot into canonical tests/golden baselines
 *
 * Usage:
 *   node scripts/promote_golden_snapshot.cjs \
 *     --game sushi-go \
 *     --os windows \
 *     --mode full \
 *     --snapshot out/golden/sushi-go/windows/full-snapshot \
 *     --target tests/golden/sushi-go/windows \
 *     --dry-run false \
 *     --junit out/junit/golden-promotion-contract.junit.xml
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function parseArgs(argv) {
  const args = {
    dryRun: false,
    junit: 'out/junit/golden-promotion-contract.junit.xml',
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    switch (arg) {
      case '--game':
      case '--os':
      case '--mode':
      case '--snapshot':
      case '--target':
      case '--junit':
        if (!next) throw new Error(`Missing value for ${arg}`);
        args[arg.replace(/^--/, '')] = next;
        i++;
        break;
      case '--dry-run':
        if (next && !next.startsWith('--')) {
          args.dryRun = next === 'true';
          i++;
        } else {
          args.dryRun = true;
        }
        break;
      default:
        // ignore unknown flags
        break;
    }
  }

  const required = ['game', 'os', 'mode', 'snapshot', 'target'];
  for (const key of required) {
    if (!args[key]) throw new Error(`Missing required argument --${key}`);
  }
  return args;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

function runSnapshotCheck(snapshotDir, junitPath) {
  const checkerPath = path.join('scripts', 'check_golden_snapshot.cjs');
  if (!fs.existsSync(checkerPath)) {
    return {
      ok: false,
      message: `Snapshot checker missing: ${checkerPath}`,
    };
  }

  const result = spawnSync(
    'node',
    [
      checkerPath,
      '--dir',
      snapshotDir,
      '--junit',
      junitPath,
    ],
    { encoding: 'utf8' }
  );

  if (result.error) {
    return {
      ok: false,
      message: `Failed to run check_golden_snapshot: ${result.error.message}`,
    };
  }

  const ok = result.status === 0;
  return {
    ok,
    message: ok
      ? 'Snapshot integrity check passed'
      : `Snapshot integrity check failed: ${result.stdout || result.stderr}`,
  };
}

function generateJUnit(junitPath, meta, errors) {
  const haveErrors = errors.length > 0;
  const testName = `golden-promotion-contract (${meta.game}/${meta.os}/${meta.mode})`;
  const classname = 'mobius.goldenPromotion';

  const escaped = (s) =>
    String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');

  const failureText = haveErrors
    ? errors.map((e) => `${e.code}: ${e.message}`).join('\n')
    : '';

  ensureDir(path.dirname(junitPath));
  const lines = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push(
    `<testsuite name="golden-promotion-contract" tests="1" failures="${
      haveErrors ? 1 : 0
    }">`
  );
  lines.push('  <properties>');
  lines.push(
    `    <property name="project.game" value="${escaped(meta.game)}"/>`
  );
  lines.push(
    `    <property name="project.os" value="${escaped(meta.os)}"/>`
  );
  lines.push(
    `    <property name="project.mode" value="${escaped(meta.mode)}"/>`
  );
  if (meta.snapshotDir) {
    lines.push(
      `    <property name="snapshot.dir" value="${escaped(meta.snapshotDir)}"/>`
    );
  }
  if (meta.targetDir) {
    lines.push(
      `    <property name="target.dir" value="${escaped(meta.targetDir)}"/>`
    );
  }
  lines.push(
    `    <property name="dryRun" value="${escaped(String(meta.dryRun))}"/>`
  );
  lines.push('  </properties>');
  lines.push(
    `  <testcase classname="${escaped(classname)}" name="${escaped(
      testName
    )}">`
  );
  if (haveErrors) {
    lines.push(
      '    <failure message="Golden promotion contract failed" type="ValidationError">'
    );
    lines.push(escaped(failureText));
    lines.push('    </failure>');
  }
  lines.push('  </testcase>');
  lines.push('</testsuite>');

  fs.writeFileSync(junitPath, lines.join('\n'), 'utf8');
}

function appendPromotionLog(meta, status, errors) {
  const logDir = path.resolve('out/golden');
  ensureDir(logDir);
  const logPath = path.join(logDir, 'promotions.log');

  const entry = {
    timestamp: new Date().toISOString(),
    game: meta.game,
    os: meta.os,
    mode: meta.mode,
    snapshotDir: meta.snapshotDir,
    targetDir: meta.targetDir,
    dryRun: meta.dryRun,
    status,
    errors,
    git: {},
  };

  // Try to capture git commit hash if available
  try {
    const { execSync } = require('child_process');
    entry.git.commit = execSync('git rev-parse HEAD', {
      encoding: 'utf8',
    }).trim();
    entry.git.branch = execSync('git rev-parse --abbrev-ref HEAD', {
      encoding: 'utf8',
    }).trim();
  } catch {
    // optional
  }

  fs.appendFileSync(logPath, JSON.stringify(entry) + '\n', 'utf8');
}

function copyDirContents(srcDir, destDir) {
  ensureDir(destDir);
  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const src = path.join(srcDir, entry.name);
    const dest = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      copyDirContents(src, dest);
    } else if (entry.isFile()) {
      ensureDir(path.dirname(dest));
      fs.copyFileSync(src, dest);
    }
  }
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv);
  } catch (err) {
    console.error(`[golden-promotion] ${err.message}`);
    process.exit(1);
  }

  const snapshotDir = path.resolve(args.snapshot);
  const targetDir = path.resolve(args.target);
  const dryRun = !!args.dryRun;
  const junitPath = path.resolve(args.junit);

  const errors = [];

  if (!fs.existsSync(snapshotDir) || !fs.statSync(snapshotDir).isDirectory()) {
    errors.push({
      code: 'SNAPSHOT_MISSING',
      message: `Snapshot directory missing or not a directory: ${snapshotDir}`,
    });
  }

  const manifestPath = path.join(snapshotDir, 'snapshot_manifest.json');
  let manifest = {};
  if (!fs.existsSync(manifestPath)) {
    errors.push({
      code: 'MANIFEST_MISSING',
      message: `snapshot_manifest.json missing from ${snapshotDir}`,
    });
  } else {
    try {
      manifest = readJson(manifestPath);
    } catch (err) {
      errors.push({
        code: 'MANIFEST_PARSE_ERROR',
        message: `Failed to parse snapshot_manifest.json: ${err.message}`,
      });
    }
  }

  const project = manifest.project || {};
  const meta = {
    game: args.game,
    os: args.os,
    mode: args.mode,
    snapshotDir,
    targetDir,
    dryRun,
  };

  // Check that manifest project matches CLI
  if (project.game && project.game !== meta.game) {
    errors.push({
      code: 'PROJECT_GAME_MISMATCH',
      message: `CLI game "${meta.game}" does not match snapshot_manifest.project.game "${project.game}"`,
    });
  }
  if (project.os && project.os !== meta.os) {
    errors.push({
      code: 'PROJECT_OS_MISMATCH',
      message: `CLI os "${meta.os}" does not match snapshot_manifest.project.os "${project.os}"`,
    });
  }
  if (project.mode && project.mode !== meta.mode) {
    errors.push({
      code: 'PROJECT_MODE_MISMATCH',
      message: `CLI mode "${meta.mode}" does not match snapshot_manifest.project.mode "${project.mode}"`,
    });
  }

  // Run snapshot integrity check first (unless manifest is already broken)
  if (errors.length === 0) {
    const checkResult = runSnapshotCheck(
      snapshotDir,
      path.join('out/junit', 'golden-snapshot-pre-promotion.junit.xml')
    );
    if (!checkResult.ok) {
      errors.push({
        code: 'SNAPSHOT_INTEGRITY_FAIL',
        message: checkResult.message,
      });
    }
  }

  // Perform promotion if no errors and not dry-run
  if (errors.length === 0 && !dryRun) {
    try {
      // Ensure canonical structure
      const framesSrc = path.join(snapshotDir, 'frames');
      const framesDest = path.join(targetDir, 'frames');
      const arcSrc = path.join(snapshotDir, 'arc.json');
      const containerSrc = path.join(snapshotDir, 'container.json');
      const arcDest = path.join(targetDir, 'arc.json');
      const containerDest = path.join(targetDir, 'container.json');

      if (!fs.existsSync(framesSrc) || !fs.statSync(framesSrc).isDirectory()) {
        errors.push({
          code: 'FRAMES_MISSING',
          message: `Snapshot frames directory missing: ${framesSrc}`,
        });
      } else {
        // Clear existing frames
        if (fs.existsSync(framesDest)) {
          fs.rmSync(framesDest, { recursive: true, force: true });
        }
        copyDirContents(framesSrc, framesDest);
      }

      if (fs.existsSync(arcSrc)) {
        ensureDir(path.dirname(arcDest));
        fs.copyFileSync(arcSrc, arcDest);
      } else {
        errors.push({
          code: 'ARC_MISSING',
          message: `ARC file missing from snapshot: ${arcSrc}`,
        });
      }

      if (fs.existsSync(containerSrc)) {
        ensureDir(path.dirname(containerDest));
        fs.copyFileSync(containerSrc, containerDest);
      } else {
        errors.push({
          code: 'CONTAINER_MISSING',
          message: `container.json missing from snapshot: ${containerSrc}`,
        });
      }
    } catch (err) {
      errors.push({
        code: 'PROMOTION_ERROR',
        message: `Error while promoting snapshot: ${err.message}`,
      });
    }
  }

  // Write JUnit + log
  generateJUnit(junitPath, meta, errors);
  appendPromotionLog(
    meta,
    errors.length === 0 ? 'success' : 'failure',
    errors
  );

  if (errors.length > 0) {
    console.error(
      `[golden-promotion] Promotion failed with ${errors.length} error(s)`
    );
    for (const e of errors) {
      console.error(`  - ${e.code}: ${e.message}`);
    }
    process.exit(1);
  }

  console.log(
    `[golden-promotion] Promotion ${
      dryRun ? 'dry-run' : 'completed'
    } for ${meta.game}/${meta.os}/${meta.mode}`
  );
  process.exit(0);
}

if (require.main === module) {
  main();
}
