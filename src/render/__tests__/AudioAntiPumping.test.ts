// Unit tests for Audio Anti-Pumping functionality

import { buildAudioAntiPumping } from '../FiltergraphBuilder';

describe('AudioAntiPumping', () => {
  describe('buildAudioAntiPumping', () => {
    it('should generate an audio anti-pumping filtergraph with correct parameters', () => {
      const result = buildAudioAntiPumping('music', 'vo');

      // Check that the sidechaincompress filter is correctly configured
      expect(result.graph).toContain(
        '[music][vo]sidechaincompress=threshold=0.06:ratio=12:attack=5:release=250:mix=1.0[mduck]',
      );

      // Check that the dynaudnorm filter is correctly configured
      expect(result.graph).toContain('[mduck]dynaudnorm=f=150:g=5:p=0.9:m=3:s=10');

      // Check that the alimiter filter is correctly configured
      expect(result.graph).toContain('alimiter=limit=-1.0[music_bus]');

      // Check that the output label is correct
      expect(result.outA).toBe('music_bus');
    });
  });
});
