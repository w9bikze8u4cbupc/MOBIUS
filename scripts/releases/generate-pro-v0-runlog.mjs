#!/usr/bin/env node
// scripts/releases/generate-pro-v0-runlog.mjs
// Generate structured runlog for Professional Video v0 first video release

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, '../..');

function getCommitSHA() {
  try {
    return execSync('git rev-parse HEAD', { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
  } catch (error) {
    return 'UNKNOWN';
  }
}

function calculateChecksum(filePath) {
  try {
    const fileBuffer = readFileSync(filePath);
    const hashSum = crypto.createHash('sha256');
    hashSum.update(fileBuffer);
    return hashSum.digest('hex');
  } catch (error) {
    console.warn(`⚠️  Could not calculate checksum for ${filePath}: ${error.message}`);
    return null;
  }
}

function getFileSize(filePath) {
  try {
    const stats = require('fs').statSync(filePath);
    return stats.size;
  } catch (error) {
    return 0;
  }
}

export async function generateRunlog(e2eReportPath, manifestPath, outputPath, objectiveQcPath = null) {
  console.log('Generating Pro v0 runlog...');
  
  // Load E2E report
  if (!existsSync(e2eReportPath)) {
    throw new Error(`E2E report not found: ${e2eReportPath}`);
  }
  
  const e2eReport = JSON.parse(readFileSync(e2eReportPath, 'utf8'));
  
  // Load manifest if available
  let manifest = null;
  if (manifestPath && existsSync(manifestPath)) {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  }
  
  // Load objective QC if available
  let objectiveQc = null;
  if (objectiveQcPath && existsSync(objectiveQcPath)) {
    objectiveQc = JSON.parse(readFileSync(objectiveQcPath, 'utf8'));
  }
  
  // Build runlog
  const runlog = {
    version: '1.0',
    release: 'PRO_VIDEO_V0_FIRST_VIDEO',
    generatedAt: new Date().toISOString(),
    
    // Execution metadata
    execution: {
      runId: e2eReport.runId,
      commitSHA: getCommitSHA(),
      startTime: e2eReport.startTime,
      endTime: e2eReport.endTime,
      duration: e2eReport.endTime ? 
        (new Date(e2eReport.endTime) - new Date(e2eReport.startTime)) / 1000 : null,
      status: e2eReport.status
    },
    
    // Input configuration
    inputs: {
      projectId: e2eReport.config.projectId,
      pdfPath: e2eReport.config.pdfPath,
      bggUrl: e2eReport.config.bggUrl,
      language: e2eReport.config.lang,
      profile: e2eReport.config.profile || 'standard',
      useHephaestus: e2eReport.config.useHephaestus
    },
    
    // Render settings
    renderSettings: manifest ? {
      profile: manifest.profile,
      language: manifest.settings.language,
      burnCaptions: manifest.settings.burnCaptions,
      exportSrt: manifest.settings.exportSrt,
      loudness: manifest.settings.loudness,
      ducking: manifest.settings.ducking,
      safetyFilters: manifest.settings.safetyFilters
    } : null,
    
    // Output artifacts
    artifacts: {},
    
    // Gate confirmations
    gateConfirmations: e2eReport.gatesConfirmed || [],
    
    // Stage results
    stages: e2eReport.stages || {},
    
    // Objective QC results
    objectiveQc: objectiveQc || null,
    
    // Errors
    errors: e2eReport.errors || []
  };
  
  // Process artifacts from manifest
  if (manifest && manifest.artifacts) {
    for (const [key, artifact] of Object.entries(manifest.artifacts)) {
      if (artifact.exists) {
        runlog.artifacts[key] = {
          filename: artifact.filename,
          path: artifact.path,
          size: artifact.size,
          checksum: artifact.checksum,
          verified: artifact.checksum ? 
            (calculateChecksum(artifact.path) === artifact.checksum) : false
        };
      }
    }
  } else {
    // Fallback: extract from E2E report
    const renderStage = e2eReport.stages?.render;
    if (renderStage && renderStage.metadata) {
      const metadata = renderStage.metadata;
      
      if (metadata.outputPath) {
        runlog.artifacts.video = {
          filename: require('path').basename(metadata.outputPath),
          path: metadata.outputPath,
          size: getFileSize(metadata.outputPath),
          checksum: calculateChecksum(metadata.outputPath),
          verified: true
        };
      }
      
      if (metadata.captionPath) {
        runlog.artifacts.captions = {
          filename: require('path').basename(metadata.captionPath),
          path: metadata.captionPath,
          size: getFileSize(metadata.captionPath),
          checksum: calculateChecksum(metadata.captionPath),
          verified: true
        };
      }
      
      if (metadata.chaptersPath) {
        runlog.artifacts.chapters = {
          filename: require('path').basename(metadata.chaptersPath),
          path: metadata.chaptersPath,
          size: getFileSize(metadata.chaptersPath),
          checksum: calculateChecksum(metadata.chaptersPath),
          verified: true
        };
      }
      
      if (metadata.manifestPath) {
        runlog.artifacts.manifest = {
          filename: require('path').basename(metadata.manifestPath),
          path: metadata.manifestPath,
          size: getFileSize(metadata.manifestPath),
          checksum: calculateChecksum(metadata.manifestPath),
          verified: true
        };
      }
    }
  }
  
  // Write runlog
  writeFileSync(outputPath, JSON.stringify(runlog, null, 2), 'utf8');
  console.log(`✅ Runlog written to: ${outputPath}`);
  
  // Print summary
  console.log('\n' + '='.repeat(80));
  console.log('RUNLOG SUMMARY');
  console.log('='.repeat(80));
  console.log(`Run ID: ${runlog.execution.runId}`);
  console.log(`Commit SHA: ${runlog.execution.commitSHA}`);
  console.log(`Status: ${runlog.execution.status}`);
  console.log(`Profile: ${runlog.inputs.profile}`);
  console.log(`\nArtifacts:`);
  for (const [key, artifact] of Object.entries(runlog.artifacts)) {
    console.log(`  ${key}: ${artifact.filename} (${artifact.size} bytes)`);
    console.log(`    Checksum: ${artifact.checksum}`);
    console.log(`    Verified: ${artifact.verified ? '✅' : '❌'}`);
  }
  console.log(`\nGate Confirmations: ${runlog.gateConfirmations.length}`);
  console.log('='.repeat(80));
  
  return runlog;
}

// Main
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.error('Usage: node generate-pro-v0-runlog.mjs <e2e-report.json> <output-runlog.json> [manifest.json] [objective-qc.json]');
    console.error('');
    console.error('Example:');
    console.error('  node generate-pro-v0-runlog.mjs FIRST_FULL_E2E_RUN.json docs/releases/PRO_VIDEO_V0_FIRST_VIDEO_RUNLOG.json data/outputs/project_1/render_manifest.json data/outputs/project_1/objective_qc.json');
    process.exit(1);
  }
  
  const e2eReportPath = args[0];
  const outputPath = args[1];
  const manifestPath = args[2] || null;
  const objectiveQcPath = args[3] || null;
  
  try {
    await generateRunlog(e2eReportPath, manifestPath, outputPath, objectiveQcPath);
    console.log('\n✅ Runlog generation complete');
  } catch (error) {
    console.error(`\n❌ Runlog generation failed: ${error.message}`);
    process.exit(1);
  }
}

main();
