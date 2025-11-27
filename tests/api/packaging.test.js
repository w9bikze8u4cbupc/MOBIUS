const fs = require('fs');
const os = require('os');
const path = require('path');
const { packageRenderJob } = require('../../src/api/packaging.js');

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'packaging-test-'));
}

function cleanup(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

describe('packageRenderJob', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanup(tempDir);
  });

  it('writes container.json with media entries and checksums', async () => {
    const videoPath = path.join(tempDir, 'video.mp4');
    const captionPath = path.join(tempDir, 'subtitles.en.srt');
    const imagePath = path.join(tempDir, 'poster.png');

    fs.writeFileSync(videoPath, 'video-content');
    fs.writeFileSync(captionPath, '1\n00:00:00,000 --> 00:00:01,000\nCaption');
    fs.writeFileSync(imagePath, 'fake-image');

    const jobConfig = { timing: { totalDurationSec: 12.5 } };

    const result = await packageRenderJob({ jobId: 'job-123', outputDir: tempDir, jobConfig });

    const manifestOnDisk = JSON.parse(fs.readFileSync(path.join(tempDir, 'container.json'), 'utf8'));

    expect(result.manifestPath).toBe(path.join(tempDir, 'container.json'));
    expect(manifestOnDisk.media.video).toHaveLength(1);
    expect(manifestOnDisk.media.captions).toHaveLength(1);
    expect(manifestOnDisk.media.images).toHaveLength(1);
    expect(manifestOnDisk.referenceDurationSec).toBeCloseTo(12.5);
    expect(manifestOnDisk.media.video[0].sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(manifestOnDisk.media.captions[0].sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(manifestOnDisk.checksums.length).toBeGreaterThanOrEqual(3);
  });

  const zipAvailable = fs.existsSync('/usr/bin/zip');
  (zipAvailable ? it : it.skip)('creates a zip archive when enabled', async () => {
    const videoPath = path.join(tempDir, 'video.mp4');
    fs.writeFileSync(videoPath, 'video-content-zip');

    const previous = process.env.MOBIUS_PACKAGE_ZIP;
    process.env.MOBIUS_PACKAGE_ZIP = 'true';
    try {
      const result = await packageRenderJob({ jobId: 'zip-job', outputDir: tempDir });
      const zipPath = path.join(tempDir, 'zip-job.zip');
      expect(result.zipPath).toBe(zipPath);
      expect(fs.existsSync(zipPath)).toBe(true);
    } finally {
      process.env.MOBIUS_PACKAGE_ZIP = previous;
    }
  });
});
