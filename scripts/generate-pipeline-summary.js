#!/usr/bin/env node

import { spawnSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';

function getGitInfo() {
  try {
    const sha = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
    return { sha, branch };
  } catch (error) {
    return { sha: 'unknown', branch: 'unknown' };
  }
}

function getNodeVersion() {
  return process.version;
}

function getPopplerVersion() {
  try {
    const result = spawnSync('pdftoppm', ['-v'], { encoding: 'utf8' });
    if (result.stderr) {
      const match = result.stderr.match(/poppler version (\d+\.\d+\.\d+)/i);
      if (match) {
        return match[1];
      }
    }
    return 'unknown';
  } catch (error) {
    return 'not found';
  }
}

function checkOutputDirWritable(outputDir) {
  try {
    const testFile = `${outputDir}/.write_test`;
    execSync(`echo test > "${testFile}"`);
    execSync(`del "${testFile}"`);
    return true;
  } catch (error) {
    return false;
  }
}

function checkApiKeyPresent() {
  return !!process.env.ELEVENLABS_API_KEY;
}

function generatePipelineSummary(artifacts, options = {}) {
  const {
    outputDir = './out',
    workDir = './work'
  } = options;

  const summary = {
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    git: getGitInfo(),
    nodeVersion: getNodeVersion(),
    popplerVersion: getPopplerVersion(),
    system: {
      platform: process.platform,
      arch: process.arch
    },
    paths: {
      outputDir,
      workDir
    },
    permissions: {
      outputDirWritable: checkOutputDirWritable(outputDir),
      elevenLabsApiKeyPresent: checkApiKeyPresent()
    },
    artifacts: artifacts || []
  };

  console.log(JSON.stringify(summary, null, 2));
  return summary;
}

// If called directly, process command line arguments
if (import.meta.url === `file://${process.argv[1]}`) {
  // For now, just generate a basic summary
  generatePipelineSummary();
}

export { generatePipelineSummary };