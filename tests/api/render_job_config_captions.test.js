const fs = require('fs');
const path = require('path');

const { buildRenderJobConfig } = require('../../src/api/renderJobConfig.js');

const CONFIG_DIR = path.join(process.cwd(), 'config');
const CAPTIONS_GENERATED_PATH = path.join(CONFIG_DIR, 'captions.generated.json');
const LOCALIZATION_GENERATED_PATH = path.join(CONFIG_DIR, 'localization.generated.json');

const ingestionManifest = {
  version: '1.0.0',
  document: { id: 'demo', title: 'Demo Game' },
  assets: {
    components: [{ id: 'comp-1', hash: 'hash-comp-1' }],
    pages: [{ page: 1, hash: 'page-1-hash' }],
  },
};

const storyboardManifest = {
  storyboardContractVersion: '1.1.0',
  game: { name: 'Demo Game' },
  resolution: { width: 1920, height: 1080, fps: 30 },
  scenes: [{ id: 'intro', type: 'intro', durationSec: 5, index: 0 }],
};

const captionsConfig = {
  format: 'srt',
  encoding: 'utf8',
  languages: ['en', 'fr'],
};

const localizationConfig = {
  defaultLocale: 'en-US',
  subtitleNamingPattern: '{game}-{locale}.srt',
  subtitleLocaleCodes: {
    'en-US': 'en',
    'fr-FR': 'fr',
  },
};

function writeGeneratedConfigs() {
  fs.writeFileSync(CAPTIONS_GENERATED_PATH, JSON.stringify(captionsConfig));
  fs.writeFileSync(LOCALIZATION_GENERATED_PATH, JSON.stringify(localizationConfig));
}

function cleanupGeneratedConfigs() {
  [CAPTIONS_GENERATED_PATH, LOCALIZATION_GENERATED_PATH].forEach((p) => {
    if (fs.existsSync(p)) fs.unlinkSync(p);
  });
}

describe('buildRenderJobConfig captions', () => {
  beforeEach(() => {
    writeGeneratedConfigs();
  });

  afterEach(() => {
    cleanupGeneratedConfigs();
  });

  it('builds caption tracks with naming pattern and burn-in flag', () => {
    const config = buildRenderJobConfig({
      projectId: 'p-caption',
      ingestionManifest,
      storyboardManifest,
      lang: 'en',
      captionLocales: ['en-US', 'fr-FR'],
      burnInCaptions: true,
    });

    expect(config.assets.captions).toHaveLength(2);
    expect(config.assets.captions[0]).toMatchObject({
      languageCode: 'en',
      locale: 'en-US',
      type: 'burnin',
      path: 'demo-game-en.srt',
      format: 'srt',
    });
    expect(config.options.burnInCaptions).toBe(true);
    expect(config.localization.localeCodes['fr-FR']).toBe('fr');
  });

  it('defaults to sidecar captions using default locale when none provided', () => {
    const config = buildRenderJobConfig({
      projectId: 'p-default',
      ingestionManifest,
      storyboardManifest,
      lang: 'en',
    });

    expect(config.assets.captions).toHaveLength(1);
    expect(config.assets.captions[0].type).toBe('sidecar');
    expect(config.assets.captions[0].locale).toBe('en-US');
    expect(config.options.burnInCaptions).toBe(false);
  });

  it('resolves locale codes from rules.subtitleNaming when top-level locales are metadata objects', () => {
    // Simulate the real config/localization.json shape where locales contains
    // rich metadata objects and the actual string codes live under rules.
    const metadataLocalizationConfig = {
      defaultLocale: 'en-US',
      locales: {
        'en-US': { tone: 'warm, beginner-friendly' },
        'fr-FR': { tone: 'formal-neutral' },
      },
      rules: {
        subtitleNaming: {
          pattern: '{game}-{locale}.srt',
          locales: { 'en-US': 'en', 'fr-FR': 'fr' },
        },
      },
    };

    fs.writeFileSync(LOCALIZATION_GENERATED_PATH, JSON.stringify(metadataLocalizationConfig));

    const config = buildRenderJobConfig({
      projectId: 'p-metadata-fallback',
      ingestionManifest,
      storyboardManifest,
      lang: 'en',
      captionLocales: ['en-US', 'fr-FR'],
      burnInCaptions: true,
    });

    expect(config.assets.captions).toHaveLength(2);
    expect(config.assets.captions[0]).toMatchObject({
      languageCode: 'en',
      locale: 'en-US',
      path: 'demo-game-en.srt',
    });
    expect(config.assets.captions[1]).toMatchObject({
      languageCode: 'fr',
      locale: 'fr-FR',
      path: 'demo-game-fr.srt',
    });
    // Ensure no [object Object] leaked into any path
    config.assets.captions.forEach((track) => {
      expect(track.path).not.toContain('[object Object]');
      expect(typeof track.languageCode).toBe('string');
    });
  });
});
