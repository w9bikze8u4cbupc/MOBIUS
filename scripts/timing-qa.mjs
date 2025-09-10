#!/usr/bin/env node

// Timing QA test script
// Implements dead-zone merge and syllable snapping validation

import fs from 'fs';

// Mock timeline data for testing
const mockTimeline = [
  { id: 's1', type: 'title', start: 0, end: 0.2 }, // Too short - should be merged
  { id: 's2', type: 'hook', start: 0.2, end: 0.3 }, // Too short - should be merged
  { id: 's3', type: 'components', start: 0.3, end: 2.5 }, // Good duration
  { id: 's4', type: 'setupOp', start: 2.5, end: 2.7 }, // Too short - should be merged
  { id: 's5', type: 'setupOp', start: 2.7, end: 5.0 }, // Good duration
];

// Dead-zone merge function - collapses beats < 300ms
function deadZoneMerge(timeline, minDuration = 0.3) {
  const result = [];
  let i = 0;
  
  while (i < timeline.length) {
    const current = { ...timeline[i] };
    
    // Check if current segment is too short
    if ((current.end - current.start) < minDuration) {
      // Try to merge with next segment if it exists and is of the same type
      if (i + 1 < timeline.length && timeline[i + 1].type === current.type) {
        // Merge with next segment
        current.end = timeline[i + 1].end;
        i += 2; // Skip next segment as it's merged
      } else if (i + 1 < timeline.length) {
        // Adjust duration to meet minimum
        current.end = current.start + minDuration;
        i++;
      } else {
        // Last segment, adjust to minimum
        current.end = current.start + minDuration;
        i++;
      }
    } else {
      i++;
    }
    
    result.push(current);
  }
  
  return result;
}

// Syllable snapping function (simplified)
function syllableSnap(timeline, alignmentData) {
  // In a real implementation, this would snap timeline segments to syllable boundaries
  // For now, we'll just validate that no segment is below minimum visibility time
  const minVisibility = 0.1; // Minimum time for visibility
  let valid = true;
  
  for (const segment of timeline) {
    const duration = segment.end - segment.start;
    if (duration < minVisibility) {
      console.error(`Segment ${segment.id} has duration ${duration}s which is below minimum visibility of ${minVisibility}s`);
      valid = false;
    }
  }
  
  return valid;
}

// Run tests
console.log('Running timing QA tests...');

// Test dead-zone merge
console.log('\n1. Testing dead-zone merge:');
const mergedTimeline = deadZoneMerge(mockTimeline);
console.log('Original timeline:');
mockTimeline.forEach(seg => {
  console.log(`  ${seg.id}: ${seg.start}-${seg.end}s (${(seg.end - seg.start).toFixed(2)}s)`);
});
console.log('Merged timeline:');
mergedTimeline.forEach(seg => {
  console.log(`  ${seg.id}: ${seg.start}-${seg.end}s (${(seg.end - seg.start).toFixed(2)}s)`);
});

// Test syllable snapping
console.log('\n2. Testing syllable snapping:');
const alignmentData = {}; // Mock alignment data
const snappingValid = syllableSnap(mergedTimeline, alignmentData);
if (snappingValid) {
  console.log('All segments meet minimum visibility requirements.');
} else {
  console.log('Some segments do not meet minimum visibility requirements.');
  process.exit(1);
}

console.log('\nTiming QA tests completed successfully!');