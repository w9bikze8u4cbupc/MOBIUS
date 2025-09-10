// Example demonstrating AutoTransitions functionality

import { LabelGen } from '../src/render/LabelGen';
import { planAndBuildCrossfades, Seg } from '../src/render/AutoTransitions';

function demonstrateAutoTransitions() {
  const lb = new LabelGen();
  
  // Example 1: Overlapping segments
  const overlappingSegs: Seg[] = [
    { v: 'v0', a: 'a0', start: 0, end: 5 },
    { v: 'v1', a: 'a1', start: 4, end: 10 },
    { v: 'v2', a: 'a2', start: 9, end: 15 }
  ];
  
  const overlappingResult = planAndBuildCrossfades(lb, overlappingSegs);
  
  console.log('=== Overlapping Segments ===');
  console.log('Graph:', overlappingResult.graph);
  console.log('Video Output:', overlappingResult.outV);
  console.log('Audio Output:', overlappingResult.outA);
  
  // Example 2: Non-overlapping segments
  const nonOverlappingSegs: Seg[] = [
    { v: 'v0', a: 'a0', start: 0, end: 5 },
    { v: 'v1', a: 'a1', start: 6, end: 10 },
    { v: 'v2', a: 'a2', start: 11, end: 15 }
  ];
  
  const nonOverlappingResult = planAndBuildCrossfades(lb, nonOverlappingSegs);
  
  console.log('\n=== Non-Overlapping Segments ===');
  console.log('Graph:', nonOverlappingResult.graph);
  console.log('Video Output:', nonOverlappingResult.outV);
  console.log('Audio Output:', nonOverlappingResult.outA);
  
  // Example 3: Segments with custom policy
  const customPolicyResult = planAndBuildCrossfades(lb, overlappingSegs, {
    minOverlap: 0.2,
    maxDur: 1.0,
    defaultDur: 0.5,
    transition: 'wipeleft',
    audioCurve: 'qsin'
  });
  
  console.log('\n=== Custom Policy ===');
  console.log('Graph:', customPolicyResult.graph);
  console.log('Video Output:', customPolicyResult.outV);
  console.log('Audio Output:', customPolicyResult.outA);
}

// Run the example
demonstrateAutoTransitions();