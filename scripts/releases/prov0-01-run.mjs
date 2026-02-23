#!/usr/bin/env node
// scripts/releases/prov0-01-run.mjs
// Autonomous ProV0-01 execution harness
// Orchestrates: API server start → E2E run → verification → dossier generation → cleanup

import { spawn } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { setTimeout as sleep } from 'timers/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, '../..');

class ProV001Runner {
  constructor(config) {
    this.config = config;
    this.serverProcess = null;
    this.serverPort = config.port || 5001;
    this.serverUrl = `http://localhost:${this.serverPort}`;
    this.report = {
      version: '1.0',
      runId: `prov0-01-${Date.now()}`,
      startTime: new Date().toISOString(),
      endTime: null,
      status: 'IN_PROGRESS',
      stages: {},
      errors: []
    };
  }

  async run() {
    try {
      this.log('='.repeat(80));
      this.log('ProV0-01 AUTONOMOUS EXECUTION HARNESS');
      this.log('='.repeat(80));
      this.log(`Run ID: ${this.report.runId}`);
      this.log(`Dry Run: ${this.config.dryRun}`);
      this.log('='.repeat(80));

      // Short-circuit for dry-run: only generate stub artifacts
      if (this.config.dryRun) {
        this.log('DRY RUN MODE: Generating stub artifacts only');
        await this.generateDryRunStubs();
        this.report.status = 'SUCCESS';
        this.report.endTime = new Date().toISOString();
        this.success('Dry-run completed: stub artifacts generated');
        return 0;
      }

      // Production mode: full execution
      // Stage 1: Start API server
      await this.stageStartServer();

      // Stage 2: Run E2E commissioning
      await this.stageE2ECommissioning();

      // Stage 3: Verify artifacts
      await this.stageVerifyArtifacts();

      // Stage 4: Generate release dossier
      await this.stageGenerateDossier();

      this.report.status = 'SUCCESS';
      this.report.endTime = new Date().toISOString();

      this.success('ProV0-01 execution completed successfully');
      return 0;

    } catch (error) {
      this.error(`ProV0-01 execution failed: ${error.message}`);
      this.report.status = 'FAILED';
      this.report.endTime = new Date().toISOString();
      this.report.errors.push({
        message: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      });
      return 1;

    } finally {
      // Always cleanup
      await this.cleanup();
    }
  }

  async stageStartServer() {
    this.log('STAGE 1: Start API Server');
    const stage = { name: 'startServer', startTime: new Date().toISOString(), status: 'IN_PROGRESS' };

    try {
      this.log(`  Starting server on port ${this.serverPort}...`);

      // Spawn server process
      this.serverProcess = spawn('npm', ['start'], {
        cwd: REPO_ROOT,
        env: {
          ...process.env,
          NODE_ENV: 'test',
          PORT: this.serverPort.toString(),
          SKIP_LEGACY_CHECK: 'true'
        },
        stdio: ['ignore', 'pipe', 'pipe']
      });

      // Capture server output
      let serverOutput = '';
      this.serverProcess.stdout.on('data', (data) => {
        serverOutput += data.toString();
      });

      this.serverProcess.stderr.on('data', (data) => {
        serverOutput += data.toString();
      });

      // Wait for server readiness
      const maxWaitMs = 30000;
      const startTime = Date.now();
      let ready = false;

      while (Date.now() - startTime < maxWaitMs) {
        try {
          const response = await fetch(`${this.serverUrl}/api/health`);
          if (response.ok) {
            ready = true;
            break;
          }
        } catch (error) {
          // Server not ready yet
        }

        await sleep(500);
      }

      if (!ready) {
        throw new Error(`Server did not become ready within ${maxWaitMs}ms`);
      }

      this.log(`  ✅ Server ready at ${this.serverUrl}`);

      stage.status = 'SUCCESS';
      stage.endTime = new Date().toISOString();
      this.report.stages.startServer = stage;

    } catch (error) {
      stage.status = 'FAILED';
      stage.error = error.message;
      stage.endTime = new Date().toISOString();
      this.report.stages.startServer = stage;
      throw error;
    }
  }

