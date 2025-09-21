// Unit tests for FFmpeg expression helpers

import { fmt, ffEscapeText, enableBetween, ease, lerp } from '../ffmpegExpr';

describe('FFmpeg Expression Helpers', () => {
  describe('fmt', () => {
    it('should format numbers to 3 decimal places by default', () => {
      expect(fmt(1.23456)).toBe(1.235);
      expect(fmt(1.23444)).toBe(1.234);
    });

    it('should format numbers to specified decimal places', () => {
      expect(fmt(1.23456, 2)).toBe(1.23);
      expect(fmt(1.23456, 4)).toBe(1.2346);
    });

    it('should handle edge cases', () => {
      expect(fmt(0)).toBe(0);
      expect(fmt(NaN)).toBe(0);
      expect(fmt(Infinity)).toBe(0);
      expect(fmt(-Infinity)).toBe(0);
    });
  });

  describe('ffEscapeText', () => {
    it('should escape backslashes', () => {
      expect(ffEscapeText('text\\with\\backslashes')).toBe('text\\\\with\\\\backslashes');
    });

    it('should escape colons', () => {
      expect(ffEscapeText('text:with:colons')).toBe('text\\:with\\:colons');
    });

    it('should escape single quotes', () => {
      expect(ffEscapeText('text\'with\'quotes')).toBe('text\\\\\'with\\\\\'quotes');
    });

    it('should handle complex strings', () => {
      expect(ffEscapeText('It\'s a test: path\\to\\file')).toBe(
        "It\\\\'s a test\\: path\\\\to\\\\file",
      );
    });
  });

  describe('enableBetween', () => {
    it('should create enable expression', () => {
      expect(enableBetween(1.5, 3.7)).toBe('enable=\'between(t,1.5,3.7)\'');
    });
  });

  describe('ease', () => {
    describe('outCubic', () => {
      it('should create cubic ease-out expression', () => {
        const expr = ease.outCubic(0, 5);
        expect(expr).toContain('(t-0)/(5-0)');
        expect(expr).toContain('(1 - pow(1 -');
      });
    });

    describe('inOutCubic', () => {
      it('should create cubic ease-in-out expression', () => {
        const expr = ease.inOutCubic(0, 5);
        expect(expr).toContain('(t-0)/(5-0)');
        expect(expr).toContain('if(lt(');
      });
    });
  });

  describe('lerp', () => {
    it('should create linear interpolation expression', () => {
      const expr = lerp(10, 20, 't');
      expect(expr).toBe('(10 + (20 - 10)*t)');
    });

    it('should format numbers in expression', () => {
      const expr = lerp(10.1234, 20.5678, 't');
      expect(expr).toBe('(10.123 + (20.568 - 10.123)*t)');
    });
  });
});
