// Example demonstrating OverlayFit functionality

import { LabelGen } from '../src/render/LabelGen';
import { buildOverlayIntoRect } from '../src/render/OverlayFit';

function demonstrateOverlayFit() {
  const lb = new LabelGen();

  // Example 1: Contain fit with default alignment
  const containResult = buildOverlayIntoRect(lb, 'base0', 'overlay0', {
    x: 100,
    y: 50,
    w: 300,
    h: 200,
    start: 1.0,
    end: 5.0,
  });

  console.log('=== Contain Fit ===');
  console.log('Graph:', containResult.graph);
  console.log('Output Label:', containResult.outV);

  // Example 2: Cover fit with custom alignment
  const coverResult = buildOverlayIntoRect(lb, 'base1', 'overlay1', {
    x: 200,
    y: 100,
    w: 400,
    h: 300,
    mode: 'cover',
    halign: 'start',
    valign: 'end',
    start: 2.0,
    end: 6.0,
  });

  console.log('\n=== Cover Fit ===');
  console.log('Graph:', coverResult.graph);
  console.log('Output Label:', coverResult.outV);
}

// Run the example
demonstrateOverlayFit();
