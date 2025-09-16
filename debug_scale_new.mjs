import { readFileSync, writeFileSync } from 'fs';
import { spawnSync } from 'child_process';

console.log('Debugging scaleTimelineToAudio function with new format...');

// Use full path to FFprobe
const FFPROBE_PATH = 'c:\\Users\\danie\\Documents\\mobius-games-tutorial-generator\\ffmpeg\\ffmpeg-master-latest-win64-gpl\\bin\\ffprobe.exe';

function getAudioDuration(audioPath) {
  const args = [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=nw=1',
    audioPath
  ];

  try {
    const result = spawnSync(FFPROBE_PATH, args, { encoding: 'utf8' });
    if (result.status === 0) {
      // Extract the duration value from the output
      const match = result.stdout.trim().match(/duration=([0-9.]+)/);
      if (match) {
        return parseFloat(match[1]);
      } else {
        console.error('Could not parse duration from ffprobe output:', result.stdout);
        process.exit(1);
      }
    } else {
      console.error('Error getting audio duration:', result.stderr);
      process.exit(1);
    }
  } catch (error) {
    console.error('Error getting audio duration:', error.message);
    process.exit(1);
  }
}

// Get audio duration
const audioDuration = getAudioDuration('dist/tutorial.en.audio.mp4');
console.log(`Audio duration: ${audioDuration} seconds`);

// Read timeline
const timelinePath = 'work/converted_timeline.json';
const timelineData = JSON.parse(readFileSync(timelinePath, 'utf8'));

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
  process.exit(1);
}

console.log(`Visual duration: ${visualDuration} seconds`);

// If durations are within 5%, no adjustment needed
const diffPercent = Math.abs(audioDuration - visualDuration) / Math.min(audioDuration, visualDuration) * 100;
console.log(`Difference: ${diffPercent.toFixed(2)}%`);

if (diffPercent <= 5) {
  console.log(`Durations are within 5% (${diffPercent.toFixed(2)}%), no adjustment needed.`);
} else {
  // Scale visual durations to match audio
  const scaleFactor = audioDuration / visualDuration;
  console.log(`Scaling factor: ${scaleFactor}`);
  
  if (timelineData.timeline) {
    // New format: adjust end times proportionally
    let cumulativeTime = 0;
    timelineData.timeline.forEach((segment, index) => {
      const segmentDuration = segment.end - (index > 0 ? timelineData.timeline[index - 1].end : 0);
      const newSegmentDuration = Math.max(1, segmentDuration * scaleFactor);
      cumulativeTime += newSegmentDuration;
      segment.end = Math.round(cumulativeTime * 100) / 100; // Round to 2 decimal places
      console.log(`Segment ${index}: duration ${segmentDuration} -> ${newSegmentDuration}, end ${segment.end}`);
    });
  } else if (timelineData.tracks) {
    // Old format: adjust clip durations
    timelineData.tracks[0].clips.forEach(clip => {
      clip.duration = Math.max(1, Math.round(clip.duration * scaleFactor));
    });
  }
  
  // Write updated timeline
  writeFileSync(timelinePath, JSON.stringify(timelineData, null, 2));
  console.log(`Timeline scaled and saved to ${timelinePath}`);
  console.log(`New visual duration: ${audioDuration} seconds`);
}