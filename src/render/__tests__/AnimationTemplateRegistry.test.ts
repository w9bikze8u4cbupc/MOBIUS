// Unit tests for AnimationTemplateRegistry

import { buildHighlightSpotlight, buildLowerThird } from '../AnimationTemplateRegistry';
import { buildAudioDucking } from '../FiltergraphBuilder';

describe('Animation Templates', () => {
  describe('buildHighlightSpotlight', () => {
    it('should generate a spotlight highlight filtergraph', () => {
      const result = buildHighlightSpotlight('v0', 1920, 1080, {
        x: 100,
        y: 50,
        w: 300,
        h: 200,
        opacity: 0.6,
        feather: 15,
        start: 1.0,
        end: 5.0
      });

      expect(result.graph).toContain('format=rgba');
      expect(result.graph).toContain('color=c=black@0.6');
      expect(result.graph).toContain('drawbox=');
      expect(result.graph).toContain('gblur=sigma=15');
      expect(result.graph).toContain("enable='between(t,1,5)'");
      expect(result.outV).toBe('spot_out0');
    });

    it('should handle zero feather value', () => {
      const result = buildHighlightSpotlight('v0', 1920, 1080, {
        x: 100,
        y: 50,
        w: 300,
        h: 200,
        start: 1.0,
        end: 5.0,
        feather: 0
      });

      expect(result.graph).not.toContain('gblur');
    });
  });

  describe('buildLowerThird', () => {
    it('should generate a lower third filtergraph', () => {
      const result = buildLowerThird('v0', 1920, 1080, {
        text: 'Player 1 Turn',
        font: '/path/to/font.ttf',
        fontsize: 48,
        color: '#FFFFFF',
        boxColor: '#000000',
        boxOpacity: 0.7,
        align: 'center',
        marginX: 100,
        marginY: 150,
        start: 2.0,
        end: 6.0
      });

      expect(result.graph).toContain('format=rgba');
      expect(result.graph).toContain('drawtext=');
      expect(result.graph).toContain("fontfile='/path/to/font.ttf'");
      expect(result.graph).toContain("text='Player 1 Turn'");
      expect(result.graph).toContain('fontsize=48');
      expect(result.graph).toContain('fontcolor=#FFFFFF');
      expect(result.graph).toContain('box=1');
      expect(result.graph).toContain('boxcolor=#000000@0.7');
      expect(result.graph).toContain("enable='between(t,2,6)'");
      expect(result.outV).toBe('lt_out0');
    });

    it('should handle different alignments', () => {
      // Left alignment
      const leftResult = buildLowerThird('v0', 1920, 1080, {
        text: 'Test',
        font: '/path/to/font.ttf',
        align: 'left',
        start: 0,
        end: 5
      });
      expect(leftResult.graph).toContain('x=80');

      // Right alignment
      const rightResult = buildLowerThird('v0', 1920, 1080, {
        text: 'Test',
        font: '/path/to/font.ttf',
        align: 'right',
        start: 0,
        end: 5
      });
      expect(rightResult.graph).toContain('(w - text_w - 80)');
    });
  });
});

describe('Audio Ducking', () => {
  describe('buildAudioDucking', () => {
    it('should generate an audio ducking filtergraph with default parameters', () => {
      const result = buildAudioDucking('a0', 'a1');

      expect(result.graph).toContain('[a0][a1]sidechaincompress=');
      expect(result.graph).toContain('threshold=0.02');
      expect(result.graph).toContain('ratio=8');
      expect(result.graph).toContain('attack=0.02');
      expect(result.graph).toContain('release=0.25');
      expect(result.graph).toContain('gain_sc=-12');
      expect(result.outA).toBe('a_duck');
    });

    it('should generate an audio ducking filtergraph with custom parameters', () => {
      const result = buildAudioDucking('a0', 'a1', {
        duckDb: -15,
        attack: 0.05,
        release: 0.3,
        threshold: 0.1
      });

      expect(result.graph).toContain('threshold=0.1');
      expect(result.graph).toContain('attack=0.05');
      expect(result.graph).toContain('release=0.3');
      expect(result.graph).toContain('gain_sc=-15');
    });
  });
});