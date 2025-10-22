const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function runCommand(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(' ')} (exit code ${result.status})`);
  }
  return result;
}

function writeReport(status, durationMs, notes) {
  const outDir = path.join(process.cwd(), 'ci-artifacts', 'section-c');
  ensureDir(outDir);
  const report = {
    stage: 'harness',
    status,
    timestamp: new Date().toISOString(),
    durationMs,
    notes,
  };
  fs.writeFileSync(path.join(outDir, 'harness-report.json'), JSON.stringify(report, null, 2));
  const markdown = [
    '# Harness Gate Evidence',
    '',
    `- Status: ${status.toUpperCase()}`,
    `- Duration: ${(durationMs / 1000).toFixed(2)}s`,
    `- Notes: ${notes}`,
    '',
  ].join('\n');
  fs.writeFileSync(path.join(outDir, 'harness-report.md'), markdown);
}

function main() {
  const start = Date.now();
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  runCommand(npmCmd, ['test', '--', '--ci', '--reporters=default']);
  const durationMs = Date.now() - start;
  writeReport('passed', durationMs, 'All Jest harness checks succeeded.');
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    try {
      writeReport('failed', 0, message);
    } catch (writeError) {
      console.error('Failed to write harness evidence:', writeError);
    }
    process.exit(1);
  }
}

module.exports = { runCommand, writeReport };
