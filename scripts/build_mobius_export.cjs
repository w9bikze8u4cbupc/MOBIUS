#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    const next = argv[i + 1];
    if (key.startsWith('--')) {
      args[key.slice(2)] = next && !next.startsWith('--') ? next : true;
      if (args[key.slice(2)] === next) i++;
    }
  }
  return args;
}

function loadJsonMaybe(p) {
  if (!p) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (err) {
    return null;
  }
}

function ensureDirFor(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function slugify(value) {
  const cleaned = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || 'sample-game';
}

function detectGitCommit() {
  try {
    return execSync('git rev-parse HEAD').toString().trim();
  } catch (err) {
    return 'unknown';
  }
}

function detectBranch() {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD').toString().trim();
  } catch (err) {
    return process.env.GITHUB_REF_NAME || 'unknown';
  }
}

function detectFfmpeg() {
  try {
    return execSync('ffmpeg -version', { stdio: ['ignore', 'pipe', 'pipe'] })
      .toString()
      .split('\n')[0];
  } catch (err) {
    return 'unknown';
  }
}

const args = parseArgs(process.argv.slice(2));
const gameArg = args.game || 'sample-game';
const outPath = args.out;
if (!outPath) {
  console.error('Missing --out <file>');
  process.exit(1);
}

const defaults = {
  ingestion: 'tests/fixtures/ingestion/sample_ingestion.json',
  storyboard: 'tests/fixtures/storyboard/sample_storyboard.json',
  subtitles: 'tests/sample/sample_subtitles.json',
  audio: 'tests/sample/sample_audio_mix.json',
  motion: 'tests/sample/sample_motion.json',
  container: 'tests/golden/sushi-go/container.json'
};

const ingestionRaw = loadJsonMaybe(args.ingestion || defaults.ingestion) || {};
const storyboardRaw = loadJsonMaybe(args.storyboard || defaults.storyboard) || { scenes: [] };
const subtitlePaths = (args.subtitles ? args.subtitles.split(',') : [defaults.subtitles]).filter(Boolean);
const subtitleRaw = subtitlePaths.map((p) => loadJsonMaybe(p)).filter(Boolean);
const subtitleTracks = subtitleRaw.map((track) => ({
  language: track.language || track.lang || 'en',
  format: track.format || track.type || 'srt',
  items: track.items || []
}));
const audioRaw = loadJsonMaybe(args.audio || defaults.audio) || {};
const motionRaw = loadJsonMaybe(args.motion || defaults.motion) || { motions: [] };
const containerRaw = loadJsonMaybe(args.container || defaults.container) || {};

const slug = slugify(gameArg);
const gameName = args.title || gameArg.replace(/-/g, ' ');
const subtitleContract = subtitleRaw.length
  ? subtitleRaw[0].subtitleContractVersion || subtitleRaw[0].contractVersion || '1.0.0'
  : '1.0.0';

const exportBundle = {
  exportContractVersion: '1.0.0',
  project: {
    id: args.projectId || `mobius-${slug}`,
    slug,
    title: args.projectTitle || `Mobius Tutorial for ${gameName}`,
    languages: (ingestionRaw.game && ingestionRaw.game.languagesSupported) || ['en']
  },
  game: {
    name: ingestionRaw.game && ingestionRaw.game.name ? ingestionRaw.game.name : gameName,
    bggId: (ingestionRaw.game && ingestionRaw.game.bgg && ingestionRaw.game.bgg.id) || 'unknown',
    players: (ingestionRaw.game && ingestionRaw.game.playerCount) || 'n/a',
    playtime: (ingestionRaw.game && ingestionRaw.game.playtime) || 'n/a',
    age: (ingestionRaw.game && ingestionRaw.game.ageRange) || 'n/a'
  },
  ingestion: {
    contractVersion: ingestionRaw.ingestionContractVersion || '1.0.0',
    result: ingestionRaw
  },
  storyboard: {
    contractVersion: storyboardRaw.storyboardContractVersion || '1.1.0',
    scenes: storyboardRaw.scenes || []
  },
  subtitles: {
    contractVersion: subtitleContract,
    tracks: subtitleTracks
  },
  audio: {
    contractVersion: audioRaw.audioMixingContractVersion || '1.0.0',
    mix: audioRaw
  },
  motion: {
    contractVersion: motionRaw.motionContractVersion || '1.0.0',
    motions: motionRaw.motions || []
  },
  render: {
    arcVersion: args.arcVersion || '1.0.0',
    container: containerRaw
  },
  provenance: {
    mobiusCommit: args.commit || detectGitCommit(),
    branch: args.branch || detectBranch(),
    buildId: args.buildId || process.env.GITHUB_RUN_ID || null,
    ciRunId: process.env.GITHUB_RUN_ID || null,
    generatedAt: new Date().toISOString(),
    tools: {
      nodeVersion: process.version,
      ffmpegVersion: detectFfmpeg()
    },
    contracts: {
      ingestion: ingestionRaw.ingestionContractVersion || '1.0.0',
      storyboard: storyboardRaw.storyboardContractVersion || '1.1.0',
      subtitle: subtitleContract,
      audioMixing: audioRaw.audioMixingContractVersion || '1.0.0',
      motion: motionRaw.motionContractVersion || '1.0.0',
      arc: args.arcVersion || '1.0.0'
    }
  }
};

if (!exportBundle.subtitles.tracks.length) {
  exportBundle.subtitles.tracks.push({ language: 'en', format: 'srt', items: [] });
}
if (!exportBundle.storyboard.scenes.length) {
  exportBundle.storyboard.scenes.push({ id: 'scene-placeholder', type: 'placeholder', durationSec: 1 });
}

ensureDirFor(outPath);
fs.writeFileSync(outPath, JSON.stringify(exportBundle, null, 2));
console.log(`Mobius export bundle written to ${outPath}`);