  async stageE2ECommissioning() {
    this.log('STAGE 2: E2E Commissioning');
    const stage = { name: 'e2eCommissioning', startTime: new Date().toISOString(), status: 'IN_PROGRESS' };

    try {
      // Build E2E command
      const args = [
        'run',
        'e2e:commission',
        '--',
        '--project-id', this.config.projectId,
        '--profile', this.config.profile || 'pro_v0',
        '--lang', this.config.lang || 'en',
        '--non-interactive'
      ];

      if (this.config.pdfPath) {
        args.push('--pdf', this.config.pdfPath);
      }

      if (this.config.bggUrl) {
        args.push('--bgg-url', this.config.bggUrl);
      }

      if (this.config.confirmFile) {
        args.push('--confirm-file', this.config.confirmFile);
      }

      if (this.config.dryRun) {
        args.push('--dry-run');
      }

      this.log(`  Running: npm ${args.join(' ')}`);

      // Run E2E commissioning
      const e2eProcess = spawn('npm', args, {
        cwd: REPO_ROOT,
        env: {
          ...process.env,
          API_BASE_URL: this.serverUrl
        },
        stdio: 'inherit'
      });

      // Wait for completion
      const exitCode = await new Promise((resolve) => {
        e2eProcess.on('close', resolve);
      });

      if (exitCode !== 0) {
        throw new Error(`E2E commissioning failed with exit code ${exitCode}`);
      }

      this.log(`  ✅ E2E commissioning completed`);

      stage.status = 'SUCCESS';
      stage.endTime = new Date().toISOString();
      this.report.stages.e2eCommissioning = stage;

    } catch (error) {
      stage.status = 'FAILED';
      stage.error = error.message;
      stage.endTime = new Date().toISOString();
      this.report.stages.e2eCommissioning = stage;
      throw error;
    }
  }

  async stageVerifyArtifacts() {
    this.log('STAGE 3: Verify Artifacts');
    const stage = { name: 'verifyArtifacts', startTime: new Date().toISOString(), status: 'IN_PROGRESS' };

    try {
      // Import verification module
      const { verifyProVideoV0 } = await import('./verify-pro-video-v0.mjs');

      // Determine output directory
      const { getOutputPath } = await import('../../src/config/storage.mjs');
      const outputDir = getOutputPath(this.config.projectId);

      this.log(`  Verifying artifacts in: ${outputDir}`);

      // Run verification
      const qcReport = await verifyProVideoV0(outputDir);

      // Save QC report
      const qcReportPath = join(outputDir, 'objective_qc.json');
      writeFileSync(qcReportPath, JSON.stringify(qcReport, null, 2), 'utf8');

      this.log(`  ✅ Objective QC report: ${qcReportPath}`);
      this.log(`     Status: ${qcReport.status}`);
      this.log(`     Errors: ${qcReport.errors.length}`);
      this.log(`     Warnings: ${qcReport.warnings.length}`);

      if (qcReport.status === 'FAIL') {
        throw new Error(`Artifact verification failed with ${qcReport.errors.length} errors`);
      }

      stage.status = 'SUCCESS';
      stage.endTime = new Date().toISOString();
      stage.qcReport = qcReport;
      this.report.stages.verifyArtifacts = stage;

    } catch (error) {
      stage.status = 'FAILED';
      stage.error = error.message;
      stage.endTime = new Date().toISOString();
      this.report.stages.verifyArtifacts = stage;
      throw error;
    }
  }

