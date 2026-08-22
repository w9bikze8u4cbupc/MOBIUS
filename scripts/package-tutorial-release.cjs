#!/usr/bin/env node

const path = require('path');
const { packageRenderJob } = require('../src/api/packaging.js');

function requiredArg(name) {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0 || !process.argv[index + 1]) throw new Error(`Missing required argument: --${name}`);
  return process.argv[index + 1];
}

async function main() {
  const outputDir = path.resolve(requiredArg('output-dir'));
  const jobId = process.argv.includes('--job-id')
    ? requiredArg('job-id')
    : path.basename(outputDir);
  const language = process.argv.includes('--language') ? requiredArg('language') : 'fr-CA';

  const result = await packageRenderJob({
    jobId,
    outputDir,
    jobConfig: {
      language,
      timing: {},
      localization: {
        primaryLanguage: language,
        subtitleCodes: { [language]: language },
      },
    },
  });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(`[package-tutorial-release] ${error.message}`);
  process.exit(1);
});
