// Example demonstrating the areaToSpotlightHelper

import { LabelGen } from '../src/render/LabelGen';
import { spotlightFromAreaHint } from '../src/render/AreaToSpotlightHelper';

function demonstrateAreaToSpotlight() {
  const lb = new LabelGen();
  const W = 1920, H = 1080;

  // Example 1: Using relative coordinates
  const relativeAreaResult = spotlightFromAreaHint(
    lb,
    'base0',
    W,
    H,
    { relX: 0.3, relY: 0.4, relW: 0.4, relH: 0.3 },
    { 
      start: 1.0, 
      end: 5.0, 
      opacity: 0.5, 
      feather: 15,
      margin: 20
    }
  );
  
  console.log('=== Relative Area to Spotlight ===');
  console.log('Graph:', relativeAreaResult.graph);
  console.log('Output Label:', relativeAreaResult.outV);

  // Example 2: Using pixel coordinates
  const pixelAreaResult = spotlightFromAreaHint(
    lb,
    'base1',
    W,
    H,
    { x: 500, y: 300, w: 600, h: 400 },
    { 
      start: 2.0, 
      end: 6.0, 
      opacity: 0.6, 
      feather: 10
    }
  );
  
  console.log('\n=== Pixel Area to Spotlight ===');
  console.log('Graph:', pixelAreaResult.graph);
  console.log('Output Label:', pixelAreaResult.outV);
}

// Run the example
demonstrateAreaToSpotlight();