  async stageGenerateDossier() {
    this.log('STAGE 4: Generate Release Dossier');
    const stage = { name: 'generateDossier', startTime: new Date().toISOString(), status: 'IN_PROGRESS' };

    try {
      // Handle dry-run mode: generate stub outputs
      if (this.config.dryRun) {
        await this.generateDryRunStubs();
        stage.status = 'SUCCESS';
        stage.endTime = new Date().toISOString();
        stage.note = 'Dry-run stubs generated';
        this.report.stages.generateDossier = stage;
        return;
      }

      // Load E2E report
      const e2eReportPath = join(REPO_ROOT, 'FIRST_FULL_E2E_RUN.json');
      if (!existsSync(e2eReportPath)) {
        throw new Error('E2E report not found');
      }

      // Generate runlog
      const { generateRunlog } = await import('./generate-pro-v0-runlog.mjs');
      const { getOutputPath } = await import('../../src/config/storage.mjs');
      const outputDir = getOutputPath(this.config.projectId);
      const manifestPath = join(outputDir, 'render_manifest.json');

      const runlogPath = join(REPO_ROOT, 'docs/releases/PRO_VIDEO_V0_FIRST_VIDEO_RUNLOG.json');

      this.log(`  Generating runlog...`);

      // Note: We'll need to update generate-pro-v0-runlog.mjs to export a function
      // For now, spawn it as a process
      const runlogProcess = spawn('node', [
        'scripts/releases/generate-pro-v0-runlog.mjs',
        e2eReportPath,
        runlogPath,
        manifestPath
      ], {
        cwd: REPO_ROOT,
        stdio: 'inherit'
      });

      const runlogExitCode = await new Promise((resolve) => {
        runlogProcess.on('close', resolve);
      });

      if (runlogExitCode !== 0) {
        throw new Error('Runlog generation failed');
      }

      this.log(`  ✅ Runlog generated: ${runlogPath}`);

      // Generate auto-filled QC review
      await this.generateQCReview(runlogPath, outputDir);

      stage.status = 'SUCCESS';
      stage.endTime = new Date().toISOString();
      this.report.stages.generateDossier = stage;

    } catch (error) {
      stage.status = 'FAILED';
      stage.error = error.message;
      stage.endTime = new Date().toISOString();
      this.report.stages.generateDossier = stage;
      throw error;
    }
  }

  async generateQCReview(runlogPath, outputDir) {
    const runlog = JSON.parse(readFileSync(runlogPath, 'utf8'));
    const qcReportPath = join(outputDir, 'objective_qc.json');
    const qcReport = existsSync(qcReportPath) ? JSON.parse(readFileSync(qcReportPath, 'utf8')) : null;

    const reviewPath = join(REPO_ROOT, 'docs/releases/PRO_VIDEO_V0_FIRST_VIDEO_REVIEW.md');
    const template = readFileSync(reviewPath, 'utf8');

    // Auto-fill objective sections
    let filled = template;

    // Fill in metadata
    filled = filled.replace('[TO BE FILLED]', new Date().toISOString());
    filled = filled.replace('[TO BE FILLED]', 'ProV0-01 Autonomous Harness');
    filled = filled.replace('[TO BE FILLED]', runlog.execution.commitSHA);
    filled = filled.replace('[TO BE FILLED]', runlog.execution.runId);
    filled = filled.replace('[TO BE FILLED]', runlog.inputs.projectId);

    // Add objective QC section
    if (qcReport) {
      const objectiveSection = `

## Objective QC (Auto-Filled)

**Status**: ${qcReport.status}  
**Timestamp**: ${qcReport.timestamp}  
**Errors**: ${qcReport.errors.length}  
**Warnings**: ${qcReport.warnings.length}

### Technical Measurements

${qcReport.technical.video ? `
**Video**:
- Duration: ${qcReport.technical.video.duration.toFixed(1)}s
- Resolution: ${qcReport.technical.video.width}x${qcReport.technical.video.height}
- FPS: ${qcReport.technical.video.fps.toFixed(2)}
- Codec: ${qcReport.technical.video.codec}
- Bitrate: ${(qcReport.technical.video.bitrate / 1000000).toFixed(2)} Mbps
` : ''}

${qcReport.technical.audio ? `
**Audio**:
- Codec: ${qcReport.technical.audio.codec}
- Sample Rate: ${qcReport.technical.audio.sampleRate} Hz
- Channels: ${qcReport.technical.audio.channels}
` : ''}

${qcReport.technical.loudness ? `
**Loudness**:
- Integrated: ${qcReport.technical.loudness.integratedLUFS.toFixed(1)} LUFS
- True Peak: ${qcReport.technical.loudness.truePeakDBTP.toFixed(1)} dBTP
- Loudness Range: ${qcReport.technical.loudness.loudnessRangeLU.toFixed(1)} LU
` : ''}

${qcReport.technical.captions ? `
**Captions**:
- Format: ${qcReport.technical.captions.format}
- Cue Count: ${qcReport.technical.captions.cueCount}
- Total Duration: ${qcReport.technical.captions.totalDuration.toFixed(1)}s
` : ''}

${qcReport.technical.chapters ? `
**Chapters**:
- Count: ${qcReport.technical.chapters.count}
- Titles: ${qcReport.technical.chapters.titles.join(', ')}
` : ''}

### Verification Results

${qcReport.errors.length > 0 ? `
**Errors**:
${qcReport.errors.map(e => `- [${e.type}] ${e.message}`).join('\n')}
` : 'No errors detected.'}

${qcReport.warnings.length > 0 ? `
**Warnings**:
${qcReport.warnings.map(w => `- [${w.type}] ${w.message}`).join('\n')}
` : 'No warnings.'}

---

## Subjective QC (Manual Review Required)

**TODO**: Operator must complete the following manual checks:

`;

      // Insert before "## Technical Quality Checks"
      filled = filled.replace('## Technical Quality Checks', objectiveSection + '## Technical Quality Checks');
    }

    writeFileSync(reviewPath, filled, 'utf8');
    this.log(`  ✅ QC review auto-filled: ${reviewPath}`);
  }

