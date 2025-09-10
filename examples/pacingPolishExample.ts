// Example demonstrating Pacing Polish functionality

import { deadZoneMerge, syllableSnap, validatePacing, TimelineSegment } from '../src/render/PacingUtils';

function demonstratePacingPolish() {
  // Example timeline with some segments that are too short
  const originalTimeline: TimelineSegment[] = [
    { id: 's1', type: 'title', start: 0, end: 0.2 }, // Too short - below 0.3s minimum
    { id: 's2', type: 'hook', start: 0.2, end: 0.25 }, // Too short - below 0.3s minimum
    { id: 's3', type: 'components', start: 0.25, end: 2.5 }, // Good duration
    { id: 's4', type: 'setupOp', start: 2.5, end: 2.55 }, // Too short - below 0.3s minimum
    { id: 's5', type: 'setupOp', start: 2.55, end: 5.0 }, // Good duration
  ];
  
  console.log('=== Original Timeline ===');
  originalTimeline.forEach(seg => {
    const duration = seg.end - seg.start;
    console.log(`  ${seg.id}: ${seg.start}-${seg.end}s (${duration.toFixed(2)}s)`);
  });
  
  // Apply dead-zone merging (collapse segments < 300ms)
  const mergedTimeline = deadZoneMerge(originalTimeline, 0.3);
  
  console.log('\n=== After Dead-Zone Merging ===');
  mergedTimeline.forEach(seg => {
    const duration = seg.end - seg.start;
    console.log(`  ${seg.id}: ${seg.start}-${seg.end}s (${duration.toFixed(2)}s)`);
  });
  
  // Apply syllable snapping (ensure minimum visibility of 0.1s)
  const snappedTimeline = syllableSnap(mergedTimeline, {}, 0.1);
  
  console.log('\n=== After Syllable Snapping ===');
  snappedTimeline.forEach(seg => {
    const duration = seg.end - seg.start;
    console.log(`  ${seg.id}: ${seg.start}-${seg.end}s (${duration.toFixed(2)}s)`);
  });
  
  // Validate the final timeline
  const validation = validatePacing(snappedTimeline, 0.3, 0.1);
  
  console.log('\n=== Validation Results ===');
  console.log(`Valid: ${validation.valid}`);
  if (validation.issues.length > 0) {
    console.log('Issues:');
    validation.issues.forEach(issue => console.log(`  - ${issue}`));
  } else {
    console.log('No issues found. Timeline meets all pacing requirements.');
  }
  
  console.log('\n=== Pacing Polish Explanation ===');
  console.log('1. Dead-zone merging: Ensures no sub-300ms micro-beats remain');
  console.log('   - Segments shorter than 0.3s are extended to meet minimum duration');
  console.log('2. Syllable snapping: Ensures minimum on-screen time is satisfied');
  console.log('   - Segments are snapped to nearest syllable boundaries');
  console.log('   - Minimum visibility of 0.1s is maintained for all segments');
  console.log('3. Validation: Confirms all segments meet timing requirements');
}

// Run the example
demonstratePacingPolish();