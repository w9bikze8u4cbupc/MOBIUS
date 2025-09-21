import { readFileSync, writeFileSync } from 'fs';

const timeline = JSON.parse(readFileSync('work/timeline.en.json', 'utf8'));
const local = JSON.parse(readFileSync('work/local-imgs.json', 'utf8'));

let i = 0;
for (const clip of timeline.tracks?.[0]?.clips || []) {
  if (clip.type === 'image' && clip.src?.startsWith('http')) {
    clip.src = local[i % local.length];
    i++;
  }
}

writeFileSync('work/timeline.en.json', JSON.stringify(timeline, null, 2));
console.log('local images assigned:', i);
