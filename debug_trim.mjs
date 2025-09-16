import { readFileSync } from 'fs';
import { spawnSync } from 'child_process';

console.log('Debugging trimAudioToTimeline function...');

// Use full path to FFmpeg
const FFMPEG_PATH = 'c:\\Users\\danie\\Documents\\mobius-games-tutorial-generator\\ffmpeg\\ffmpeg-master-latest-win64-gpl\\bin\\ffmpeg.exe';

function hasFfmpeg() {
  const r = spawnSync(FFMPEG_PATH, ["-version"], { stdio: "ignore" });
  return r.status === 0;
}

function getTimelineDuration(timelinePath) {
  const timelineData = JSON.parse(readFileSync(timelinePath, 'utf8'));
  
  if (timelineData.timeline) {
    // New format with timeline array
    const lastSegment = timelineData.timeline[timelineData.timeline.length - 1];
    return lastSegment.end;
  } else if (timelineData.tracks) {
    // Old format with tracks
    return timelineData.tracks[0].clips.reduce((sum, clip) => sum + clip.duration, 0);
  } else {
    console.error("Unknown timeline format");
    process.exit(1);
  }
}

// Check if ffmpeg is available
if (!hasFfmpeg()) {
  console.error("FFmpeg is not available.");
  process.exit(1);
}

// Get timeline duration
const timelineDuration = getTimelineDuration('work/converted_timeline.json');
console.log(`Timeline duration: ${timelineDuration} seconds`);

// Trim audio to timeline duration
const args = [
  '-y',
  '-i', 'dist/tutorial.en.audio.mp4',
  '-t', timelineDuration.toString(),
  '-c:a', 'copy',  // Copy audio codec instead of re-encoding
  'trimmed_audio.mp4'
];

console.log('Running ffmpeg with args:', args);

try {
  const result = spawnSync(FFMPEG_PATH, args, { encoding: 'utf8' });
  console.log('Result status:', result.status);
  console.log('Result stdout:', JSON.stringify(result.stdout));
  console.log('Result stderr:', JSON.stringify(result.stderr));
  
  if (result.status === 0) {
    console.log(`Audio trimmed successfully to ${timelineDuration} seconds`);
    console.log(`Output saved to trimmed_audio.mp4`);
  } else {
    console.error('Error trimming audio:', result.stderr);
  }
} catch (error) {
  console.error('Error trimming audio:', error.message);
}