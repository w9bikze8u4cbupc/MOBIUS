const path = require('path');
const fs = require('fs');
const { generateTutorialScript } = require('../../src/services/tutorialScriptGenerator.cjs');
const { generateStoryboardFromIngestion } = require('../../src/storyboard/storyboard_from_ingestion');
const { validateStoryboard } = require('../../src/validators/storyboardValidator');
const { generateCaptionCues, validateCaptionCues } = require('../../src/services/captionTiming');
const { generateSrtContent, getSrtMetadata } = require('../../src/services/srtWriter');

const FIXTURES = [
  {
    slug: 'gem-collectors',
    fixturePath: path.join(__dirname, '../fixtures/tutorial-vertical-slice/gem-collectors.json'),
  },
  {
    slug: 'hanamikoji',
    fixturePath: path.join(__dirname, '../fixtures/tutorial-vertical-slice/hanamikoji.json'),
  },
].map((entry) => ({
  ...entry,
  fixture: JSON.parse(fs.readFileSync(entry.fixturePath, 'utf-8')),
}));

describe.each(FIXTURES)('Tutorial Vertical Slice – E2E Pipeline (%s)', ({ fixture, slug }) => {
  let script, storyboard, captionResult, srtContent;

  beforeAll(() => {
    // Step 1: Generate script from fixture
    script = generateTutorialScript(fixture);

    // Step 2: Convert script to storyboard
    const ingestionForStoryboard = {
      game: { slug: fixture.gameId, name: fixture.gameName },
      structure: {
        setupSteps: script.segments.map((seg, i) => ({
          id: seg.id,
          order: i,
          text: seg.narration,
          componentRefs: []
        }))
      }
    };
    storyboard = generateStoryboardFromIngestion(ingestionForStoryboard, {
      width: 1920, height: 1080, fps: 30
    });

    // Step 3: Generate captions
    const scenesWithNarration = storyboard.scenes.map((scene, i) => ({
      ...scene,
      narration: script.segments[i] ? script.segments[i].narration : ''
    }));
    captionResult = generateCaptionCues(scenesWithNarration, { language: 'en' });

    // Step 4: Generate SRT
    srtContent = generateSrtContent(captionResult.cues);
  });

  describe('Script Generation', () => {
    it('produces valid segments from fixture', () => {
      expect(script.segments.length).toBeGreaterThan(5);
      expect(script.metadata.eliteS1Valid).toBe(true);
    });

    it('total duration is within target range', () => {
      expect(script.metadata.totalDurationSec).toBeGreaterThan(30);
      expect(script.metadata.totalDurationSec).toBeLessThan(120);
    });
  });

  describe('Storyboard Generation', () => {
    it('produces scenes from script segments', () => {
      // intro + segments + end_card
      expect(storyboard.scenes.length).toBe(script.segments.length + 2);
    });

    it('storyboard has correct game metadata', () => {
      expect(storyboard.game.slug).toBe(fixture.gameId);
      expect(storyboard.game.name).toBe(fixture.gameName);
    });

    it('storyboard passes contract validation', () => {
      const { valid, errors } = validateStoryboard(storyboard, { contractVersion: '1.1.0' });
      expect({ valid, errors }).toEqual({ valid: true, errors: [] });
    });

    it('scenes are properly linked (prev/next)', () => {
      for (let i = 0; i < storyboard.scenes.length; i++) {
        const scene = storyboard.scenes[i];
        if (i === 0) expect(scene.prevSceneId).toBeNull();
        else expect(scene.prevSceneId).toBe(storyboard.scenes[i - 1].id);
        if (i === storyboard.scenes.length - 1) expect(scene.nextSceneId).toBeNull();
        else expect(scene.nextSceneId).toBe(storyboard.scenes[i + 1].id);
      }
    });

    it('first scene is intro, last is end_card', () => {
      expect(storyboard.scenes[0].type).toBe('intro');
      expect(storyboard.scenes[storyboard.scenes.length - 1].type).toBe('end_card');
    });
  });

  describe('Caption Generation', () => {
    it('produces cues from storyboard scenes', () => {
      expect(captionResult.cues.length).toBeGreaterThan(0);
    });

    it('cues pass timing validation', () => {
      const { valid } = validateCaptionCues(captionResult.cues);
      expect(valid).toBe(true);
    });

    it('total caption duration matches storyboard', () => {
      const storyboardDurationMs = storyboard.scenes.reduce((sum, s) => sum + s.durationSec * 1000, 0);
      // Caption duration should not exceed storyboard duration
      expect(captionResult.totalDurationMs).toBeLessThanOrEqual(Math.ceil(storyboardDurationMs));
    });
  });

  describe('SRT Output', () => {
    it('produces valid SRT content', () => {
      expect(srtContent).toBeTruthy();
      expect(srtContent.length).toBeGreaterThan(50);
    });

    it('SRT contains proper timestamp format', () => {
      expect(srtContent).toMatch(/\d{2}:\d{2}:\d{2},\d{3} --> \d{2}:\d{2}:\d{2},\d{3}/);
    });

    it('SRT metadata is consistent', () => {
      const meta = getSrtMetadata(captionResult.cues);
      expect(meta.cueCount).toBe(captionResult.cues.length);
      expect(meta.language).toBe('en');
    });
  });

  describe('Render Config', () => {
    it('can produce a valid render config from script', () => {
      const renderConfig = {
        projectId: fixture.gameId,
        video: { resolution: { width: 1920, height: 1080 }, fps: 30 },
        scenes: script.segments.map((seg) => ({
          id: seg.id,
          durationSec: seg.durationSec,
          background: { color: '#2d2d44' },
          overlays: [{ type: 'body', text: seg.narration, position: 'center' }]
        }))
      };

      expect(renderConfig.projectId).toBe(fixture.gameId);
      expect(renderConfig.scenes.length).toBe(script.segments.length);
      renderConfig.scenes.forEach((scene) => {
        expect(scene.durationSec).toBeGreaterThan(0);
        expect(scene.background).toHaveProperty('color');
        expect(scene.overlays.length).toBeGreaterThan(0);
      });
    });
  });
});
