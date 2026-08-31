#!/usr/bin/env node
import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { analyzeProductionVideo, buildExternalReviewSummary } from '../src/services/twelveLabsVideoReview.js';

function argsToObject(argv = process.argv.slice(2)) {
  const values = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith('--')) continue;
    const key = argv[i].slice(2);
    values[key] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
  }
  return values;
}

const args = argsToObject();
const videoPath = path.resolve(String(args.video || args.input || ''));
const review = await analyzeProductionVideo({
  videoPath,
  cachePath: args.cache ? path.resolve(String(args.cache)) : undefined,
  model: args.model,
  force: args.force === true,
});
if (args.output) {
  await fs.mkdir(path.dirname(path.resolve(String(args.output))), { recursive: true });
  await fs.writeFile(path.resolve(String(args.output)), `${JSON.stringify(review, null, 2)}\n`, 'utf8');
}
console.log(JSON.stringify(review.status === 'complete' ? review : buildExternalReviewSummary(review), null, 2));
if (review.status === 'unavailable' && review.classification === 'not_configured') process.exitCode = 2;
