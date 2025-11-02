/**
 * Comprehensive tests for GitHub Actions CI workflow configuration
 * Tests YAML structure, job configuration, and deterministic build features
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

const CI_WORKFLOW_PATH = path.join(process.cwd(), '.github/workflows/ci.yml');

describe('CI Workflow - YAML Structure', () => {
  let workflowContent: string;
  let workflow: any;

  beforeAll(() => {
    workflowContent = fs.readFileSync(CI_WORKFLOW_PATH, 'utf8');
    workflow = yaml.load(workflowContent) as any;
  });

  test('should be valid YAML', () => {
    expect(workflow).toBeDefined();
    expect(typeof workflow).toBe('object');
  });

  test('should have required top-level keys', () => {
    expect(workflow).toHaveProperty('name');
    expect(workflow).toHaveProperty('on');
    expect(workflow).toHaveProperty('jobs');
  });

  test('should have workflow name defined', () => {
    expect(workflow.name).toBe('CI');
  });

  test('should trigger on push and pull_request', () => {
    expect(workflow.on).toHaveProperty('push');
    expect(workflow.on).toHaveProperty('pull_request');
  });
});

describe('CI Workflow - Job Configuration', () => {
  let workflow: any;

  beforeAll(() => {
    const workflowContent = fs.readFileSync(CI_WORKFLOW_PATH, 'utf8');
    workflow = yaml.load(workflowContent) as any;
  });

  test('should have build-and-qa job defined', () => {
    expect(workflow.jobs).toHaveProperty('build-and-qa');
  });

  test('should have matrix strategy with fail-fast disabled', () => {
    const job = workflow.jobs['build-and-qa'];
    expect(job).toHaveProperty('strategy');
    expect(job.strategy['fail-fast']).toBe(false);
  });

  test('should test on multiple operating systems', () => {
    const job = workflow.jobs['build-and-qa'];
    expect(job.strategy.matrix).toHaveProperty('os');
    expect(Array.isArray(job.strategy.matrix.os)).toBe(true);
    expect(job.strategy.matrix.os).toContain('ubuntu-latest');
    expect(job.strategy.matrix.os).toContain('macos-latest');
    expect(job.strategy.matrix.os).toContain('windows-latest');
  });

  test('should use matrix os in runs-on', () => {
    const job = workflow.jobs['build-and-qa'];
    expect(job['runs-on']).toBe('${{ matrix.os }}');
  });
});

describe('CI Workflow - Setup Steps', () => {
  let steps: any[];

  beforeAll(() => {
    const workflowContent = fs.readFileSync(CI_WORKFLOW_PATH, 'utf8');
    const workflow = yaml.load(workflowContent) as any;
    steps = workflow.jobs['build-and-qa'].steps;
  });

  test('should have checkout step', () => {
    const checkoutStep = steps.find(s => s.name === 'Checkout');
    expect(checkoutStep).toBeDefined();
    expect(checkoutStep.uses).toBe('actions/checkout@v4');
  });

  test('should setup Node.js with version 20', () => {
    const nodeStep = steps.find(s => s.name === 'Setup Node');
    expect(nodeStep).toBeDefined();
    expect(nodeStep.uses).toBe('actions/setup-node@v4');
    expect(nodeStep.with).toHaveProperty('node-version', '20');
  });

  test('should enable npm caching in Node setup', () => {
    const nodeStep = steps.find(s => s.name === 'Setup Node');
    expect(nodeStep.with).toHaveProperty('cache', 'npm');
  });

  test('should setup Python with version 3.10', () => {
    const pythonStep = steps.find(s => s.name === 'Setup Python');
    expect(pythonStep).toBeDefined();
    expect(pythonStep.uses).toBe('actions/setup-python@v5');
    expect(pythonStep.with).toHaveProperty('python-version', '3.10');
  });

  test('should setup FFmpeg', () => {
    const ffmpegStep = steps.find(s => s.name === 'Ensure FFmpeg');
    expect(ffmpegStep).toBeDefined();
    expect(ffmpegStep.uses).toBe('FedericoCarboni/setup-ffmpeg@v2');
  });
});

describe('CI Workflow - Guarded Installation Steps', () => {
  let steps: any[];

  beforeAll(() => {
    const workflowContent = fs.readFileSync(CI_WORKFLOW_PATH, 'utf8');
    const workflow = yaml.load(workflowContent) as any;
    steps = workflow.jobs['build-and-qa'].steps;
  });

  test('should have guarded root deps installation', () => {
    const installStep = steps.find(s => s.name === 'Install root deps (guarded)');
    expect(installStep).toBeDefined();
    expect(installStep.shell).toBe('bash');
    expect(installStep.run).toContain('if [ -f package.json ]');
    expect(installStep.run).toContain('npm ci');
  });

  test('should have guarded client deps installation', () => {
    const installStep = steps.find(s => s.name === 'Install client deps (guarded)');
    expect(installStep).toBeDefined();
    expect(installStep.shell).toBe('bash');
    expect(installStep.run).toContain('if [ -f client/package.json ]');
    expect(installStep.run).toContain('cd client && npm ci');
  });

  test('should have guarded Python deps installation', () => {
    const installStep = steps.find(s => s.name === 'Install Python deps (guarded)');
    expect(installStep).toBeDefined();
    expect(installStep.shell).toBe('bash');
    expect(installStep.run).toContain('python -m pip install --upgrade pip');
    expect(installStep.run).toContain('if [ -f requirements-dev.txt ]');
  });

  test('should have guarded client build step', () => {
    const buildStep = steps.find(s => s.name === 'Build client (guarded)');
    expect(buildStep).toBeDefined();
    expect(buildStep.shell).toBe('bash');
    expect(buildStep.run).toContain('if [ -f client/package.json ]');
    expect(buildStep.run).toContain('npm run build --if-present');
  });
});

describe('CI Workflow - Testing Steps', () => {
  let steps: any[];

  beforeAll(() => {
    const workflowContent = fs.readFileSync(CI_WORKFLOW_PATH, 'utf8');
    const workflow = yaml.load(workflowContent) as any;
    steps = workflow.jobs['build-and-qa'].steps;
  });

  test('should run root unit tests with conditional execution', () => {
    const testStep = steps.find(s => s.name === 'Unit tests (root)');
    expect(testStep).toBeDefined();
    expect(testStep.if).toBe("${{ hashFiles('package.json') != '' }}");
    expect(testStep.run).toContain('npm test -- --ci --reporters=default');
  });

  test('should run client unit tests with conditional execution', () => {
    const testStep = steps.find(s => s.name === 'Unit tests (client)');
    expect(testStep).toBeDefined();
    expect(testStep.if).toBe("${{ hashFiles('client/package.json') != '' }}");
    expect(testStep['working-directory']).toBe('client');
    expect(testStep.run).toContain('npm test -- --ci --reporters=default');
  });
});

describe('CI Workflow - Deterministic Preview Generation', () => {
  let steps: any[];

  beforeAll(() => {
    const workflowContent = fs.readFileSync(CI_WORKFLOW_PATH, 'utf8');
    const workflow = yaml.load(workflowContent) as any;
    steps = workflow.jobs['build-and-qa'].steps;
  });

  test('should have deterministic preview production step', () => {
    const previewStep = steps.find(s => s.name === 'Produce deterministic preview & ffprobe');
    expect(previewStep).toBeDefined();
    expect(previewStep.shell).toBe('bash');
  });

  test('should create required output directories', () => {
    const previewStep = steps.find(s => s.name === 'Produce deterministic preview & ffprobe');
    expect(previewStep.run).toContain('mkdir -p out artifacts');
  });

  test('should generate fallback video with FFmpeg if needed', () => {
    const previewStep = steps.find(s => s.name === 'Produce deterministic preview & ffprobe');
    expect(previewStep.run).toContain('if [ ! -f out/preview_with_audio.mp4 ]');
    expect(previewStep.run).toContain('ffmpeg');
    expect(previewStep.run).toContain('-f lavfi -i color=c=black:s=1280x720:d=1');
    expect(previewStep.run).toContain('-f lavfi -i anullsrc');
    expect(previewStep.run).toContain('-c:v libx264 -pix_fmt yuv420p -c:a aac');
  });

  test('should generate ffprobe JSON metadata', () => {
    const previewStep = steps.find(s => s.name === 'Produce deterministic preview & ffprobe');
    expect(previewStep.run).toContain('ffprobe');
    expect(previewStep.run).toContain('-print_format json');
    expect(previewStep.run).toContain('artifacts/preview_ffprobe.json');
  });

  test('should create junit report placeholder', () => {
    const previewStep = steps.find(s => s.name === 'Produce deterministic preview & ffprobe');
    expect(previewStep.run).toContain('mkdir -p tests/golden/reports');
    expect(previewStep.run).toContain('junit.xml');
  });

  test('should copy preview with audio to preview.mp4', () => {
    const previewStep = steps.find(s => s.name === 'Produce deterministic preview & ffprobe');
    expect(previewStep.run).toContain('cp -f out/preview_with_audio.mp4 out/preview.mp4');
  });
});

describe('CI Workflow - Quality Gate Steps', () => {
  let steps: any[];

  beforeAll(() => {
    const workflowContent = fs.readFileSync(CI_WORKFLOW_PATH, 'utf8');
    const workflow = yaml.load(workflowContent) as any;
    steps = workflow.jobs['build-and-qa'].steps;
  });

  test('should have tolerant audio ebur128 analysis', () => {
    const audioStep = steps.find(s => s.name === 'Audio ebur128 (tolerant)');
    expect(audioStep).toBeDefined();
    expect(audioStep.shell).toBe('bash');
    expect(audioStep.run).toContain('ffmpeg');
    expect(audioStep.run).toContain('ebur128');
    expect(audioStep.run).toContain('|| true');
  });

  test('should have Unix provenance capture with guards', () => {
    const provenanceStep = steps.find(s => s.name === 'Capture provenance (Unix)');
    expect(provenanceStep).toBeDefined();
    expect(provenanceStep.if).toBe("runner.os != 'Windows'");
    expect(provenanceStep.shell).toBe('bash');
    expect(provenanceStep.run).toContain('if [ -f scripts/capture_provenance.sh ]');
    expect(provenanceStep.run).toContain('|| true');
  });

  test('should have Windows provenance capture with guards', () => {
    const provenanceStep = steps.find(s => s.name === 'Capture provenance (Windows)');
    expect(provenanceStep).toBeDefined();
    expect(provenanceStep.if).toBe("runner.os == 'Windows'");
    expect(provenanceStep.shell).toBe('pwsh');
    expect(provenanceStep.run).toContain('Test-Path');
    expect(provenanceStep.run).toContain('scripts/capture_provenance.ps1');
  });

  test('should have Unix audio gate with tolerance', () => {
    const audioGateStep = steps.find(s => s.name === 'Audio gate (tolerant)');
    expect(audioGateStep).toBeDefined();
    expect(audioGateStep.if).toBe("runner.os != 'Windows'");
    expect(audioGateStep.run).toContain('check_audio_compliance.py');
    expect(audioGateStep.run).toContain('|| true');
  });

  test('should have Windows audio gate with tolerance', () => {
    const audioGateStep = steps.find(s => s.name === 'Audio gate (Windows, tolerant)');
    expect(audioGateStep).toBeDefined();
    expect(audioGateStep.if).toBe("runner.os == 'Windows'");
    expect(audioGateStep.run).toContain('check_audio_compliance.ps1');
    expect(audioGateStep.run).toContain('exit 0');
  });

  test('should have Unix container gate with tolerance', () => {
    const containerStep = steps.find(s => s.name === 'Container gate (tolerant)');
    expect(containerStep).toBeDefined();
    expect(containerStep.if).toBe("runner.os != 'Windows'");
    expect(containerStep.run).toContain('check_container.sh');
    expect(containerStep.run).toContain('|| true');
  });

  test('should have Windows container gate with tolerance', () => {
    const containerStep = steps.find(s => s.name === 'Container gate (Windows, tolerant)');
    expect(containerStep).toBeDefined();
    expect(containerStep.if).toBe("runner.os == 'Windows'");
    expect(containerStep.run).toContain('check_container.ps1');
    expect(containerStep.run).toContain('exit 0');
  });
});

describe('CI Workflow - Artifact Upload', () => {
  let steps: any[];

  beforeAll(() => {
    const workflowContent = fs.readFileSync(CI_WORKFLOW_PATH, 'utf8');
    const workflow = yaml.load(workflowContent) as any;
    steps = workflow.jobs['build-and-qa'].steps;
  });

  test('should upload artifacts with correct configuration', () => {
    const uploadStep = steps.find(s => s.name === 'Upload artifacts');
    expect(uploadStep).toBeDefined();
    expect(uploadStep.uses).toBe('actions/upload-artifact@v4');
  });

  test('should use matrix OS in artifact name', () => {
    const uploadStep = steps.find(s => s.name === 'Upload artifacts');
    expect(uploadStep.with.name).toBe('qa-${{ matrix.os }}');
  });

  test('should upload both preview files and artifacts', () => {
    const uploadStep = steps.find(s => s.name === 'Upload artifacts');
    expect(uploadStep.with.path).toContain('artifacts/**');
    expect(uploadStep.with.path).toContain('out/preview_with_audio.mp4');
    expect(uploadStep.with.path).toContain('out/preview.mp4');
  });

  test('should set if-no-files-found to warn', () => {
    const uploadStep = steps.find(s => s.name === 'Upload artifacts');
    expect(uploadStep.with['if-no-files-found']).toBe('warn');
  });
});

describe('CI Workflow - Cross-Platform Compatibility', () => {
  let steps: any[];

  beforeAll(() => {
    const workflowContent = fs.readFileSync(CI_WORKFLOW_PATH, 'utf8');
    const workflow = yaml.load(workflowContent) as any;
    steps = workflow.jobs['build-and-qa'].steps;
  });

  test('should use bash shell for guarded steps', () => {
    const guardedSteps = steps.filter(s => 
      s.name && s.name.includes('guarded')
    );
    expect(guardedSteps.length).toBeGreaterThan(0);
    guardedSteps.forEach(step => {
      expect(step.shell).toBe('bash');
    });
  });

  test('should have OS-specific conditional steps for Unix', () => {
    const unixSteps = steps.filter(s => 
      s.if && s.if.includes("runner.os != 'Windows'")
    );
    expect(unixSteps.length).toBeGreaterThan(0);
    unixSteps.forEach(step => {
      expect(step.shell).toBe('bash');
    });
  });

  test('should have OS-specific conditional steps for Windows', () => {
    const windowsSteps = steps.filter(s => 
      s.if && s.if.includes("runner.os == 'Windows'")
    );
    expect(windowsSteps.length).toBeGreaterThan(0);
    windowsSteps.forEach(step => {
      expect(step.shell).toBe('pwsh');
    });
  });
});

describe('CI Workflow - Deterministic Build Features', () => {
  let workflowContent: string;

  beforeAll(() => {
    workflowContent = fs.readFileSync(CI_WORKFLOW_PATH, 'utf8');
  });

  test('should use npm ci instead of npm install for determinism', () => {
    expect(workflowContent).toContain('npm ci');
    expect(workflowContent).not.toContain('npm install');
  });

  test('should use specific versions for GitHub actions', () => {
    expect(workflowContent).toMatch(/actions\/checkout@v\d+/);
    expect(workflowContent).toMatch(/actions\/setup-node@v\d+/);
    expect(workflowContent).toMatch(/actions\/setup-python@v\d+/);
    expect(workflowContent).toMatch(/actions\/upload-artifact@v\d+/);
  });

  test('should have npm caching enabled for faster builds', () => {
    expect(workflowContent).toContain("cache: 'npm'");
  });

  test('should use --ci flag for test execution', () => {
    expect(workflowContent).toContain('npm test -- --ci');
  });

  test('should ensure all quality gates are tolerant (non-blocking)', () => {
    const tolerantSteps = [
      'Audio ebur128 (tolerant)',
      'Audio gate (tolerant)',
      'Audio gate (Windows, tolerant)',
      'Container gate (tolerant)',
      'Container gate (Windows, tolerant)'
    ];
    
    tolerantSteps.forEach(stepName => {
      expect(workflowContent).toContain(stepName);
    });
  });
});

describe('CI Workflow - Error Handling', () => {
  let workflowContent: string;

  beforeAll(() => {
    workflowContent = fs.readFileSync(CI_WORKFLOW_PATH, 'utf8');
  });

  test('should have fallback messages for missing files', () => {
    expect(workflowContent).toContain('no root package.json');
    expect(workflowContent).toContain('no client');
    expect(workflowContent).toContain('no requirements-dev.txt');
    expect(workflowContent).toContain('skip provenance');
    expect(workflowContent).toContain('skip audio gate');
    expect(workflowContent).toContain('skip container gate');
  });

  test('should use conditional execution with file existence checks', () => {
    expect(workflowContent).toContain('if [ -f package.json ]');
    expect(workflowContent).toContain('if [ -f client/package.json ]');
    expect(workflowContent).toContain('if [ -f requirements-dev.txt ]');
  });

  test('should have fallback video generation', () => {
    expect(workflowContent).toContain('if [ ! -f out/preview_with_audio.mp4 ]');
    expect(workflowContent).toContain('color=c=black');
  });
});

describe('CI Workflow - Script Completeness', () => {
  let steps: any[];

  beforeAll(() => {
    const workflowContent = fs.readFileSync(CI_WORKFLOW_PATH, 'utf8');
    const workflow = yaml.load(workflowContent) as any;
    steps = workflow.jobs['build-and-qa'].steps;
  });

  test('should have all critical steps defined', () => {
    const criticalSteps = [
      'Checkout',
      'Setup Node',
      'Setup Python',
      'Ensure FFmpeg',
      'Install root deps (guarded)',
      'Install client deps (guarded)',
      'Unit tests (root)',
      'Unit tests (client)',
      'Produce deterministic preview & ffprobe',
      'Upload artifacts'
    ];

    criticalSteps.forEach(stepName => {
      const step = steps.find(s => s.name === stepName);
      expect(step).toBeDefined();
    });
  });

  test('should maintain proper step order', () => {
    const stepNames = steps.map(s => s.name);
    const checkoutIndex = stepNames.indexOf('Checkout');
    const nodeSetupIndex = stepNames.indexOf('Setup Node');
    const installIndex = stepNames.indexOf('Install root deps (guarded)');
    const testIndex = stepNames.indexOf('Unit tests (root)');
    const uploadIndex = stepNames.indexOf('Upload artifacts');

    expect(checkoutIndex).toBeLessThan(nodeSetupIndex);
    expect(nodeSetupIndex).toBeLessThan(installIndex);
    expect(installIndex).toBeLessThan(testIndex);
    expect(testIndex).toBeLessThan(uploadIndex);
  });
});