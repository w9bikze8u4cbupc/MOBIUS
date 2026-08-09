const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const REPOSITORY_ROOT = path.resolve(__dirname, '../..');
const RENDER_SCRIPT = path.join(REPOSITORY_ROOT, 'scripts', 'render-remotion.mjs');
const PLACEHOLDER_IMAGE = path.join(REPOSITORY_ROOT, 'tests', 'fixtures', 'images', 'test-bg-100x100.png');

jest.setTimeout(180000);

describe('Remotion offline MP4 render', () => {
  let temporaryDirectory;
  let outputDirectory;
  let outputPath;

  beforeAll(() => {
    temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'mobius-remotion-test-'));
    outputDirectory = path.join(temporaryDirectory, 'output');
    outputPath = path.join(outputDirectory, 'mobius-tutorial.mp4');

    const configPath = path.join(temporaryDirectory, 'scenes.json');
    fs.writeFileSync(configPath, JSON.stringify([
      {
        id: 'gallery-scene',
        narrationText: 'Use local fixtures to demonstrate the animated media gallery.',
        imageUrls: [PLACEHOLDER_IMAGE, PLACEHOLDER_IMAGE],
        sectionTitle: 'Animated gallery scene',
        themeBorderColor: '#52d6c5',
        durationInFrames: 15,
      },
      {
        id: 'legacy-scene',
        narrationText: 'The legacy single image input remains supported in a timeline.',
        imageUrl: PLACEHOLDER_IMAGE,
        sectionTitle: 'Legacy input scene',
        themeBorderColor: '#E91E63',
        durationInFrames: 15,
      },
    ]), 'utf8');

    execFileSync(process.execPath, [
      RENDER_SCRIPT,
      configPath,
      '--out-dir',
      outputDirectory,
    ], {
      cwd: REPOSITORY_ROOT,
      encoding: 'utf8',
      stdio: 'pipe',
      timeout: 150000,
    });
  });

  afterAll(() => {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  });

  test('renders one transition-enabled MP4 from gallery and legacy local-image scenes', () => {
    expect(fs.existsSync(outputPath)).toBe(true);
    expect(fs.statSync(outputPath).size).toBeGreaterThan(0);
  });
});
