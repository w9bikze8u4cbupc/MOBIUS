const fs = require('fs');
const os = require('os');
const path = require('path');
const { packageRenderJob } = require('../../src/api/packaging.js');

const CONFIG_DIR = path.join(process.cwd(), 'config');
const LOCALIZATION_GENERATED_PATH = path.join(CONFIG_DIR, 'localization.generated.json');

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'packaging-captions-'));
}

function cleanup(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

const localizationConfig = {
  subtitleLocaleCodes: {
    'en-US': 'en',
    'fr-FR': 'fr',
  },
};

describe('packageRenderJob captions', () => {
  let tempDir;

  beforeAll(() => {
    fs.writeFileSync(LOCALIZATION_GENERATED_PATH, JSON.stringify(localizationConfig));
  });

  afterAll(() => {
    if (fs.existsSync(LOCALIZATION_GENERATED_PATH)) {
      fs.unlinkSync(LOCALIZATION_GENERATED_PATH);
    }
  });

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanup(tempDir);
  });

  it('does not serialize locale metadata objects as caption language codes', async () => {
    fs.writeFileSync(LOCALIZATION_GENERATED_PATH, JSON.stringify({
      locales: { 'en-US': { tone: 'warm, beginner-friendly, no slang' } },
    }));
    const captionEn = path.join(tempDir, 'demo-en.srt');
    fs.writeFileSync(captionEn, '1\n00:00:00,000 --> 00:00:01,000\nHello');

    const result = await packageRenderJob({ jobId: 'job-locale-object', outputDir: tempDir, jobConfig: {} });
    const manifest = JSON.parse(fs.readFileSync(result.manifestPath, 'utf8'));

    expect(manifest.media.captions[0]).toMatchObject({
      language: 'en',
      languageCode: 'en',
    });
    expect(typeof manifest.media.captions[0].languageCode).toBe('string');
  });

  it('captures caption metadata and checksums in container.json', async () => {
    fs.writeFileSync(LOCALIZATION_GENERATED_PATH, JSON.stringify(localizationConfig));
    const captionEn = path.join(tempDir, 'demo-en.srt');
    const captionFr = path.join(tempDir, 'demo-fr.srt');
    fs.writeFileSync(captionEn, '1\n00:00:00,000 --> 00:00:01,000\nHello');
    fs.writeFileSync(captionFr, '1\n00:00:00,000 --> 00:00:01,000\nBonjour');

    const result = await packageRenderJob({ jobId: 'job-cap', outputDir: tempDir, jobConfig: { timing: { totalDurationSec: 5 } } });
    const manifest = JSON.parse(fs.readFileSync(result.manifestPath, 'utf8'));

    expect(manifest.media.captions).toHaveLength(2);
    expect(manifest.media.captions[0]).toMatchObject({
      kind: 'captions',
      format: 'srt',
    });
    const frEntry = manifest.media.captions.find((entry) => entry.languageCode === 'fr');
    expect(frEntry.locale).toBe('fr-FR');
    expect(frEntry.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(manifest.localization.subtitleLocaleCodes['en-US']).toBe('en');
  });

  it('preserves a regional caption code provided by the render job', async () => {
    const captionPath = path.join(tempDir, 'tutorial.fr-CA.srt');
    fs.writeFileSync(captionPath, '1\n00:00:00,000 --> 00:00:01,000\nBonjour');

    const result = await packageRenderJob({
      jobId: 'regional-caption-job',
      outputDir: tempDir,
      jobConfig: {
        localization: { subtitleLocaleCodes: { 'fr-CA': 'fr-CA' } },
      },
    });
    const manifest = JSON.parse(fs.readFileSync(result.manifestPath, 'utf8'));

    expect(manifest.media.captions).toContainEqual(expect.objectContaining({
      path: 'tutorial.fr-CA.srt',
      language: 'fr-CA',
      languageCode: 'fr-CA',
      locale: 'fr-CA',
    }));
  });
});
