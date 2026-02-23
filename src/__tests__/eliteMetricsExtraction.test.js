// src/__tests__/eliteMetricsExtraction.test.js
// Unit tests for Elite metrics extraction parsers

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, '../..');

// Import parsers
let parseResolution, parseEBUR128, parseSilenceDetect;

beforeAll(async () => {
  const ffprobeModule = await import('../../scripts/elite/parsers/ffprobe_stream_parse.mjs');
  const ebur128Module = await import('../../scripts/elite/parsers/ffmpeg_ebur128_parse.mjs');
  const silenceModule = await import('../../scripts/elite/parsers/ffmpeg_silencedetect_parse.mjs');
  
  parseResolution = ffprobeModule.parseResolution;
  parseEBUR128 = ebur128Module.parseEBUR128;
  parseSilenceDetect = silenceModule.parseSilenceDetect;
});

describe('Elite Metrics Extraction', () => {
  describe('ffprobe Resolution Parser', () => {
    test('parses valid ffprobe JSON output', () => {
      const fixturePath = join(REPO_ROOT, 'scripts/elite/fixtures/ffprobe_width_height.json');
      const fixtureData = readFileSync(fixturePath, 'utf8');
      
      const result = parseResolution(fixtureData);
      
      expect(result).toEqual({
        width: 1920,
        height: 1080
      });
    });

    test('parses 4K resolution', () => {
      const input = JSON.stringify({
        streams: [
          { width: 3840, height: 2160, codec_type: 'video' }
        ]
      });
      
      const result = parseResolution(input);
      
      expect(result).toEqual({
        width: 3840,
        height: 2160
      });
    });

    test('throws on missing streams', () => {
      const input = JSON.stringify({ streams: [] });
      
      expect(() => parseResolution(input)).toThrow('No streams found');
    });

    test('throws on invalid width/height', () => {
      const input = JSON.stringify({
        streams: [{ width: 'invalid', height: 1080 }]
      });
      
      expect(() => parseResolution(input)).toThrow('Invalid width/height');
    });

    test('throws on malformed JSON', () => {
      const input = '{ invalid json }';
      
      expect(() => parseResolution(input)).toThrow('Failed to parse ffprobe output');
    });
  });

  describe('ffmpeg EBUR128 Parser', () => {
    test('parses valid ebur128 output', () => {
      const fixturePath = join(REPO_ROOT, 'scripts/elite/fixtures/ffmpeg_ebur128_output.txt');
      const fixtureData = readFileSync(fixturePath, 'utf8');
      
      const result = parseEBUR128(fixtureData);
      
      expect(result).toEqual({
        integrated_lufs: -14.1,
        true_peak_dbtp: -1.2
      });
    });

    test('rounds to 1 decimal place', () => {
      const input = `
        Integrated loudness:
          I:         -14.12345 LUFS
        True peak:
          Peak:       -1.23456 dBTP
      `;
      
      const result = parseEBUR128(input);
      
      expect(result.integrated_lufs).toBe(-14.1);
      expect(result.true_peak_dbtp).toBe(-1.2);
    });

    test('handles positive values', () => {
      const input = `
        Integrated loudness:
          I:         -10.5 LUFS
        True peak:
          Peak:       -0.1 dBTP
      `;
      
      const result = parseEBUR128(input);
      
      expect(result.integrated_lufs).toBe(-10.5);
      expect(result.true_peak_dbtp).toBe(-0.1);
    });

    test('throws on missing integrated loudness', () => {
      const input = `
        True peak:
          Peak:       -1.2 dBTP
      `;
      
      expect(() => parseEBUR128(input)).toThrow('Could not find integrated loudness');
    });

    test('throws on missing true peak', () => {
      const input = `
        Integrated loudness:
          I:         -14.1 LUFS
      `;
      
      expect(() => parseEBUR128(input)).toThrow('Could not find true peak');
    });
  });

  describe('ffmpeg Silence Detect Parser', () => {
    test('parses valid silencedetect output', () => {
      const fixturePath = join(REPO_ROOT, 'scripts/elite/fixtures/ffmpeg_silencedetect_output.txt');
      const fixtureData = readFileSync(fixturePath, 'utf8');
      
      const result = parseSilenceDetect(fixtureData);
      
      expect(result).toEqual({
        max_silence_duration: 0.4
      });
    });

    test('returns 0 when no silence detected', () => {
      const input = 'No silence detected in output';
      
      const result = parseSilenceDetect(input);
      
      expect(result).toEqual({
        max_silence_duration: 0
      });
    });

    test('finds maximum among multiple silence runs', () => {
      const input = `
        [silencedetect @ 0x...] silence_end: 10.8 | silence_duration: 0.3
        [silencedetect @ 0x...] silence_end: 25.6 | silence_duration: 1.5
        [silencedetect @ 0x...] silence_end: 50.2 | silence_duration: 0.8
      `;
      
      const result = parseSilenceDetect(input);
      
      expect(result.max_silence_duration).toBe(1.5);
    });

    test('rounds to 1 decimal place', () => {
      const input = `
        [silencedetect @ 0x...] silence_end: 10.8 | silence_duration: 0.12345
      `;
      
      const result = parseSilenceDetect(input);
      
      expect(result.max_silence_duration).toBe(0.1);
    });

    test('handles single silence run', () => {
      const input = `
        [silencedetect @ 0x...] silence_end: 10.8 | silence_duration: 2.5
      `;
      
      const result = parseSilenceDetect(input);
      
      expect(result.max_silence_duration).toBe(2.5);
    });
  });

  describe('Determinism', () => {
    test('ffprobe parser is deterministic', () => {
      const input = JSON.stringify({
        streams: [{ width: 1920, height: 1080 }]
      });
      
      const result1 = parseResolution(input);
      const result2 = parseResolution(input);
      
      expect(result1).toEqual(result2);
      expect(JSON.stringify(result1)).toBe(JSON.stringify(result2));
    });

    test('ebur128 parser is deterministic', () => {
      const input = `
        Integrated loudness:
          I:         -14.1 LUFS
        True peak:
          Peak:       -1.2 dBTP
      `;
      
      const result1 = parseEBUR128(input);
      const result2 = parseEBUR128(input);
      
      expect(result1).toEqual(result2);
      expect(JSON.stringify(result1)).toBe(JSON.stringify(result2));
    });

    test('silencedetect parser is deterministic', () => {
      const input = `
        [silencedetect @ 0x...] silence_end: 10.8 | silence_duration: 0.4
      `;
      
      const result1 = parseSilenceDetect(input);
      const result2 = parseSilenceDetect(input);
      
      expect(result1).toEqual(result2);
      expect(JSON.stringify(result1)).toBe(JSON.stringify(result2));
    });
  });

  describe('Rounding Behavior', () => {
    test('ebur128 rounds consistently', () => {
      const testCases = [
        { input: -14.14, expected: -14.1 },
        { input: -14.15, expected: -14.1 }, // JavaScript rounds -14.15 to -14.1
        { input: -14.16, expected: -14.2 },
        { input: -14.11, expected: -14.1 },
        { input: -14.19, expected: -14.2 }
      ];
      
      testCases.forEach(({ input, expected }) => {
        const output = `
          Integrated loudness:
            I:         ${input} LUFS
          True peak:
            Peak:       -1.0 dBTP
        `;
        
        const result = parseEBUR128(output);
        expect(result.integrated_lufs).toBe(expected);
      });
    });

    test('silencedetect rounds consistently', () => {
      const testCases = [
        { input: 0.14, expected: 0.1 },
        { input: 0.15, expected: 0.2 }, // JavaScript rounds 0.15 to 0.2 (positive)
        { input: 0.16, expected: 0.2 },
        { input: 0.11, expected: 0.1 },
        { input: 0.19, expected: 0.2 }
      ];
      
      testCases.forEach(({ input, expected }) => {
        const output = `
          [silencedetect @ 0x...] silence_end: 10.8 | silence_duration: ${input}
        `;
        
        const result = parseSilenceDetect(output);
        expect(result.max_silence_duration).toBe(expected);
      });
    });
  });

  describe('Edge Cases', () => {
    test('handles very quiet audio (high negative LUFS)', () => {
      const input = `
        Integrated loudness:
          I:         -50.0 LUFS
        True peak:
          Peak:       -30.0 dBTP
      `;
      
      const result = parseEBUR128(input);
      
      expect(result.integrated_lufs).toBe(-50.0);
      expect(result.true_peak_dbtp).toBe(-30.0);
    });

    test('handles very loud audio (low negative LUFS)', () => {
      const input = `
        Integrated loudness:
          I:         -5.0 LUFS
        True peak:
          Peak:       -0.1 dBTP
      `;
      
      const result = parseEBUR128(input);
      
      expect(result.integrated_lufs).toBe(-5.0);
      expect(result.true_peak_dbtp).toBe(-0.1);
    });

    test('handles very long silence', () => {
      const input = `
        [silencedetect @ 0x...] silence_end: 100.0 | silence_duration: 10.5
      `;
      
      const result = parseSilenceDetect(input);
      
      expect(result.max_silence_duration).toBe(10.5);
    });

    test('handles very short silence', () => {
      const input = `
        [silencedetect @ 0x...] silence_end: 10.0 | silence_duration: 0.01
      `;
      
      const result = parseSilenceDetect(input);
      
      expect(result.max_silence_duration).toBe(0.0);
    });
  });
});
