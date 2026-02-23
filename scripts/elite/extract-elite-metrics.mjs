#!/usr/bin/env node
// scripts/elite/extract-elite-metrics.mjs
// Extract Elite metrics from rendered video artifacts using ffmpeg/ffprobe

import { execSync } from 'child_process';
import { existsSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { pathToFileURL } from 'url';
import { parseResolution } from './parsers/ffprobe_stream_parse.mjs';
import { parseEBUR128 } from './parsers/ffmpeg_ebur128_parse.mjs';
import { parseSilenceDetect } from './parsers/ffmpeg_silencedetect_parse.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DEFAULT_OUTPUT_PATH = join(process.cwd(), 'elite_metrics.json');

// Parse CLI args
function parseArgs() {
  const args = process.argv.slice(2);
  let mp4Path = null;
  let outputPath = DEFAULT_OUTPUT_PATH;
  let srtPath = null;
  let chaptersPath = null;
  let thumbnailPath = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--mp4' && i + 1 < args.length) {
      mp4Path = args[i + 1];
      i++;
    } else if (args[i] === '--out' && i + 1 < args.length) {
      outputPath = args[i + 1];
      i++;
    } else if (args[i] === '--srt' && i + 1 < args.length) {
      srtPath = args[i + 1];
      i++;
    } else if (args[i] === '--chapters' && i + 1 < args.length) {
      chaptersPath = args[i + 1];
      i++;
    } else if (args[i] === '--thumbnail' && i + 1 < args.length) {
      thumbnailPath = args[i + 1];
      i++;
    }
  }

  if (!mp4Path) {
    console.error('Error: --mp4 <path> is required');
    process.exit(1);
  }

  return { mp4Path, outputPath, srtPath, chaptersPath, thumbnailPath };
}

// Check if ffmpeg/ffprobe are available
function checkDependencies() {
  try {
    execSync('ffmpeg -version', { stdio: 'ignore' });
    execSync('ffprobe -version', { stdio: 'ignore' });
    return true;
  } catch (error) {
    console.error('Error: ffmpeg and ffprobe are required but not found in PATH');
    return false;
  }
}

// Extract resolution using ffprobe
function extractResolution(mp4Path) {
  console.log('  Extracting resolution (V1)...');
  
  try {
    const output = execSync(
      `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of json "${mp4Path}"`,
      { encoding: 'utf8' }
    );
    
    const resolution = parseResolution(output);
    console.log(`    ✓ Resolution: ${resolution.width}x${resolution.height}`);
    return resolution;
  } catch (error) {
    console.error(`    ✗ Failed: ${error.message}`);
    throw error;
  }
}

// Extract loudness and true peak using ffmpeg ebur128
function extractLoudnessAndPeak(mp4Path) {
  console.log('  Extracting loudness and true peak (A1, A2)...');
  
  try {
    const output = execSync(
      `ffmpeg -hide_banner -i "${mp4Path}" -filter_complex ebur128=peak=true -f null -`,
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    ).toString() + execSync(
      `ffmpeg -hide_banner -i "${mp4Path}" -filter_complex ebur128=peak=true -f null - 2>&1`,
      { encoding: 'utf8' }
    );
    
    const metrics = parseEBUR128(output);
    console.log(`    ✓ Integrated loudness: ${metrics.integrated_lufs} LUFS`);
    console.log(`    ✓ True peak: ${metrics.true_peak_dbtp} dBTP`);
    return metrics;
  } catch (error) {
    console.error(`    ✗ Failed: ${error.message}`);
    throw error;
  }
}

// Extract silence detection using ffmpeg silencedetect
function extractSilence(mp4Path) {
  console.log('  Extracting silence runs (A4)...');
  
  try {
    const output = execSync(
      `ffmpeg -hide_banner -i "${mp4Path}" -af silencedetect=noise=-30dB:d=0.5 -f null - 2>&1`,
      { encoding: 'utf8' }
    );
    
    const metrics = parseSilenceDetect(output);
    console.log(`    ✓ Max silence duration: ${metrics.max_silence_duration}s`);
    return metrics;
  } catch (error) {
    console.error(`    ✗ Failed: ${error.message}`);
    throw error;
  }
}

// Check artifact existence
function checkArtifactExistence(srtPath, chaptersPath, thumbnailPath) {
  const metrics = {};
  
  if (srtPath) {
    const exists = existsSync(srtPath);
    metrics.A11 = { actual: exists };
    console.log(`  A11 (SRT exists): ${exists ? '✓' : '✗'}`);
  }
  
  if (chaptersPath) {
    const exists = existsSync(chaptersPath);
    metrics.A12 = { actual: exists };
    console.log(`  A12 (Chapters exist): ${exists ? '✓' : '✗'}`);
  }
  
  if (thumbnailPath) {
    const exists = existsSync(thumbnailPath);
    metrics.A13 = { actual: exists };
    console.log(`  A13 (Thumbnail exists): ${exists ? '✓' : '✗'}`);
  }
  
  return metrics;
}

