/**
 * Tests for SRT format writer.
 */

let formatSrtTimestamp, sanitizeSrtText, formatSrtCue, generateSrtContent, getSrtMetadata;

beforeAll(async () => {
  const mod = await import('../../src/services/srtWriter.js');
  formatSrtTimestamp = mod.formatSrtTimestamp;
  sanitizeSrtText = mod.sanitizeSrtText;
  formatSrtCue = mod.formatSrtCue;
  generateSrtContent = mod.generateSrtContent;
  getSrtMetadata = mod.getSrtMetadata;
});

describe('srtWriter', () => {
  describe('formatSrtTimestamp', () => {
    test('formats zero', () => {
      expect(formatSrtTimestamp(0)).toBe('00:00:00,000');
    });

    test('formats seconds and milliseconds', () => {
      expect(formatSrtTimestamp(3500)).toBe('00:00:03,500');
    });

    test('formats minutes', () => {
      expect(formatSrtTimestamp(65000)).toBe('00:01:05,000');
    });

    test('formats hours', () => {
      expect(formatSrtTimestamp(3661500)).toBe('01:01:01,500');
    });

    test('handles negative as zero', () => {
      expect(formatSrtTimestamp(-100)).toBe('00:00:00,000');
    });
  });

  describe('sanitizeSrtText', () => {
    test('preserves normal text', () => {
      expect(sanitizeSrtText('Hello world.')).toBe('Hello world.');
    });

    test('removes control characters', () => {
      expect(sanitizeSrtText('Hello\x00world')).toBe('Helloworld');
    });

    test('normalizes whitespace', () => {
      expect(sanitizeSrtText('  too   many   spaces  ')).toBe('too many spaces');
    });

    test('handles empty/null', () => {
      expect(sanitizeSrtText('')).toBe('');
      expect(sanitizeSrtText(null)).toBe('');
    });
  });

  describe('formatSrtCue', () => {
    test('formats a complete cue block', () => {
      const cue = { index: 1, startMs: 0, endMs: 3000, text: 'Hello.' };
      const result = formatSrtCue(cue);
      expect(result).toBe('1\n00:00:00,000 --> 00:00:03,000\nHello.');
    });

    test('formats multi-line text', () => {
      const cue = { index: 2, startMs: 3000, endMs: 7000, text: 'Line one.\nLine two.' };
      const result = formatSrtCue(cue);
      expect(result).toContain('Line one.\nLine two.');
    });
  });

  describe('generateSrtContent', () => {
    test('generates complete SRT file', () => {
      const cues = [
        { index: 1, startMs: 0, endMs: 3000, text: 'First cue.' },
        { index: 2, startMs: 3000, endMs: 7000, text: 'Second cue.' },
      ];
      const srt = generateSrtContent(cues);
      expect(srt).toContain('1\n00:00:00,000 --> 00:00:03,000\nFirst cue.');
      expect(srt).toContain('2\n00:00:03,000 --> 00:00:07,000\nSecond cue.');
      expect(srt.endsWith('\n')).toBe(true);
    });

    test('empty cues returns empty string', () => {
      expect(generateSrtContent([])).toBe('');
    });
  });

  describe('getSrtMetadata', () => {
    test('returns cue count, duration, and language', () => {
      const cues = [
        { index: 1, startMs: 0, endMs: 3000, language: 'en' },
        { index: 2, startMs: 3000, endMs: 8000, language: 'en' },
      ];
      const meta = getSrtMetadata(cues);
      expect(meta.cueCount).toBe(2);
      expect(meta.totalDurationMs).toBe(8000);
      expect(meta.language).toBe('en');
    });

    test('empty cues returns zero metadata', () => {
      const meta = getSrtMetadata([]);
      expect(meta.cueCount).toBe(0);
      expect(meta.totalDurationMs).toBe(0);
      expect(meta.language).toBeNull();
    });
  });
});
