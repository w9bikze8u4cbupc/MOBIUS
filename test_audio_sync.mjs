import { readFileSync } from 'fs';
import { spawnSync } from 'child_process';

console.log('Testing audio sync helper scripts...');

// Test the timeline duration calculation
const timelineData = JSON.parse(readFileSync('work/timeline.en.json', 'utf8'));
let visualDuration = 0;
if (timelineData.timeline) {
  // New format with timeline array
  const lastSegment = timelineData.timeline[timelineData.timeline.length - 1];
  visualDuration = lastSegment.end;
} else if (timelineData.tracks) {
  // Old format with tracks
  visualDuration = timelineData.tracks[0].clips.reduce((sum, clip) => sum + clip.duration, 0);
}

console.log(`Visual duration from timeline: ${visualDuration} seconds`);

// Test audio duration calculation
const FFPROBE_PATH = 'c:\\Users\\danie\\Documents\\mobius-games-tutorial-generator\\ffmpeg\\ffmpeg-master-latest-win64-gpl\\bin\\ffprobe.exe';
const args = [
  '-v', 'error',
  '-show_entries', 'format=duration',
  '-of', 'default=nw=1',
  'dist/tutorial.en.audio.mp4'
];

console.log('Running ffprobe with args:', args);

try {
  const result = spawnSync(FFPROBE_PATH, args, { encoding: 'utf8' });
  console.log('Result status:', result.status);
  console.log('Result stdout:', JSON.stringify(result.stdout));
  console.log('Result stderr:', JSON.stringify(result.stderr));
  
  if (result.status === 0) {
    // Extract the duration value from the output
    const match = result.stdout.trim().match(/duration=([0-9.]+)/);
    if (match) {
      const audioDuration = parseFloat(match[1]);
      console.log(`Audio duration: ${audioDuration} seconds`);
      
      // Calculate difference
      const diffPercent = Math.abs(audioDuration - visualDuration) / Math.min(audioDuration, visualDuration) * 100;
      console.log(`Difference: ${diffPercent.toFixed(2)}%`);
      
      if (diffPercent > 5) {
        console.log('Durations differ by more than 5%, scaling needed');
        console.log(`Scaling factor: ${audioDuration / visualDuration}`);
      } else {
        console.log('Durations are within 5%, no adjustment needed');
      }
    } else {
      console.error('Could not parse duration from ffprobe output');
    }
  } else {
    console.error('Error getting audio duration:', result.stderr);
  }
} catch (error) {
  console.error('Error getting audio duration:', error.message);
}