// Main extraction function
async function extractMetrics(mp4Path, srtPath, chaptersPath, thumbnailPath) {
  const metrics = {};
  
  console.log('Extracting Elite metrics...');
  console.log('');
  
  // V1: Resolution
  const resolution = extractResolution(mp4Path);
  metrics.V1 = { actual: resolution };
  
  // A1, A2: Loudness and true peak
  const loudness = extractLoudnessAndPeak(mp4Path);
  metrics.A1 = { actual: loudness.integrated_lufs };
  metrics.A2 = { actual: loudness.true_peak_dbtp };
  
  // A3: Clipping proxy (use true peak as proxy)
  // If true peak > -0.1 dBTP, likely clipping
  metrics.A3 = { actual: loudness.true_peak_dbtp };
  console.log(`  A3 (Clipping proxy): ${loudness.true_peak_dbtp} dBTP`);
  
  // A4: Silence detection
  const silence = extractSilence(mp4Path);
  metrics.A4 = { actual: silence.max_silence_duration };
  
  // A11-A13: Artifact existence checks
  console.log('');
  console.log('Checking artifact existence...');
  const artifactMetrics = checkArtifactExistence(srtPath, chaptersPath, thumbnailPath);
  Object.assign(metrics, artifactMetrics);
  
  return metrics;
}

// Programmatic API for release harness integration
export async function extractEliteMetrics({ mp4Path, outputPath, artifactPaths = {} }) {
  const { srtPath, chaptersPath, thumbnailPath } = artifactPaths;
  
  // Validate inputs
  if (!existsSync(mp4Path)) {
    throw new Error(`MP4 file not found: ${mp4Path}`);
  }
  
  // Check dependencies
  try {
    execSync('ffmpeg -version', { stdio: 'ignore' });
    execSync('ffprobe -version', { stdio: 'ignore' });
  } catch (error) {
    throw new Error('ffmpeg and ffprobe are required but not found in PATH');
  }
  
  // Extract metrics
  const metrics = await extractMetrics(mp4Path, srtPath, chaptersPath, thumbnailPath);
  
  // Sort keys for determinism
  const sortedMetrics = {};
  Object.keys(metrics).sort().forEach(key => {
    sortedMetrics[key] = metrics[key];
  });
  
  // Write output if path provided
  if (outputPath) {
    writeFileSync(outputPath, JSON.stringify(sortedMetrics, null, 2) + '\n', 'utf8');
  }
  
  return sortedMetrics;
}

// Main function
async function main() {
  const { mp4Path, outputPath, srtPath, chaptersPath, thumbnailPath } = parseArgs();
  
  console.log('Elite Metrics Extractor');
  console.log('======================');
  console.log(`MP4:      ${mp4Path}`);
  console.log(`Output:   ${outputPath}`);
  if (srtPath) console.log(`SRT:      ${srtPath}`);
  if (chaptersPath) console.log(`Chapters: ${chaptersPath}`);
  if (thumbnailPath) console.log(`Thumbnail: ${thumbnailPath}`);
  console.log('');
  
  // Validate inputs
  if (!existsSync(mp4Path)) {
    console.error(`Error: MP4 file not found: ${mp4Path}`);
    process.exit(1);
  }
  
  // Check dependencies
  if (!checkDependencies()) {
    process.exit(1);
  }
  
  console.log('✓ Dependencies available');
  console.log('');
  
  // Extract metrics
  try {
    const metrics = await extractMetrics(mp4Path, srtPath, chaptersPath, thumbnailPath);
    
    // Sort keys for determinism
    const sortedMetrics = {};
    Object.keys(metrics).sort().forEach(key => {
      sortedMetrics[key] = metrics[key];
    });
    
    // Write output
    writeFileSync(outputPath, JSON.stringify(sortedMetrics, null, 2) + '\n', 'utf8');
    
    console.log('');
    console.log(`✓ Metrics written: ${outputPath}`);
    console.log('');
    console.log(`Extracted ${Object.keys(metrics).length} metrics`);
    console.log('');
    console.log('Run verifier:');
    console.log(`  npm run elite:verify -- --metrics ${outputPath}`);
    
    process.exit(0);
  } catch (error) {
    console.error('');
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

// ESM main guard
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error('Error:', error.message);
    process.exit(1);
  });
}

// Export for testing
export { extractMetrics, checkArtifactExistence };
