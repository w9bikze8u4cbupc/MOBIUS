import { readFileSync, writeFileSync } from 'fs';

// Read the files
const sb = JSON.parse(readFileSync('work/script.en.json', 'utf8'));
const im = JSON.parse(readFileSync('work/images.search.json', 'utf8'));

// Extract data
const storyboard = sb.storyboard.scenes || [];
const results = im.images || [];

// Create timeline structure
const timeline = {
  fps: 30,
  width: 1920,
  height: 1080,
  tracks: [
    { type: 'video', clips: [] },
    { type: 'audio', clips: [] },
  ],
};

// Generate clips
let t = 0;
for (let i = 0; i < storyboard.length; i++) {
  const scene = storyboard[i];
  // Get the first segment of each scene for timing
  const firstSegment = scene.segments && scene.segments[0];
  const url = results[i]?.path || results[0]?.path || '';
  const wc = firstSegment?.textEn ? firstSegment.textEn.split(/\s+/).filter(Boolean).length : 20;
  const dur = Math.max(4, Math.min(20, Math.round((wc || 20) / 2.5)));
  timeline.tracks[0].clips.push({
    type: 'image',
    src: url,
    start: t,
    duration: dur,
    fit: 'cover',
  });
  t += dur;
}

// Write to file
writeFileSync('work/timeline.en.json', JSON.stringify(timeline, null, 2));
console.log('timeline seconds:', t);
