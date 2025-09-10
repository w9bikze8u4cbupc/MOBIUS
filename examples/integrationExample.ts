// Example demonstrating integration of new features into FiltergraphBuilder

import { LabelGen } from '../src/render/LabelGen';
import { buildHighlightSpotlight, buildLowerThird } from '../src/render/AnimationTemplateRegistry';
import { buildKenBurnsCrop, buildPushOnOverlay, buildFanCards } from '../src/render/AnimationTemplateRegistry';
import { buildXFade, buildAcrossfade } from '../src/render/TransitionUtils';

function buildSampleShot() {
  const lb = new LabelGen();
  const W = 1920, H = 1080;

  // Assume you already mapped inputs to labels like 'base0', 'ov_card1', 'ov_card2', ...
  let v = 'base0';
  let a = 'voice0';
  let graph = '';

  // Ken Burns on the base
  const kb = buildKenBurnsCrop(lb, v, W, H, { 
    start: 0.0, 
    end: 4.0, 
    zoomStart: 1.0, 
    zoomEnd: 1.12, 
    panFrom: { x: W*0.5, y: H*0.6 }, 
    panTo: { x: W*0.52, y: H*0.56 }, 
    easing: 'inOut' 
  });
  graph += kb.graph + '\n';
  v = kb.outV;

  // Spotlight (dim everything but a region)
  const spot = buildHighlightSpotlight(v, W, H, { 
    x: 600, 
    y: 300, 
    w: 520, 
    h: 320, 
    opacity: 0.5, 
    feather: 16, 
    start: 0.1, 
    end: 3.9 
  });
  graph += spot.graph + '\n';
  v = spot.outV;

  // Lower third caption
  const lt = buildLowerThird(v, W, H, { 
    text: 'Action 1: Keep 1', 
    font: 'assets/fonts/Inter-Regular.ttf', 
    fontsize: 48, 
    start: 0.4, 
    end: 3.6, 
    align: 'center' 
  });
  graph += lt.graph + '\n';
  v = lt.outV;

  // Fan a few cards (assuming ov_card1..ov_card4 labels exist)
  const fan = buildFanCards(lb, v, ['ov_card1','ov_card2','ov_card3','ov_card4'], W, H, { 
    start: 1.0, 
    end: 3.6, 
    cx: W*0.7, 
    cy: H*0.72, 
    radius: 260, 
    spreadDeg: 36, 
    baseAngleDeg: -8, 
    stagger: 0.12 
  });
  graph += fan.graph + '\n';
  v = fan.outV;

  // Optionally transition to next shot streams vNext/aNext using xfade/acrossfade
  // const xf = buildXFade(lb, v, 'nextV', { transition: 'fade', duration: 0.4, offset: 3.6 });
  // const ax = buildAcrossfade(lb, a, 'nextA', { duration: 0.4 });
  // graph += xf.graph + '\n' + ax.graph + '\n';
  // v = xf.outV; a = ax.outA;

  return { v, a, graph };
}

// Run the example
const result = buildSampleShot();
console.log('=== Integrated Shot Build ===');
console.log('Final Video Stream:', result.v);
console.log('Final Audio Stream:', result.a);
console.log('Generated Graph:');
console.log(result.graph);