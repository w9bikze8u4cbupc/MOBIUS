// Example demonstrating DebugOverlay functionality

import { LabelGen } from '../src/render/LabelGen';
import { buildDebugSafeAndTime } from '../src/render/DebugOverlay';

function demonstrateDebugOverlay() {
  const lb = new LabelGen();
  
  // Example 1: Default debug overlay
  const defaultResult = buildDebugSafeAndTime(lb, 'video0', 'shot_001', 1920, 1080);
  
  console.log('=== Default Debug Overlay ===');
  console.log('Graph:', defaultResult.graph);
  console.log('Output Label:', defaultResult.outV);
  
  // Example 2: Custom debug overlay
  const customResult = buildDebugSafeAndTime(lb, 'video1', 'test_shot', 1280, 720, {
    marginPct: 0.1,
    font: 'custom/font.ttf'
  });
  
  console.log('\n=== Custom Debug Overlay ===');
  console.log('Graph:', customResult.graph);
  console.log('Output Label:', customResult.outV);
}

// Run the example
demonstrateDebugOverlay();