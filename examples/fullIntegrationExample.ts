// Full integration example demonstrating all new features working together

import { buildLoudnessOnePass } from '../src/render/AudioLoudness';
import { planAndBuildCrossfades, Seg } from '../src/render/AutoTransitions';
import { buildDebugSafeAndTime } from '../src/render/DebugOverlay';
import { LabelGen } from '../src/render/LabelGen';
import { buildOverlayIntoRect } from '../src/render/OverlayFit';

function demonstrateFullIntegration() {
  const lb = new LabelGen();
  const W = 1920,
    H = 1080;

  // Step 1: Create a shot with overlay fitting
  const overlayResult = buildOverlayIntoRect(lb, 'base0', 'overlay0', {
    x: 200,
    y: 100,
    w: 400,
    h: 300,
    mode: 'cover',
    halign: 'center',
    valign: 'center',
    start: 0.0,
    end: 5.0,
  });

  console.log('=== Shot with Overlay Fit ===');
  console.log('Graph:', overlayResult.graph);
  console.log('Output Label:', overlayResult.outV);

  // Step 2: Add debug overlay for development
  const debugResult = buildDebugSafeAndTime(lb, overlayResult.outV, 'shot_001', W, H);

  console.log('\n=== With Debug Overlay ===');
  console.log('Graph:', debugResult.graph);
  console.log('Output Label:', debugResult.outV);

  // Step 3: Create multiple shots to demonstrate auto transitions
  const shots = [
    { v: debugResult.outV, a: 'audio0', start: 0, end: 5 },
    { v: 'base1', a: 'audio1', start: 4, end: 10 }, // Overlapping with first
    { v: 'base2', a: 'audio2', start: 11, end: 15 }, // Non-overlapping with second
  ];

  const transitionResult = planAndBuildCrossfades(lb, shots);

  console.log('\n=== Auto Transitions ===');
  console.log('Graph:', transitionResult.graph);
  console.log('Video Output:', transitionResult.outV);
  console.log('Audio Output:', transitionResult.outA);

  // Step 4: Apply loudness normalization to audio
  const voiceLoudnessResult = buildLoudnessOnePass(
    lb,
    transitionResult.outA || 'audio_main',
    'voice',
  );

  console.log('\n=== Voice Loudness Normalization ===');
  console.log('Graph:', voiceLoudnessResult.graph);
  console.log('Output Label:', voiceLoudnessResult.outA);

  // Step 5: Apply music loudness normalization if needed
  // This would typically be done on a separate music bus before mixing
  const musicLoudnessResult = buildLoudnessOnePass(lb, 'music_track', 'music');

  console.log('\n=== Music Loudness Normalization ===');
  console.log('Graph:', musicLoudnessResult.graph);
  console.log('Output Label:', musicLoudnessResult.outA);

  // Final combined graph for the entire sequence
  const finalGraph = [
    overlayResult.graph,
    debugResult.graph,
    transitionResult.graph,
    voiceLoudnessResult.graph,
  ].join('\n\n');

  console.log('\n=== Final Combined Graph ===');
  console.log(finalGraph);
}

// Run the example
demonstrateFullIntegration();
