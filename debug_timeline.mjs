import { readFileSync } from 'fs';

console.log('Debugging timeline parsing...');

// Read timeline
const timelineData = JSON.parse(readFileSync('work/timeline.en.json', 'utf8'));
console.log('Timeline data:', JSON.stringify(timelineData, null, 2));

// Calculate current visual duration
let visualDuration = 0;
if (timelineData.timeline) {
  // New format with timeline array
  const lastSegment = timelineData.timeline[timelineData.timeline.length - 1];
  visualDuration = lastSegment.end;
  console.log('Using timeline format, last segment end:', lastSegment.end);
} else if (timelineData.tracks) {
  // Old format with tracks
  visualDuration = timelineData.tracks[0].clips.reduce((sum, clip) => sum + clip.duration, 0);
  console.log('Using tracks format, clip durations:', timelineData.tracks[0].clips.map(c => c.duration));
} else {
  console.error("Unknown timeline format");
}

console.log(`Visual duration: ${visualDuration} seconds`);