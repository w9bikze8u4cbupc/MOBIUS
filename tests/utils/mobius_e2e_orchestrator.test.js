const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { runMobiusE2E, parseArgs } = require('../../scripts/run_mobius_e2e.cjs');

describe('runMobiusE2E', () => {
  const tmpDir = path.join(__dirname, '..', '..', 'out', 'test-mobius-e2e');

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('executes injected steps in order', async () => {
    const calls = [];
    const mockIngestion = jest.fn(async () => {
      calls.push('ingestion');
      return { assets: {}, ingestionContractVersion: '1.0.0' };
    });
    const mockStoryboard = jest.fn(async () => {
      calls.push('storyboard');
      return { scenes: [{ id: 'scene-1', durationSec: 2 }], storyboardContractVersion: '1.0.0' };
    });
    const mockRender = jest.fn(() => {
      calls.push('render');
      const renderDir = path.join(tmpDir, 'render');
      fs.mkdirSync(renderDir, { recursive: true });
      const containerPath = path.join(renderDir, 'container.json');
      const junitPath = path.join(renderDir, 'golden.junit.xml');
      fs.writeFileSync(containerPath, JSON.stringify({ referenceDuration: 2, videos: [{}], captions: [{}], manifest: {} }));
      fs.writeFileSync(junitPath, '<testsuite name="demo" tests="1" failures="0" errors="0"></testsuite>');
      return { containerPath, junitPath };
    });
    const mockChecklist = jest.fn(() => {
      calls.push('checklist');
      return { status: 0, stdout: 'PASS' };
    });

    const summary = await runMobiusE2E(
      { game: 'test', outputDir: tmpDir },
      {
        runIngestion: mockIngestion,
        runStoryboard: mockStoryboard,
        renderJob: mockRender,
        runChecklist: mockChecklist,
        buildConfig: jest.fn((ingest, storyboard) => {
          calls.push('render-config');
          return { timing: { totalDurationSec: storyboard.scenes[0].durationSec } };
        }),
      }
    );

    expect(summary.success).toBe(true);
    expect(calls).toEqual(['ingestion', 'storyboard', 'render-config', 'render', 'checklist']);
  });

  it('renders a real, checksummed MP4 through the production E2E CLI', () => {
    jest.setTimeout(120000);

    const projectRoot = path.resolve(__dirname, '..', '..');
    const game = 'real-preview-test';
    const renderDir = path.join(projectRoot, 'out', 'mobius-e2e', game, 'preview-render');
    fs.rmSync(path.join(projectRoot, 'out', 'mobius-e2e', game), { recursive: true, force: true });

    const stdout = execFileSync('node', [
      'scripts/run_mobius_e2e.cjs',
      '--game', game,
      '--lang', 'en',
      '--resolution', '1280x720',
      '--mode', 'preview',
    ], {
      cwd: projectRoot,
      encoding: 'utf8',
      timeout: 120000,
    });

    expect(stdout).toContain('E2E PASS (real MP4 rendered and checklist validated)');

    const videoPath = path.join(renderDir, 'preview.mp4');
    const captionPath = path.join(renderDir, 'captions_en.srt');
    const containerPath = path.join(renderDir, 'container.json');
    expect(fs.existsSync(videoPath)).toBe(true);
    expect(fs.statSync(videoPath).size).toBeGreaterThan(10240);
    expect(fs.existsSync(captionPath)).toBe(true);

    const container = JSON.parse(fs.readFileSync(containerPath, 'utf8'));
    expect(container.media.video).toHaveLength(1);
    expect(container.media.video[0].codec).toBe('h264');
    expect(container.media.video[0].sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(container.media.captions).toHaveLength(1);
    expect(container.media.captions[0].sha256).toMatch(/^[a-f0-9]{64}$/);

    const probe = JSON.parse(execFileSync('ffprobe', [
      '-v', 'error', '-print_format', 'json', '-show_streams', videoPath,
    ], { encoding: 'utf8' }));
    const video = probe.streams.find((stream) => stream.codec_type === 'video');
    expect(video.codec_name).toBe('h264');
    expect(video.width).toBe(1280);
    expect(video.height).toBe(720);
  });
});

describe('parseArgs', () => {
  it('parses CLI style flags', () => {
    const parsed = parseArgs(['--game', 'demo', '--lang', 'fr', '--mode', 'preview']);
    expect(parsed).toEqual({ game: 'demo', lang: 'fr', mode: 'preview' });
  });
});
