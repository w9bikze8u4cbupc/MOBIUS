import { readFileSync, writeFileSync } from 'fs';

// Read our current timeline
const currentTimeline = JSON.parse(readFileSync('work/timeline.en.json', 'utf8'));

// Create the expected format
const timeline = [];
let time = 0;

// Convert our clips to the expected format
for (let i = 0; i < currentTimeline.tracks[0].clips.length; i++) {
  const clip = currentTimeline.tracks[0].clips[i];

  timeline.push({
    id: `shot:${i}`,
    type: 'components', // Default type
    start: time,
    end: time + clip.duration,
    data: {
      template: 'generic',
    },
  });

  time += clip.duration;
}

// Write the converted timeline
const output = {
  timeline: timeline,
};

writeFileSync('work/converted_timeline.json', JSON.stringify(output, null, 2));
console.log('Converted timeline with', timeline.length, 'shots');
console.log('Total duration:', time, 'seconds');
