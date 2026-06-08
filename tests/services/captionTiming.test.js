/**
 * Tests for deterministic caption cue generation and timing validation.
 */

let generateCaptionCues, validateCaptionCues, splitTextIntoCues;

beforeAll(async () => {
  const mod = await import('../../src/services/captionTiming.js');
  generateCaptionCues = mod.generateCaptionCues;
  validateCaptionCues = mod.validateCaptionCues;
  splitTextIntoCues = mod.splitTextIntoCues;
});

describe('captionTiming', () => {
  describe('splitTextIntoCues', () => {
    test('short text returns single segment', () => {
      expect(splitTextIntoCues('Hello world.')).toEqual(['Hello world.']);
    });

    test('long text splits on sentence boundaries', () => {
      const long = 'First sentence. Second sentence. Third sentence that is quite long indeed.';
      const result = splitTextIntoCues(long, 40);
      expect(result.length).toBeGreaterThan(1);
      expect(result.every((s) => s.length <= 80)).toBe(true);
    });

    test('empty text returns single empty string', () => {
      expect(splitTextIntoCues('')).toEqual(['']);
    });
  });

  describe('generateCaptionCues', () => {
    test('generates cues aligned to scene durations', () => {
      const scenes = [
        { id: 's1', durationSec: 3, narration: 'Welcome to the tutorial.' },
        { id: 's2', durationSec: 5, narration: 'Place the board between players.' },
      ];
      const { cues, warnings, totalDurationMs } = generateCaptionCues(scenes);
      expect(cues).toHaveLength(2);
      expect(cues[0].startMs).toBe(0);
      expect(cues[0].endMs).toBe(3000);
      expect(cues[1].startMs).toBe(3000);
      expect(cues[1].endMs).toBe(8000);
      expect(totalDurationMs).toBe(8000);
      expect(warnings).toHaveLength(0);
    });

    test('skips scenes without narration', () => {
      const scenes = [
        { id: 's1', durationSec: 2 },
        { id: 's2', durationSec: 4, narration: 'Hello.' },
      ];
      const { cues } = generateCaptionCues(scenes);
      expect(cues).toHaveLength(1);
      expect(cues[0].sceneId).toBe('s2');
      expect(cues[0].startMs).toBe(2000);
    });

    test('splits long narration into multiple cues within scene', () => {
      const longText = 'First sentence of setup. Second sentence about components. Third sentence explaining placement.';
      const scenes = [{ id: 's1', durationSec: 9, narration: longText }];
      const { cues } = generateCaptionCues(scenes, { maxCueChars: 40 });
      expect(cues.length).toBeGreaterThan(1);
      expect(cues[cues.length - 1].endMs).toBeLessThanOrEqual(9000);
    });

    test('extracts text from body overlays when no narration field', () => {
      const scenes = [
        { id: 's1', durationSec: 4, overlays: [{ type: 'body', text: 'From overlay.' }] },
      ];
      const { cues } = generateCaptionCues(scenes);
      expect(cues).toHaveLength(1);
      expect(cues[0].text).toBe('From overlay.');
    });

    test('includes language in cues', () => {
      const scenes = [{ id: 's1', durationSec: 3, narration: 'Bonjour.' }];
      const { cues } = generateCaptionCues(scenes, { language: 'fr' });
      expect(cues[0].language).toBe('fr');
    });

    test('empty scenes returns empty cues', () => {
      const { cues, totalDurationMs } = generateCaptionCues([]);
      expect(cues).toHaveLength(0);
      expect(totalDurationMs).toBe(0);
    });
  });

  describe('validateCaptionCues', () => {
    test('valid cues pass', () => {
      const cues = [
        { index: 1, startMs: 0, endMs: 3000, text: 'Hello.' },
        { index: 2, startMs: 3000, endMs: 7000, text: 'World.' },
      ];
      const { valid, warnings } = validateCaptionCues(cues);
      expect(valid).toBe(true);
      expect(warnings).toHaveLength(0);
    });

    test('detects start >= end', () => {
      const cues = [{ index: 1, startMs: 5000, endMs: 3000, text: 'Bad.' }];
      const { valid, warnings } = validateCaptionCues(cues);
      expect(valid).toBe(false);
      expect(warnings[0]).toContain('startMs');
    });

    test('detects overlapping cues', () => {
      const cues = [
        { index: 1, startMs: 0, endMs: 4000, text: 'A.' },
        { index: 2, startMs: 3000, endMs: 6000, text: 'B.' },
      ];
      const { valid, warnings } = validateCaptionCues(cues);
      expect(valid).toBe(false);
      expect(warnings[0]).toContain('overlap');
    });

    test('detects empty text', () => {
      const cues = [{ index: 1, startMs: 0, endMs: 3000, text: '' }];
      const { valid, warnings } = validateCaptionCues(cues);
      expect(valid).toBe(false);
      expect(warnings[0]).toContain('empty');
    });

    test('empty cues array is valid', () => {
      const { valid } = validateCaptionCues([]);
      expect(valid).toBe(true);
    });
  });
});
