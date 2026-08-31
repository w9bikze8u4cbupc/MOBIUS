#!/usr/bin/env node
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PDFDocument } from 'pdf-lib';

const DEFAULT_ROOT = path.resolve(process.cwd(), 'data', 'rulebook-library');
const schemaVersion = 1;

function usage() {
  return `Usage:
  node scripts/rulebook-library.mjs init [--root <absolute-or-relative-path>]
  node scripts/rulebook-library.mjs import-ranking --csv <ranking.csv> [--root <path>] [--limit <n>]
  node scripts/rulebook-library.mjs status [--root <path>]

This utility never downloads a rulebook. It creates and manages a local, resumable queue.
Only add public rulebook URLs from an official publisher or rights holder after validating the source.`;
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = {};
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith('--')) throw new Error(`Unexpected argument: ${token}`);
    const key = token.slice(2);
    const value = rest[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for --${key}`);
    options[key] = value;
    index += 1;
  }
  return { command, options };
}

function resolveRoot(value) {
  return path.resolve(value || DEFAULT_ROOT);
}

function libraryFiles(root) {
  return {
    root,
    queue: path.join(root, 'manifest', 'rulebook-queue.json'),
    config: path.join(root, 'manifest', 'library-config.json'),
    log: path.join(root, 'logs', 'collection-events.jsonl'),
    rules: path.join(root, 'rules'),
    manifest: path.join(root, 'manifest'),
    logs: path.join(root, 'logs'),
    quarantined: path.join(root, 'quarantine'),
  };
}

async function exists(file) {
  try { await fs.access(file); return true; } catch { return false; }
}

export async function computePdfIdentity(filePath) {
  const resolved = path.resolve(filePath);
  const [buffer, stat] = await Promise.all([fs.readFile(resolved), fs.stat(resolved)]);
  let pageCount = null;
  try {
    pageCount = (await PDFDocument.load(buffer, { ignoreEncryption: true })).getPageCount();
  } catch { /* Keep identity usable for malformed/quarantined sources. */ }
  return {
    path: resolved,
    filename: path.basename(resolved),
    bytes: stat.size,
    sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
    pageCount,
  };
}

async function walk(directory, output = []) {
  if (!(await exists(directory))) return output;
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const candidate = path.join(directory, entry.name);
    if (entry.isDirectory()) await walk(candidate, output);
    else if (entry.isFile() && path.extname(entry.name).toLowerCase() === '.pdf') output.push(candidate);
  }
  return output;
}

export async function discoverRulebooks(roots = []) {
  const files = (await Promise.all(roots.map((root) => walk(path.resolve(root))))).flat();
  const identities = await Promise.all(files.map(computePdfIdentity));
  return identities.sort((left, right) => left.bytes - right.bytes || left.path.localeCompare(right.path));
}

export async function findProcessedBySha(dataRoot, sha256) {
  const root = path.resolve(dataRoot);
  if (!(await exists(root))) return [];
  const matches = [];
  for (const entry of await fs.readdir(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const descriptorPath = path.join(root, entry.name, 'source', 'source.json');
    if (!(await exists(descriptorPath))) continue;
    try {
      const descriptor = JSON.parse(await fs.readFile(descriptorPath, 'utf8'));
      if (descriptor?.sha256 === sha256) matches.push({ ...descriptor, descriptorPath });
    } catch { /* Ignore incomplete runtime records during discovery. */ }
  }
  return matches;
}

async function initialize(root) {
  const files = libraryFiles(root);
  await Promise.all([files.rules, files.manifest, files.logs, files.quarantined].map((directory) => fs.mkdir(directory, { recursive: true })));
  if (!(await exists(files.config))) {
    await fs.writeFile(files.config, `${JSON.stringify({
      schemaVersion,
      createdAt: new Date().toISOString(),
      libraryRoot: root,
      policy: {
        downloadMode: 'disabled_until_space_and_source_validation',
        permittedSource: 'public direct PDF published by an official publisher or verified rights holder',
        prohibitedSources: ['BoardGameGeek file pages', 'login-gated sources', 'circumvention or bypass of access controls'],
        preferredLanguage: 'en',
        allowOtherLanguageFallback: true,
      },
    }, null, 2)}\n`);
  }
  if (!(await exists(files.queue))) {
    await fs.writeFile(files.queue, `${JSON.stringify({ schemaVersion, updatedAt: new Date().toISOString(), items: [] }, null, 2)}\n`);
  }
  if (!(await exists(files.log))) await fs.writeFile(files.log, '');
  return files;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') { value += '"'; index += 1; continue; }
    if (char === '"') { quoted = !quoted; continue; }
    if (char === ',' && !quoted) { row.push(value); value = ''; continue; }
    if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(value);
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = []; value = ''; continue;
    }
    value += char;
  }
  row.push(value);
  if (row.some((cell) => cell.trim())) rows.push(row);
  return rows;
}

function findHeader(headers, candidates) {
  const normalized = headers.map((header) => String(header).trim().toLowerCase().replace(/[^a-z0-9]/g, ''));
  return normalized.findIndex((header) => candidates.includes(header));
}

async function importRanking(root, csvPath, limit) {
  const files = await initialize(root);
  const csv = await fs.readFile(path.resolve(csvPath), 'utf8');
  const rows = parseCsv(csv);
  if (rows.length < 2) throw new Error('The ranking CSV does not contain a header and at least one game.');
  const headers = rows[0];
  const rankIndex = findHeader(headers, ['rank', 'bgg_rank', 'bggrank']);
  const idIndex = findHeader(headers, ['id', 'bggid', 'objectid']);
  const nameIndex = findHeader(headers, ['name', 'title', 'objectname']);
  if (rankIndex < 0 || idIndex < 0 || nameIndex < 0) throw new Error(`Ranking CSV needs rank, id, and name columns. Found: ${headers.join(', ')}`);
  const numericLimit = Math.max(1, Math.min(Number(limit || 2000), 2000));
  const byRank = rows.slice(1).map((row) => ({
    rank: Number.parseInt(row[rankIndex], 10),
    bggId: String(row[idIndex] || '').trim(),
    title: String(row[nameIndex] || '').trim(),
  })).filter((item) => Number.isInteger(item.rank) && item.rank > 0 && item.bggId && item.title)
    .sort((left, right) => left.rank - right.rank)
    .slice(0, numericLimit);
  const existing = JSON.parse(await fs.readFile(files.queue, 'utf8'));
  const existingById = new Map((existing.items || []).map((item) => [item.bggId, item]));
  for (const item of byRank) {
    if (!existingById.has(item.bggId)) {
      existingById.set(item.bggId, {
        ...item,
        status: 'pending_source',
        preferredLanguage: 'en',
        allowOtherLanguageFallback: true,
        sourceUrl: null,
        sourcePublisher: null,
        file: null,
        sha256: null,
        attempts: [],
      });
    }
  }
  const items = [...existingById.values()].sort((left, right) => left.rank - right.rank).slice(0, numericLimit);
  await fs.writeFile(files.queue, `${JSON.stringify({ schemaVersion, updatedAt: new Date().toISOString(), rankingSource: path.resolve(csvPath), items }, null, 2)}\n`);
  await fs.appendFile(files.log, `${JSON.stringify({ at: new Date().toISOString(), event: 'ranking_imported', count: byRank.length, rankingSource: path.resolve(csvPath) })}\n`);
  console.log(JSON.stringify({ root, imported: byRank.length, queued: items.length, queue: files.queue }, null, 2));
}

async function status(root) {
  const files = await initialize(root);
  const queue = JSON.parse(await fs.readFile(files.queue, 'utf8'));
  const counts = (queue.items || []).reduce((result, item) => {
    result[item.status] = (result[item.status] || 0) + 1;
    return result;
  }, {});
  console.log(JSON.stringify({
    root,
    policy: 'No downloads are enabled until a local disk-space check and an official-source review are complete.',
    total: queue.items?.length || 0,
    byStatus: counts,
    paths: { queue: files.queue, rules: files.rules, log: files.log },
  }, null, 2));
}

async function main() {
  const { command, options } = parseArgs(process.argv.slice(2));
  if (!command || command === '--help' || command === 'help') { console.log(usage()); return; }
  const root = resolveRoot(options.root);
  if (command === 'init') { const files = await initialize(root); console.log(JSON.stringify({ initialized: root, paths: files }, null, 2)); return; }
  if (command === 'import-ranking') {
    if (!options.csv) throw new Error('import-ranking requires --csv <path>.');
    await importRanking(root, options.csv, options.limit);
    return;
  }
  if (command === 'status') { await status(root); return; }
  throw new Error(`Unknown command: ${command}`);
}

if (pathToFileURL(path.resolve(process.argv[1] || '')).href === import.meta.url) {
  main().catch((error) => { console.error(`rulebook-library: ${error.message}`); process.exitCode = 1; });
}
