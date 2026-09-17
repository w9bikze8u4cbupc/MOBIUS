import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { buildRecovery, writeRecovery } = require('../src/services/visualEvidenceRecovery.cjs');

function argumentsMap(argv = process.argv.slice(2)) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (!argv[index].startsWith('--')) continue;
    values[argv[index].slice(2)] = argv[index + 1];
    index += 1;
  }
  return values;
}

const args = argumentsMap();
if (!args['project-id'] || !args['source-sha'] || !args.input || !args.output) {
  throw new Error('Usage: recover-visual-evidence --project-id <id> --source-sha <sha> --input <report.json> --output <recovery.json>');
}
const recovery = buildRecovery({ projectId: args['project-id'], sourceSha256: args['source-sha'], inputPath: args.input });
const outputPath = writeRecovery({ outputPath: args.output, recovery });
process.stdout.write(`${JSON.stringify({ contract: recovery.contract, outputPath: path.resolve(outputPath), assets: recovery.reports[0].assets.length })}\n`);