  async generateDryRunStubs() {
    this.log('  Generating dry-run stub outputs...');

    const { execSync } = await import('child_process');
    let commitSHA = 'UNKNOWN';
    try {
      commitSHA = execSync('git rev-parse HEAD', { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
    } catch (error) {
      // Ignore
    }

    // Generate stub runlog
    const stubRunlog = {
      version: '1.0',
      release: 'PRO_VIDEO_V0_FIRST_VIDEO',
      mode: 'DRY_RUN',
      generatedAt: new Date().toISOString(),
      execution: {
        runId: this.report.runId,
        commitSHA,
        startTime: this.report.startTime,
        endTime: new Date().toISOString(),
        duration: null,
        status: 'DRY_RUN_COMPLETE'
      },
      inputs: {
        projectId: this.config.projectId,
        pdfPath: this.config.pdfPath || 'NOT_PROVIDED_DRY_RUN',
        bggUrl: this.config.bggUrl || null,
        language: this.config.lang,
        profile: this.config.profile,
        useHephaestus: false
      },
      renderSettings: null,
      artifacts: {},
      gateConfirmations: [],
      objectiveQc: {
        status: 'SKIPPED_DRY_RUN',
        timestamp: new Date().toISOString(),
        note: 'Objective QC skipped in dry-run mode'
      },
      stages: this.report.stages,
      errors: []
    };

    const runlogPath = join(REPO_ROOT, 'docs/releases/PRO_VIDEO_V0_FIRST_VIDEO_RUNLOG.json');
    writeFileSync(runlogPath, JSON.stringify(stubRunlog, null, 2), 'utf8');
    this.log(`  ✅ Stub runlog: ${runlogPath}`);

    // Generate stub QC review
    const stubReview = `# Professional Video v0 - First Video QC Review (DRY RUN)

**Date**: ${new Date().toISOString()}  
**Reviewer**: ProV0-01 Autonomous Harness (Dry Run)  
**Commit SHA**: ${commitSHA}  
**Run ID**: ${this.report.runId}  
**Project ID**: ${this.config.projectId}

## Executive Summary

**Final Verdict**: DRY_RUN

**Summary**: This is a dry-run stub. No actual artifacts were produced or verified.

## Dry Run Mode

This QC review was generated in dry-run mode. The following stages were skipped:
- API server startup
- Actual PDF ingestion
- Script generation
- Rendering
- Artifact verification

## Expected Output Files (Production Mode)

When running in production mode, the following artifacts would be produced:

### Required Artifacts (Pro v0)
- [ ] **Video (MP4)**: data/outputs/project_${this.config.projectId}/output.mp4
- [ ] **Thumbnail (JPG)**: data/outputs/project_${this.config.projectId}/thumbnail.jpg
- [ ] **Captions (SRT)**: data/outputs/project_${this.config.projectId}/captions_${this.config.lang}.srt
- [ ] **Chapters (JSON)**: data/outputs/project_${this.config.projectId}/chapters_${this.config.lang}.json
- [ ] **Manifest (JSON)**: data/outputs/project_${this.config.projectId}/render_manifest.json

### Documentation Artifacts
- [ ] **E2E Report (JSON)**: FIRST_FULL_E2E_RUN.json
- [ ] **E2E Report (MD)**: FIRST_FULL_E2E_RUN.md
- [ ] **Runlog (JSON)**: docs/releases/PRO_VIDEO_V0_FIRST_VIDEO_RUNLOG.json
- [ ] **QC Review (MD)**: docs/releases/PRO_VIDEO_V0_FIRST_VIDEO_REVIEW.md
- [ ] **Objective QC (JSON)**: data/outputs/project_${this.config.projectId}/objective_qc.json

## Next Steps

To execute a real production run:

\`\`\`bash
npm run release:prov0-01 -- \\
  --pdf path/to/rulebook.pdf \\
  --confirm-file confirmations.json \\
  --bgg-url "https://boardgamegeek.com/boardgame/XXXXX"
\`\`\`

---

**Review Version**: 1.0 (Dry Run Stub)  
**Template**: PRO_VIDEO_V0_FIRST_VIDEO_REVIEW.md  
**Generated**: ${new Date().toISOString()}
`;

    const reviewPath = join(REPO_ROOT, 'docs/releases/PRO_VIDEO_V0_FIRST_VIDEO_REVIEW.md');
    writeFileSync(reviewPath, stubReview, 'utf8');
    this.log(`  ✅ Stub QC review: ${reviewPath}`);

    this.log('  ℹ️  Dry-run stubs generated successfully');
    this.log('  ℹ️  These are placeholder files - no actual artifacts were produced');
  }

  async cleanup() {
    this.log('Cleaning up...');

    if (this.serverProcess) {
      this.log('  Stopping API server...');
      this.serverProcess.kill('SIGTERM');

      // Wait for graceful shutdown
      await sleep(2000);

      if (!this.serverProcess.killed) {
        this.log('  Force killing server...');
        this.serverProcess.kill('SIGKILL');
      }

      this.log('  ✅ Server stopped');
    }
  }

  log(message) {
    console.log(`[${new Date().toISOString()}] ${message}`);
  }

  error(message) {
    console.error(`[${new Date().toISOString()}] [ERROR] ${message}`);
  }

  success(message) {
    console.log(`[${new Date().toISOString()}] [SUCCESS] ${message}`);
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const config = {
    projectId: 'prov0-01',
    profile: 'pro_v0',
    lang: 'en',
    dryRun: false,
    port: 5001
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--project-id':
        config.projectId = args[++i];
        break;
      case '--pdf':
        config.pdfPath = args[++i];
        break;
      case '--bgg-url':
        config.bggUrl = args[++i];
        break;
      case '--lang':
        config.lang = args[++i];
        break;
      case '--profile':
        config.profile = args[++i];
        break;
      case '--confirm-file':
        config.confirmFile = args[++i];
        break;
      case '--port':
        config.port = parseInt(args[++i]);
        break;
      case '--dry-run':
        config.dryRun = true;
        break;
      default:
        if (arg.startsWith('--')) {
          console.error(`Unknown argument: ${arg}`);
          process.exit(1);
        }
    }
  }

  // Validate required args
  if (!config.dryRun && !config.pdfPath) {
    console.error('Error: --pdf is required for non-dry-run');
    console.error('');
    console.error('Usage: node prov0-01-run.mjs --pdf <path> --confirm-file <path> [options]');
    console.error('');
    console.error('Options:');
    console.error('  --project-id <id>       Project ID (default: prov0-01)');
    console.error('  --pdf <path>            Path to rulebook PDF (required)');
    console.error('  --bgg-url <url>         BGG URL (optional)');
    console.error('  --lang <en|fr>          Language (default: en)');
    console.error('  --profile <profile>     Render profile (default: pro_v0)');
    console.error('  --confirm-file <path>   Confirmation file (required for non-interactive)');
    console.error('  --port <port>           Server port (default: 5001)');
    console.error('  --dry-run               Dry run mode');
    process.exit(1);
  }

  if (!config.dryRun && !config.confirmFile) {
    console.error('Error: --confirm-file is required for non-interactive execution');
    process.exit(1);
  }

  // Early short-circuit for dry-run: generate stubs and exit
  if (config.dryRun) {
    console.log('='.repeat(80));
    console.log('ProV0-01 DRY RUN MODE');
    console.log('='.repeat(80));
    console.log('Generating stub dossier artifacts...');
    console.log('');
    
    const exitCode = await generateDryRunStubsStandalone(config);
    process.exit(exitCode);
  }

  const runner = new ProV001Runner(config);
  const exitCode = await runner.run();
  process.exit(exitCode);
}

// Standalone dry-run stub generator (called before runner instantiation)
async function generateDryRunStubsStandalone(config) {
  try {
    const { execSync } = await import('child_process');
    const { writeFileSync } = await import('fs');
    const { join, dirname } = await import('path');
    const { fileURLToPath } = await import('url');
    
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const REPO_ROOT = join(__dirname, '../..');
    
    let commitSHA = 'UNKNOWN';
    try {
      commitSHA = execSync('git rev-parse HEAD', { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
    } catch (error) {
      // Ignore git errors
    }
    
    const runId = `prov0-01-dryrun-${Date.now()}`;
    const timestamp = new Date().toISOString();
    
    // Generate stub runlog
    const stubRunlog = {
      version: '1.0',
      release: 'PRO_VIDEO_V0_FIRST_VIDEO',
      mode: 'DRY_RUN',
      generatedAt: timestamp,
      execution: {
        runId,
        commitSHA,
        startTime: timestamp,
        endTime: timestamp,
        duration: 0,
        status: 'DRY_RUN_COMPLETE'
      },
      inputs: {
        projectId: config.projectId,
        pdfPath: 'NOT_PROVIDED_DRY_RUN',
        bggUrl: null,
        language: config.lang,
        profile: config.profile,
        useHephaestus: false
      },
      renderSettings: null,
      artifacts: {},
      gateConfirmations: [],
      objectiveQc: {
        status: 'SKIPPED_DRY_RUN',
        timestamp,
        note: 'Objective QC skipped in dry-run mode - no artifacts produced'
      },
      stages: {
        dryRunStubGeneration: {
          name: 'dryRunStubGeneration',
          status: 'SUCCESS',
          startTime: timestamp,
          endTime: timestamp
        }
      },
      errors: [],
      note: 'This is a DRY RUN stub. No server was started, no PDF was processed, and no video artifacts were produced.'
    };
    
    const runlogPath = join(REPO_ROOT, 'docs/releases/PRO_VIDEO_V0_FIRST_VIDEO_RUNLOG.json');
    writeFileSync(runlogPath, JSON.stringify(stubRunlog, null, 2), 'utf8');
    console.log(`✅ Stub runlog: ${runlogPath}`);
    
    // Generate stub QC review
    const stubReview = `# Professional Video v0 - First Video QC Review (DRY RUN)

**Date**: ${timestamp}  
**Reviewer**: ProV0-01 Autonomous Harness (Dry Run Mode)  
**Commit SHA**: ${commitSHA}  
**Run ID**: ${runId}  
**Project ID**: ${config.projectId}

## Executive Summary

**Final Verdict**: DRY_RUN

**Summary**: This is a dry-run stub generated for wiring validation. No actual artifacts were produced or verified.

---

## DRY RUN MODE

**⚠️ IMPORTANT**: This document was generated in dry-run mode.

The following stages were **SKIPPED**:
- ❌ API server startup
- ❌ PDF ingestion
- ❌ Script generation
- ❌ Rendering
- ❌ Artifact verification
- ❌ Objective QC

**No video artifacts were produced.**

---

## Expected Output Files (Production Mode)

When running in production mode with \`npm run release:prov0-01\`, the following artifacts would be produced:

### Required Artifacts (Pro v0)
- [ ] **Video (MP4)**: \`data/outputs/project_${config.projectId}/output.mp4\`
- [ ] **Thumbnail (JPG)**: \`data/outputs/project_${config.projectId}/thumbnail.jpg\`
- [ ] **Captions (SRT)**: \`data/outputs/project_${config.projectId}/captions_${config.lang}.srt\`
- [ ] **Chapters (JSON)**: \`data/outputs/project_${config.projectId}/chapters_${config.lang}.json\`
- [ ] **Manifest (JSON)**: \`data/outputs/project_${config.projectId}/render_manifest.json\`

### Documentation Artifacts
- [ ] **E2E Report (JSON)**: \`FIRST_FULL_E2E_RUN.json\`
- [ ] **E2E Report (MD)**: \`FIRST_FULL_E2E_RUN.md\`
- [ ] **Runlog (JSON)**: \`docs/releases/PRO_VIDEO_V0_FIRST_VIDEO_RUNLOG.json\`
- [ ] **QC Review (MD)**: \`docs/releases/PRO_VIDEO_V0_FIRST_VIDEO_REVIEW.md\`
- [ ] **Objective QC (JSON)**: \`data/outputs/project_${config.projectId}/objective_qc.json\`

---

## Dry Run Purpose

This dry-run mode validates:
- ✅ Script syntax and imports
- ✅ Harness orchestration logic
- ✅ Stub file generation
- ✅ Exit code handling

This dry-run mode does **NOT** validate:
- ❌ Server startup
- ❌ API endpoints
- ❌ PDF ingestion
- ❌ Rendering pipeline
- ❌ Actual artifact generation
- ❌ Objective QC verification

---

## Next Steps

To execute a real production run:

\`\`\`bash
# 1. Prepare confirmation file
cp docs/releases/prov0-01-confirmations.example.json my-confirmations.json
# Edit: fill in operator name, timestamp, review each gate

# 2. Run production
npm run release:prov0-01 -- \\
  --pdf path/to/rulebook.pdf \\
  --confirm-file my-confirmations.json \\
  --bgg-url "https://boardgamegeek.com/boardgame/XXXXX"
\`\`\`

---

**Review Version**: 1.0 (Dry Run Stub)  
**Template**: PRO_VIDEO_V0_FIRST_VIDEO_REVIEW.md  
**Generated**: ${timestamp}  
**Mode**: DRY_RUN
`;
    
    const reviewPath = join(REPO_ROOT, 'docs/releases/PRO_VIDEO_V0_FIRST_VIDEO_REVIEW.md');
    writeFileSync(reviewPath, stubReview, 'utf8');
    console.log(`✅ Stub QC review: ${reviewPath}`);
    
    console.log('');
    console.log('='.repeat(80));
    console.log('DRY RUN COMPLETE');
    console.log('='.repeat(80));
    console.log('Stub artifacts generated successfully.');
    console.log('These are placeholder files - no actual video production occurred.');
    console.log('');
    console.log('To run production: npm run release:prov0-01 -- --pdf <path> --confirm-file <path>');
    console.log('='.repeat(80));
    
    return 0;
  } catch (error) {
    console.error('');
    console.error('='.repeat(80));
    console.error('DRY RUN FAILED');
    console.error('='.repeat(80));
    console.error(`Error: ${error.message}`);
    console.error('');
    console.error('Stack trace:');
    console.error(error.stack);
    console.error('='.repeat(80));
    return 1;
  }
}

// Run if executed directly
import { pathToFileURL } from 'url';
const scriptUrl = pathToFileURL(process.argv[1]).href;
if (import.meta.url === scriptUrl) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}
