// TransitionVisualizer - Visualize crossfade windows in preview builds

export interface Transition {
  start: number;
  end: number;
  type: 'video' | 'audio';
}

/**
 * Generate drawbox filters to visualize transition windows
 * @param transitions Array of transition start/end times
 * @param width Video width
 * @param height Video height
 * @returns Array of drawbox filter strings
 */
export function generateTransitionMarkers(transitions: Transition[], width: number, height: number): string[] {
  const markers: string[] = [];
  
  transitions.forEach((transition, index) => {
    // Top marker
    const topMarker = `drawbox=enable='between(t,${transition.start},${transition.end})':x=0:y=0:w=${width}:h=6:color=yellow@0.7`;
    
    // Bottom marker
    const bottomMarker = `drawbox=enable='between(t,${transition.start},${transition.end})':x=0:y=${height-6}:w=${width}:h=6:color=yellow@0.7`;
    
    markers.push(topMarker, bottomMarker);
  });
  
  return markers;
}

/**
 * Inject transition markers into a filtergraph string
 * @param filtergraph Existing filtergraph string
 * @param transitions Array of transition start/end times
 * @param width Video width
 * @param height Video height
 * @returns Updated filtergraph string with transition markers
 */
export function injectTransitionMarkers(filtergraph: string, transitions: Transition[], width: number, height: number): string {
  const markers = generateTransitionMarkers(transitions, width, height);
  
  if (markers.length === 0) {
    return filtergraph;
  }
  
  // Add markers to the filtergraph
  const markersChain = markers.join(',');
  return `${filtergraph},${markersChain}`;
}

// Test function
export function testTransitionVisualizer() {
  console.log('Testing TransitionVisualizer...');
  
  const transitions: Transition[] = [
    { start: 5.0, end: 5.5, type: 'video' },
    { start: 10.0, end: 10.3, type: 'audio' }
  ];
  
  const markers = generateTransitionMarkers(transitions, 1920, 1080);
  console.log('Generated markers:', markers);
  
  const filtergraph = '[0:v]scale=1920:1080[v1]';
  const updatedFiltergraph = injectTransitionMarkers(filtergraph, transitions, 1920, 1080);
  console.log('Updated filtergraph:', updatedFiltergraph);
  
  console.log('TransitionVisualizer tests completed.');
}