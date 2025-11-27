const path = require('path');
const fs = require('fs');
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
});

describe('parseArgs', () => {
  it('parses CLI style flags', () => {
    const parsed = parseArgs(['--game', 'demo', '--lang', 'fr', '--mode', 'preview']);
    expect(parsed).toEqual({ game: 'demo', lang: 'fr', mode: 'preview' });
  });
});
