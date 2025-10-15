#!/usr/bin/env node
import { ingestPdf } from '../src/ingest/pdf.js';
import { fetchBggMetadata } from '../src/ingest/bgg.js';
import { generateStoryboard } from '../src/ingest/storyboard.js';
import fs from 'fs';
import minimist from 'minimist';

async function main() {
  const argv = minimist(process.argv.slice(2));
  const pdf = argv.pdf || argv._[0];
  const bgg = argv.bgg || argv._[1];
  const out = argv.out || 'storyboard.json';
  if (!pdf) {
    console.error('Usage: ingest-sample.js --pdf path/to/rulebook.pdf [--bgg BGG_URL_OR_ID] [--out file.json]');
    process.exit(2);
  }
  const pdfRes = await ingestPdf(pdf);
  let bggMeta = null;
  if (bgg) {
    try { bggMeta = await fetchBggMetadata(bgg); } catch (err) { console.error('BGG fetch failed:', err.message); }
  }
  const sb = generateStoryboard({ parsedPages: pdfRes.parsedPages, bgg: bggMeta });
  fs.writeFileSync(out, JSON.stringify(sb, null, 2), 'utf8');
  console.log('Storyboard written to', out);
}

main().catch(e => { console.error(e); process.exit(1); });