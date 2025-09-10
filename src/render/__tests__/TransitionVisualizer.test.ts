// Unit tests for TransitionVisualizer

import { generateTransitionMarkers, injectTransitionMarkers, Transition } from '../TransitionVisualizer';

describe('TransitionVisualizer', () => {
  describe('generateTransitionMarkers', () => {
    it('should generate correct drawbox filters for transitions', () => {
      const transitions: Transition[] = [
        { start: 5.0, end: 5.5, type: 'video' },
        { start: 10.0, end: 10.3, type: 'audio' }
      ];
      
      const markers = generateTransitionMarkers(transitions, 1920, 1080);
      
      expect(markers).toHaveLength(4);
      expect(markers[0]).toBe("drawbox=enable='between(t,5,5.5)':x=0:y=0:w=1920:h=6:color=yellow@0.7");
      expect(markers[1]).toBe("drawbox=enable='between(t,5,5.5)':x=0:y=1074:w=1920:h=6:color=yellow@0.7");
      expect(markers[2]).toBe("drawbox=enable='between(t,10,10.3)':x=0:y=0:w=1920:h=6:color=yellow@0.7");
      expect(markers[3]).toBe("drawbox=enable='between(t,10,10.3)':x=0:y=1074:w=1920:h=6:color=yellow@0.7");
    });

    it('should handle empty transitions array', () => {
      const markers = generateTransitionMarkers([], 1920, 1080);
      expect(markers).toHaveLength(0);
    });
  });

  describe('injectTransitionMarkers', () => {
    it('should inject markers into filtergraph', () => {
      const transitions: Transition[] = [
        { start: 5.0, end: 5.5, type: 'video' }
      ];
      
      const filtergraph = '[0:v]scale=1920:1080[v1]';
      const updatedFiltergraph = injectTransitionMarkers(filtergraph, transitions, 1920, 1080);
      
      expect(updatedFiltergraph).toContain(filtergraph);
      expect(updatedFiltergraph).toContain("drawbox=enable='between(t,5,5.5)':x=0:y=0:w=1920:h=6:color=yellow@0.7");
      expect(updatedFiltergraph).toContain("drawbox=enable='between(t,5,5.5)':x=0:y=1074:w=1920:h=6:color=yellow@0.7");
    });

    it('should return original filtergraph when no transitions', () => {
      const filtergraph = '[0:v]scale=1920:1080[v1]';
      const updatedFiltergraph = injectTransitionMarkers(filtergraph, [], 1920, 1080);
      
      expect(updatedFiltergraph).toBe(filtergraph);
    });
  });
});