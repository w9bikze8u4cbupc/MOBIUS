import fs from 'fs';

const shotlist = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const alignment = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
/* alignment fragments: [{begin, end, lines}] */

const timeline = shotlist.shots.map((s, idx) => {
  const frag = alignment.fragments?.[idx];

  const start = frag ? parseFloat(frag.begin) : (idx === 0 ? 0 : null);
  const end = frag ? parseFloat(frag.end) : null;
  return { ...s, start, end };
});

// Fill nulls with simple pacing fallback (chain)
let t = 0;
for (const seg of timeline) {
  if (seg.start == null) seg.start = t;
  if (seg.end == null) seg.end = seg.start + seg.duration;
  t = seg.end + 0.3; // small gap
}

console.log(JSON.stringify({ timeline }, null, 2));