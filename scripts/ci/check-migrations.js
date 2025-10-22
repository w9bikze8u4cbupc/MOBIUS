const fs = require('fs');
const path = require('path');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJson(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(content);
}

function collectManifests(stagingRoot) {
  if (!fs.existsSync(stagingRoot)) {
    throw new Error(`Staging directory not found: ${stagingRoot}`);
  }

  const manifests = [];
  const entries = fs.readdirSync(stagingRoot, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const manifestPath = path.join(stagingRoot, entry.name, 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
      continue;
    }
    const manifest = readJson(manifestPath);
    manifests.push({
      id: entry.name,
      path: manifestPath,
      manifest,
    });
  }

  if (manifests.length === 0) {
    throw new Error('No staged sample project manifests were found.');
  }

  return manifests;
}

function validateManifest(manifest, manifestPath) {
  const errors = [];
  if (typeof manifest.projectId !== 'string' || manifest.projectId.trim() === '') {
    errors.push('projectId must be a non-empty string');
  }
  if (typeof manifest.title !== 'string' || manifest.title.trim() === '') {
    errors.push('title must be a non-empty string');
  }
  if (!Array.isArray(manifest.assets) || manifest.assets.length === 0) {
    errors.push('assets must include at least one entry');
  }
  if (!manifest.audioQc || typeof manifest.audioQc !== 'object') {
    errors.push('audioQc section is required');
  }
  if (errors.length > 0) {
    throw new Error(`Manifest validation failed for ${manifestPath}: ${errors.join(', ')}`);
  }
}

function buildReport(manifests) {
  return {
    stage: 'migrations',
    timestamp: new Date().toISOString(),
    manifests: manifests.map(({ id, path: manifestPath, manifest }) => ({
      id,
      manifestPath: path.relative(process.cwd(), manifestPath),
      projectId: manifest.projectId,
      title: manifest.title,
      preset: manifest.audioQc?.preset || 'unknown',
      assetCount: manifest.assets.length,
    })),
    notes: 'Sample projects are staged for the upcoming end-to-end validation pass.',
  };
}

function buildMarkdown(report) {
  const lines = [];
  lines.push('# Migration Gate Evidence');
  lines.push('');
  lines.push(`- Timestamp: ${report.timestamp}`);
  lines.push(`- Sample manifests: ${report.manifests.length}`);
  lines.push('');
  lines.push('| Project | Title | Preset | Assets |');
  lines.push('| --- | --- | --- | ---: |');
  for (const manifest of report.manifests) {
    lines.push(`| ${manifest.projectId} | ${manifest.title} | ${manifest.preset} | ${manifest.assetCount} |`);
  }
  lines.push('');
  lines.push(report.notes);
  lines.push('');
  return lines.join('\n');
}

function main() {
  const stagingRoot = path.join(__dirname, '..', '..', 'tests', 'sample_projects');
  const manifests = collectManifests(stagingRoot);
  manifests.forEach(({ manifest, path: manifestPath }) => validateManifest(manifest, manifestPath));

  const report = buildReport(manifests);
  const outDir = path.join(process.cwd(), 'ci-artifacts', 'section-c');
  ensureDir(outDir);

  fs.writeFileSync(path.join(outDir, 'migrations-report.json'), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(outDir, 'migrations-report.md'), buildMarkdown(report));
  console.log(`Staged ${report.manifests.length} sample project manifests.`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

module.exports = { collectManifests, validateManifest, buildReport, buildMarkdown };
