// Example demonstrating Audio Anti-Pumping functionality

import { buildAudioAntiPumping } from '../src/render/FiltergraphBuilder';
import { LabelGen } from '../src/render/LabelGen';

function demonstrateAudioAntiPumping() {
  const lb = new LabelGen();

  // Example: Music bus with voiceover sidechain
  // This prevents the background music from "breathing" when VO is silent
  const antiPumpingResult = buildAudioAntiPumping('music_track', 'vo_track');

  console.log('=== Audio Anti-Pumping Chain ===');
  console.log('Graph:', antiPumpingResult.graph);
  console.log('Output Label:', antiPumpingResult.outA);

  // Explanation of the filter chain:
  // 1. sidechaincompress: Applies compression to music when VO is active
  //    - threshold=0.06: Trigger level for compression
  //    - ratio=12: Strong compression ratio
  //    - attack=5: Fast attack to respond quickly to VO
  //    - release=250: Slow release to avoid pumping
  //    - mix=1.0: Full effect
  // 2. dynaudnorm: Dynamic audio normalization
  //    - f=150: Frame size in milliseconds
  //    - g=5: Gaussian filter size
  //    - p=0.9: Target peak value
  //    - m=3: Maximum gain factor
  //    - s=10: Compress factor
  // 3. alimiter: Audio limiter to prevent clipping
  //    - limit=-1.0: Maximum true peak level

  console.log('\n=== Filter Chain Explanation ===');
  console.log('1. sidechaincompress: Applies compression to music when VO is active');
  console.log('   - threshold=0.06: Trigger level for compression');
  console.log('   - ratio=12: Strong compression ratio');
  console.log('   - attack=5: Fast attack to respond quickly to VO');
  console.log('   - release=250: Slow release to avoid pumping');
  console.log('   - mix=1.0: Full effect');
  console.log('2. dynaudnorm: Dynamic audio normalization');
  console.log('   - f=150: Frame size in milliseconds');
  console.log('   - g=5: Gaussian filter size');
  console.log('   - p=0.9: Target peak value');
  console.log('   - m=3: Maximum gain factor');
  console.log('   - s=10: Compress factor');
  console.log('3. alimiter: Audio limiter to prevent clipping');
  console.log('   - limit=-1.0: Maximum true peak level');
}

// Run the example
demonstrateAudioAntiPumping();
