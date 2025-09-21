// Unit tests for AudioLoudness

import { buildDynaudnorm, buildLoudnorm, buildSilenceGate, buildLimiter } from '../AudioLoudness';

describe('AudioLoudness', () => {
  describe('buildDynaudnorm', () => {
    it('should generate correct filter with default options', () => {
      const result = buildDynaudnorm();
      expect(result).toBe('dynaudnorm=');
    });

    it('should generate correct filter with custom options', () => {
      const result = buildDynaudnorm({
        frameSize: 200,
        gaussSize: 7,
        peakValue: 0.9,
        maxGain: 5,
      });
      expect(result).toBe('dynaudnorm=f=200:g=7:p=0.9:m=5');
    });
  });

  describe('buildLoudnorm', () => {
    it('should generate correct filter with default options', () => {
      const result = buildLoudnorm();
      expect(result).toBe('loudnorm=');
    });

    it('should generate correct filter with EBU R128 settings', () => {
      const result = buildLoudnorm({
        i: -16,
        lra: 11,
        tp: -1.0,
      });
      expect(result).toBe('loudnorm=i=-16:lra=11:tp=-1');
    });
  });

  describe('buildSilenceGate', () => {
    it('should generate correct filter with default threshold', () => {
      const result = buildSilenceGate();
      expect(result).toBe('agate=threshold=0.01:ratio=2:attack=10:release=250');
    });

    it('should generate correct filter with custom threshold', () => {
      const result = buildSilenceGate(0.02);
      expect(result).toBe('agate=threshold=0.02:ratio=2:attack=10:release=250');
    });
  });

  describe('buildLimiter', () => {
    it('should generate correct filter with default limit', () => {
      const result = buildLimiter();
      expect(result).toBe('alimiter=limit=-1:attack=5:release=50');
    });

    it('should generate correct filter with custom limit', () => {
      const result = buildLimiter(-2.0);
      expect(result).toBe('alimiter=limit=-2:attack=5:release=50');
    });
  });
});
