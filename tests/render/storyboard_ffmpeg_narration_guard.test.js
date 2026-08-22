const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const RENDERER = path.resolve(__dirname, '../../scripts/render-storyboard-ffmpeg.mjs');

describe('storyboard narration readiness guard', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mobius-narration-guard-'));
  });

  afterEach(() => fs.rmSync(tempDir, { recursive: true, force: true }));

  test('rejects a narrated scene without a readable audio asset even in dry-run mode', () => {
    const configPath = path.join(tempDir, 'config.json');
    fs.writeFileSync(configPath, JSON.stringify({
      projectId: 'narration-guard',
      video: { resolution: { width: 1280, height: 720 }, fps: 30 },
      scenes: [{
        id: 'spoken-scene',
        durationSec: 4,
        narrationText: 'Cette scène doit avoir une narration réelle.',
        background: { color: '#101820' },
        overlays: [],
      }],
    }));

    const result = spawnSync('node', [RENDERER, '--config', configPath, '--dry-run'], {
      cwd: path.resolve(__dirname, '../..'),
      encoding: 'utf8',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('narrationText requires a readable audio.file');
  });
});
