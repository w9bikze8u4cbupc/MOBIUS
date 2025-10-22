const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function parseNpmPackOutput(output) {
  const trimmed = output.trim();
  if (!trimmed) {
    return null;
  }

  try {
    return JSON.parse(trimmed);
  } catch (error) {
    // npm may emit multiple JSON payloads separated by newlines
    const lines = trimmed
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean);
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        if (parsed) return parsed;
      } catch (_) {
        // Ignore
      }
    }
  }
  return null;
}

function buildMarkdown(report) {
  const lines = [];
  lines.push('# Package Gate Evidence');
  lines.push('');
  lines.push(`- Timestamp: ${report.timestamp}`);
  lines.push(`- Files bundled: ${report.files.length}`);
  lines.push(`- Tarball: ${report.tarball}`);
  lines.push('');
  lines.push('| File | Size (bytes) |');
  lines.push('| --- | ---: |');
  report.files.slice(0, 10).forEach(file => {
    lines.push(`| ${file.path} | ${file.size} |`);
  });
  if (report.files.length > 10) {
    lines.push(`| … | … |`);
  }
  lines.push('');
  lines.push('Report truncated to the first 10 files for readability.');
  lines.push('');
  return lines.join('\n');
}

function main() {
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const result = spawnSync(npmCmd, ['pack', '--json', '--dry-run'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`npm pack failed with exit code ${result.status}`);
  }

  const parsed = parseNpmPackOutput(result.stdout);
  if (!parsed || !Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('Unable to parse npm pack output.');
  }

  const packInfo = parsed[0];
  const files = (packInfo.files || []).map(file => ({
    path: file.path,
    size: file.size,
  }));

  const report = {
    stage: 'package',
    timestamp: new Date().toISOString(),
    tarball: packInfo.filename,
    files,
  };

  const outDir = path.join(process.cwd(), 'ci-artifacts', 'section-d');
  ensureDir(outDir);
  fs.writeFileSync(path.join(outDir, 'package-report.json'), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(outDir, 'package-report.md'), buildMarkdown(report));
  console.log(`npm pack inspected ${files.length} files`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

module.exports = { parseNpmPackOutput, buildMarkdown };
