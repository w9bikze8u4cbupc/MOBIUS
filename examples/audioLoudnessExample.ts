// Example demonstrating AudioLoudness functionality

import { LabelGen } from '../src/render/LabelGen';
import { buildLoudnessOnePass } from '../src/render/AudioLoudness';

function demonstrateAudioLoudness() {
  const lb = new LabelGen();
  
  // Example 1: Voice loudness normalization
  const voiceResult = buildLoudnessOnePass(lb, 'voice_track', 'voice');
  
  console.log('=== Voice Loudness Normalization ===');
  console.log('Graph:', voiceResult.graph);
  console.log('Output Label:', voiceResult.outA);
  
  // Example 2: Music loudness normalization
  const musicResult = buildLoudnessOnePass(lb, 'music_track', 'music');
  
  console.log('\n=== Music Loudness Normalization ===');
  console.log('Graph:', musicResult.graph);
  console.log('Output Label:', musicResult.outA);
}

// Run the example
demonstrateAudioLoudness();