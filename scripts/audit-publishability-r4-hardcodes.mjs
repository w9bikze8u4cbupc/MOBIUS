#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.cwd());
const outDir = path.join(root, 'out', 'publishability-r4', 'architecture');
const roots = ['scripts', 'src', 'config', 'tests'];
const patterns = [
  /7-wonders-duel/gi,
  /7 Wonders Duel/g,
  /\bis7wd\b/g,
  /\bp\d+_img\d+_xref\d+\b/g,
  /\br[23]-[a-z0-9-]+\b/gi,
  /publishability-r[23]/gi,
];

function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (['node_modules', '.git', 'build'].includes(entry.name)) return [];
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(file) : [file];
  });
}

function classification(file, line, match) {
  const rel = path.relative(root, file).replace(/\\/g, '/');
  if (/^tests\/(fixtures|services|storyboard)\//.test(rel)) return 'LEGITIMATE_FIXTURE';
  if (/^config\/projects\//.test(rel)) return 'PROJECT_DATA';
  if (rel === 'src/assets/games/presentation-box-art-manifest.json') return 'PROJECT_DATA';
  if (rel === 'scripts/assemble-full-tutorial-r1.mjs') return 'TEMPORARY_MIGRATION';
  if (/^scripts\/(build-7wd|render-7wd|audit-7wd|build-publishability|adjudicate-publishability|rebuild-presentation)/.test(rel)) return 'TEMPORARY_MIGRATION';
  if (/^scripts\/(qa|finalize|build-full-tutorial-closeout|generate-(gameplay|scoring))/.test(rel) && /7-wonders-duel/i.test(line)) return 'LEGITIMATE_FIXTURE';
  if (/assemble-full-tutorial-r1/.test(rel) && (/xref|\br[23]-|is7wd|7-wonders-duel|7 Wonders Duel/i.test(`${match} ${line}`))) return 'BENCHMARK_HACK';
  if (/^src\//.test(rel) && /7-wonders-duel|7 Wonders Duel|xref/i.test(`${match} ${line}`)) return 'BENCHMARK_HACK';
  return 'TEMPORARY_MIGRATION';
}

const occurrences = [];
for (const folder of roots) {
  for (const file of walk(path.join(root, folder))) {
    if (!/\.(?:c?js|mjs|json|md|py)$/.test(file)) continue;
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
    lines.forEach((line, index) => {
      for (const pattern of patterns) {
        pattern.lastIndex = 0;
        const found = [...line.matchAll(pattern)];
        for (const match of found) {
          occurrences.push({
            file: path.relative(root, file).replace(/\\/g, '/'),
            line: index + 1,
            match: match[0],
            classification: classification(file, line, match[0]),
            excerpt: line.trim().slice(0, 280),
          });
        }
      }
    });
  }
}

const counts = occurrences.reduce((result, item) => {
  result[item.classification] = (result[item.classification] || 0) + 1;
  return result;
}, {});
const audit = {
  schema_version: 'mobius-publishability-r4-hardcode-audit-v1',
  generatedAt: new Date().toISOString(),
  branch: 'fix/terraforming-mars-quality-regression-restore',
  scope: roots,
  counts,
  benchmarkHackCount: counts.BENCHMARK_HACK || 0,
  occurrences,
  migrationTarget: {
    projectFacts: 'config/projects/<projectId>/rulebook-knowledge.v1.json',
    visualMappings: 'config/projects/<projectId>/visual-evidence.v1.json',
    genericResolver: 'src/services/instructionalVisualResolver.cjs',
  },
};

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'hardcode-audit.json'), `${JSON.stringify(audit, null, 2)}\n`);
const grouped = Object.entries(counts).sort(([a], [b]) => a.localeCompare(b));
const markdown = [
  '# MOBIUS publishability R4 — benchmark hardcode audit',
  '',
  `Generated: ${audit.generatedAt}`,
  '',
  ...grouped.map(([key, value]) => `- ${key}: ${value}`),
  '',
  '## BENCHMARK_HACK occurrences',
  '',
  ...occurrences.filter((item) => item.classification === 'BENCHMARK_HACK').map((item) => `- ${item.file}:${item.line} — \`${item.match}\``),
  '',
  'Valid project-specific facts and source mappings must migrate into canonical project data. Generic services retain contracts and scoring logic only.',
  '',
].join('\n');
fs.writeFileSync(path.join(outDir, 'hardcode-audit.md'), markdown);
console.log(JSON.stringify({ output: outDir, counts, benchmarkHackCount: audit.benchmarkHackCount }, null, 2));
