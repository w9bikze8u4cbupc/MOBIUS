// Example demonstrating transition utilities and area utilities

import { LabelGen } from '../src/render/LabelGen';
import { buildXFade, buildAcrossfade, buildDebugGrid } from '../src/render/TransitionUtils';
import { areaPixelsFromHint, expandRect, RelArea, PxArea } from '../src/render/AreaUtils';
import { buildKenBurnsCrop, buildPushOnOverlay, buildFanCards } from '../src/render/AnimationTemplateRegistry';

function demonstrateTransitions() {
  const lb = new LabelGen();
  
  // Demonstrate xfade
  const xfade = buildXFade(lb, 'v0', 'v1', { 
    transition: 'wipeleft', 
    duration: 0.5, 
    offset: 2.0 
  });
  console.log('XFade:', xfade.graph);
  
  // Demonstrate acrossfade
  const acrossfade = buildAcrossfade(lb, 'a0', 'a1', { 
    duration: 0.3, 
    curveA: 'qsin', 
    curveB: 'hsin' 
  });
  console.log('Acrossfade:', acrossfade.graph);
  
  // Demonstrate debug grid
  const debugGrid = buildDebugGrid(lb, 'v0', 100);
  console.log('Debug Grid:', debugGrid.graph);
}

function demonstrateAreaUtils() {
  // Convert relative area to pixels
  const relArea: RelArea = { relX: 0.25, relY: 0.25, relW: 0.5, relH: 0.5 };
  const pixelArea = areaPixelsFromHint(1920, 1080, relArea);
  console.log('Relative to Pixel Area:', pixelArea);
  
  // Expand a rectangle
  const expanded = expandRect(pixelArea, 20, { w: 1920, h: 1080 });
  console.log('Expanded Area:', expanded);
}

function demonstrateAdvancedTemplates() {
  const lb = new LabelGen();
  const W = 1920, H = 1080;
  
  // Demonstrate Ken Burns crop
  const kenBurns = buildKenBurnsCrop(lb, 'base0', W, H, { 
    start: 0.0, 
    end: 4.0, 
    zoomStart: 1.0, 
    zoomEnd: 1.12, 
    panFrom: { x: W*0.5, y: H*0.6 }, 
    panTo: { x: W*0.52, y: H*0.56 }, 
    easing: 'inOut' 
  });
  console.log('Ken Burns Crop:', kenBurns.graph);
  
  // Demonstrate Push-On Overlay
  const pushOn = buildPushOnOverlay(lb, 'base0', 'overlay0', W, H, { 
    start: 1.0, 
    end: 3.0, 
    from: 'left',
    toX: 800,
    toY: 600,
    easeMode: 'out'
  });
  console.log('Push-On Overlay:', pushOn.graph);
  
  // Demonstrate Fan Cards
  const fanCards = buildFanCards(lb, 'base0', ['card1', 'card2', 'card3'], W, H, { 
    start: 2.0, 
    end: 5.0, 
    cx: W*0.7, 
    cy: H*0.72, 
    radius: 260, 
    spreadDeg: 36, 
    baseAngleDeg: -8, 
    stagger: 0.12 
  });
  console.log('Fan Cards:', fanCards.graph);
}

// Run the examples
console.log('=== Transition Utilities ===');
demonstrateTransitions();

console.log('\n=== Area Utilities ===');
demonstrateAreaUtils();

console.log('\n=== Advanced Templates ===');
demonstrateAdvancedTemplates();