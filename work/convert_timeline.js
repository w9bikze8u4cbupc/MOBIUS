
import { readFileSync, writeFileSync } from 'fs';

const currentTimeline = JSON.parse(readFileSync('work/timeline.en.json','utf8'));
const timeline = [];
let time = 0;

for (let i = 0; i < currentTimeline.tracks[0].clips.length; i++) {
  const clip = currentTimeline.tracks[0].clips[i];
  
  timeline.push({
    id: `shot:${i}`,
    type: 'components',
    start: time,
    end: time + clip.duration,
    data: {
      template: 'generic'
    }
  });
  
  time += clip.duration;
}

const output = {
  timeline: timeline
};

writeFileSync('work/converted_timeline.json', JSON.stringify(output, null, 2));
console.log('Converted timeline with', timeline.length, 'shots');
console.log('Total duration:', time, 'seconds');
