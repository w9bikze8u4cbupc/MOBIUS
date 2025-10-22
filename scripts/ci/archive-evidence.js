const fs = require('fs');
const path = require('path');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) {
    return;
  }
  ensureDir(dest);
  fs.cpSync(src, dest, { recursive: true, force: true });
}

function listFiles(root, prefix = '') {
  if (!fs.existsSync(root)) {
    return [];
  }
  const results = [];
  const entries = fs.readdirSync(root, { withFileTypes: true });
  for (const entry of entries) {
    const rel = path.join(prefix, entry.name);
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      results.push(...listFiles(full, rel));
    } else {
      results.push(rel);
    }
  }
  return results;
}

function readJsonReport(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    return null;
  }
}

function gatherReports(dir) {
  const files = listFiles(dir);
  const reports = [];
  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    const parsed = readJsonReport(path.join(dir, file));
    if (parsed) {
      reports.push({ file, summary: parsed });
    }
  }
  return { files, reports };
}

function mergeArtifacts(rootDir, pattern, target) {
  const entries = fs.existsSync(rootDir)
    ? fs.readdirSync(rootDir, { withFileTypes: true })
    : [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const childPath = path.join(rootDir, entry.name);
    if (entry.name === target || entry.name === 'archive') {
      continue;
    }
    const nested = path.join(childPath, target);
    if (fs.existsSync(nested)) {
      copyDir(nested, path.join(rootDir, target));
      continue;
    }
    if (entry.name.startsWith(pattern)) {
      copyDir(childPath, path.join(rootDir, target));
    }
  }
}

function buildMarkdown(summary) {
  const lines = [];
  lines.push('# Section C/D Evidence Summary');
  lines.push('');
  lines.push(`- Generated at: ${summary.generatedAt}`);
  lines.push(`- Section C artifacts: ${summary.sections.c.files.length}`);
  lines.push(`- Section D artifacts: ${summary.sections.d.files.length}`);
  lines.push('');
  lines.push('## Section C Highlights');
  lines.push('');
  summary.sections.c.reports.forEach(report => {
    const stage = report.summary.stage || 'unknown';
    lines.push(`- **${stage}** → ${report.file}`);
  });
  if (summary.sections.c.reports.length === 0) {
    lines.push('- No JSON reports captured.');
  }
  lines.push('');
  lines.push('## Section D Highlights');
  lines.push('');
  summary.sections.d.reports.forEach(report => {
    const stage = report.summary.stage || 'unknown';
    lines.push(`- **${stage}** → ${report.file}`);
  });
  if (summary.sections.d.reports.length === 0) {
    lines.push('- No JSON reports captured.');
  }
  lines.push('');
  return lines.join('\n');
}

function main() {
  const rootDir = path.join(process.cwd(), 'ci-artifacts');
  ensureDir(rootDir);
  ensureDir(path.join(rootDir, 'section-c'));
  ensureDir(path.join(rootDir, 'section-d'));

  mergeArtifacts(rootDir, 'section-c', 'section-c');
  mergeArtifacts(rootDir, 'section-d', 'section-d');

  const sectionC = gatherReports(path.join(rootDir, 'section-c'));
  const sectionD = gatherReports(path.join(rootDir, 'section-d'));

  const summary = {
    generatedAt: new Date().toISOString(),
    sections: {
      c: sectionC,
      d: sectionD,
    },
  };

  const archiveDir = path.join(rootDir, 'archive');
  ensureDir(archiveDir);
  fs.writeFileSync(path.join(archiveDir, 'section-cd-summary.json'), JSON.stringify(summary, null, 2));
  fs.writeFileSync(path.join(archiveDir, 'section-cd-summary.md'), buildMarkdown(summary));
  console.log('Aggregated Section C/D evidence bundles.');
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

module.exports = { mergeArtifacts, gatherReports, buildMarkdown };
