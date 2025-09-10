// Example demonstrating advanced animation features with FFmpeg expression helpers and templates

import { fmt, ffEscapeText, enableBetween, ease, lerp } from '../src/render/ffmpegExpr';
import { buildHighlightSpotlight, buildLowerThird } from '../src/render/AnimationTemplateRegistry';
import { buildAudioDucking } from '../src/render/FiltergraphBuilder';

/**
 * Example 1: Using FFmpeg expression helpers for smooth animations
 */
export function createSlideOnAnimation() {
  const start = 2.0;
  const end = 5.0;
  
  // Slide-on x position: x=lerp(1920, 1280, ease.outCubic(start, end))
  const slideXExpression = lerp(1920, 1280, ease.outCubic(start, end));
  
  // Zoom factor: z=lerp(1.0, 1.12, ease.inOutCubic(start, end))
  const zoomExpression = lerp(1.0, 1.12, ease.inOutCubic(start, end));
  
  // Enable window: overlay=enableBetween(start, end)
  const enableExpression = enableBetween(start, end);
  
  return {
    slideX: `x=${slideXExpression}`,
    zoom: `z=${zoomExpression}`,
    enable: enableExpression,
    description: `Slide element from x=1920 to x=1280 with easing from ${start}s to ${end}s`
  };
}

/**
 * Example 2: Spotlight highlight template
 */
export function createSpotlightHighlight() {
  const spotlightParams = {
    x: 300,
    y: 200,
    w: 400,
    h: 300,
    opacity: 0.6,
    feather: 20,
    start: 1.0,
    end: 8.0
  };
  
  // Assuming we have a base video stream labeled 'v0'
  const result = buildHighlightSpotlight('v0', 1920, 1080, spotlightParams);
  
  return {
    filtergraph: result.graph,
    outputLabel: result.outV,
    description: `Spotlight highlight from ${spotlightParams.start}s to ${spotlightParams.end}s`
  };
}

/**
 * Example 3: Lower-third with boxed background
 */
export function createLowerThird() {
  const lowerThirdParams = {
    text: "Player 1's Turn",
    font: "/path/to/font.ttf",
    fontsize: 48,
    color: '#FFFFFF',
    boxColor: '#000000',
    boxOpacity: 0.7,
    align: 'center' as const,
    marginX: 100,
    marginY: 150,
    start: 3.0,
    end: 10.0
  };
  
  // Assuming we have a base video stream labeled 'v1'
  const result = buildLowerThird('v1', 1920, 1080, lowerThirdParams);
  
  return {
    filtergraph: result.graph,
    outputLabel: result.outV,
    description: `Lower third display from ${lowerThirdParams.start}s to ${lowerThirdParams.end}s`
  };
}

/**
 * Example 4: Audio ducking
 */
export function createAudioDucking() {
  const duckingParams = {
    duckDb: -15,
    attack: 0.05,
    release: 0.3,
    threshold: 0.05
  };
  
  // Assuming we have main audio 'a0' and voiceover sidechain 'a1'
  const result = buildAudioDucking('a0', 'a1', duckingParams);
  
  return {
    filtergraph: result.graph,
    outputLabel: result.outA,
    description: `Audio ducking with ${duckingParams.duckDb}dB reduction`
  };
}

// Example usage
console.log("=== FFmpeg Expression Helpers ===");
const slideAnimation = createSlideOnAnimation();
console.log("Slide Animation:", slideAnimation);

console.log("\n=== Spotlight Highlight Template ===");
const spotlight = createSpotlightHighlight();
console.log("Spotlight Filtergraph:", spotlight.filtergraph);

console.log("\n=== Lower Third Template ===");
const lowerThird = createLowerThird();
console.log("Lower Third Filtergraph:", lowerThird.filtergraph);

console.log("\n=== Audio Ducking ===");
const audioDucking = createAudioDucking();
console.log("Audio Ducking Filtergraph:", audioDucking.filtergraph);