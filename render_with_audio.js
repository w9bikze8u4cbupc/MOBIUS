import { spawnSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import path from 'path';

// Use full path to FFmpeg and FFprobe
const FFMPEG_PATH =
  'c:\\Users\\danie\\Documents\\mobius-games-tutorial-generator\\ffmpeg\\ffmpeg-master-latest-win64-gpl\\bin\\ffmpeg.exe';
const FFPROBE_PATH =
  'c:\\Users\\danie\\Documents\\mobius-games-tutorial-generator\\ffmpeg\\ffmpeg-master-latest-win64-gpl\\bin\\ffprobe.exe';

function hasFfmpeg() {
  const r = spawnSync(FFMPEG_PATH, ['-version'], { stdio: 'ignore' });
  return r.status === 0;
}

function hasFfprobe() {
  const r = spawnSync(FFPROBE_PATH, ['-version'], { stdio: 'ignore' });
  return r.status === 0;
}

function getAudioDuration(audioPath) {
  if (!hasFfprobe()) {
    console.error('FFprobe is not available.');
    process.exit(1);
  }

  const args = [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'default=nw=1',
    audioPath,
  ];

  try {
    const result = spawnSync(FFPROBE_PATH, args, { encoding: 'utf8' });
    if (result.status === 0) {
      return parseFloat(result.stdout.trim());
    } else {
      console.error('Error getting audio duration:', result.stderr);
      process.exit(1);
    }
  } catch (error) {
    console.error('Error getting audio duration:', error.message);
    process.exit(1);
  }
}

function scaleTimelineToAudio(timelinePath, audioPath) {
  // Get audio duration
  const audioDuration = getAudioDuration(audioPath);
  console.log(`Audio duration: ${audioDuration} seconds`);

  // Read timeline
  const timelineData = JSON.parse(readFileSync(timelinePath, 'utf8'));

  // Calculate current visual duration
  let visualDuration = 0;
  if (timelineData.timeline) {
    // New format with timeline array
    const lastSegment = timelineData.timeline[timelineData.timeline.length - 1];
    visualDuration = lastSegment.end;
  } else if (timelineData.tracks) {
    // Old format with tracks
    visualDuration = timelineData.tracks[0].clips.reduce((sum, clip) => sum + clip.duration, 0);
  } else {
    console.error('Unknown timeline format');
    process.exit(1);
  }

  console.log(`Visual duration: ${visualDuration} seconds`);

  // If durations are within 5%, no adjustment needed
  const diffPercent =
    (Math.abs(audioDuration - visualDuration) / Math.min(audioDuration, visualDuration)) * 100;
  if (diffPercent <= 5) {
    console.log(`Durations are within 5% (${diffPercent.toFixed(2)}%), no adjustment needed.`);
    return timelineData;
  }

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
    });
  } else if (timelineData.tracks) {
    // Old format: adjust clip durations
    timelineData.tracks[0].clips.forEach((clip) => {
      clip.duration = Math.max(1, Math.round(clip.duration * scaleFactor));
    });
  }

  // Write updated timeline
  writeFileSync(timelinePath, JSON.stringify(timelineData, null, 2));
  console.log(`Timeline scaled and saved to ${timelinePath}`);
  console.log(`New visual duration: ${audioDuration} seconds`);

  return timelineData;
}

function renderWithAudio(timelinePath, assetsDir, audioPath, outMp4) {
  if (!hasFfmpeg()) {
    console.error('FFmpeg is not available.');
    process.exit(1);
  }

  // Scale timeline to match audio duration
  const timelineData = scaleTimelineToAudio(timelinePath, audioPath);

  // Calculate duration from timeline
  let duration = 0;
  if (timelineData.timeline) {
    // New format with timeline array
    const lastSegment = timelineData.timeline[timelineData.timeline.length - 1];
    duration = Math.ceil(lastSegment.end);
  } else if (timelineData.tracks) {
    // Old format with tracks
    duration = Math.ceil(timelineData.meta.durationSec);
  } else {
    console.error('Unknown timeline format');
    process.exit(1);
  }

  // Basic inputs
  const inputs = [
    '-loop',
    '1',
    '-t',
    `${duration}`,
    '-i',
    `${assetsDir}/table_bg.png`,
    '-i',
    audioPath,
  ];

  // Simple video filter (just background)
  let filter = '[0:v]setpts=PTS-STARTPTS,scale=1920:1080[v0]';
  let lastLabel = 'v0';

  // Add format and audio mapping
  const finalLabel = `${lastLabel}_final`;
  filter += `;[${lastLabel}]format=yuv420p,setsar=1[${finalLabel}]`;

  const args = [
    ...inputs,
    '-filter_complex',
    filter,
    '-map',
    `[${finalLabel}]`,
    '-map',
    '1:a',
    '-c:v',
    'libx264',
    '-c:a',
    'aac',
    '-preset',
    'ultrafast',
    '-y',
    outMp4,
  ];

  console.log(`Executing command: ${FFMPEG_PATH} ${args.join(' ')}`);

  try {
    const result = spawnSync(FFMPEG_PATH, args, { stdio: 'inherit' });
    if (result.status === 0) {
      console.log(`Video with audio rendered successfully to ${outMp4}`);
    } else {
      console.error('Error rendering video:', result.error);
      process.exit(1);
    }
  } catch (error) {
    console.error('Error rendering video:', error.message);
    process.exit(1);
  }
}

// CLI
if (process.argv.length >= 5) {
  const timelinePath = process.argv[2];
  const assetsDir = process.argv[3];
  const audioPath = process.argv[4];
  const outMp4 = process.argv[5] || 'dist/tutorial.en.audio.mp4';

  renderWithAudio(timelinePath, assetsDir, audioPath, outMp4);
} else {
  console.log(
    'Usage: node render_with_audio.js <timeline.json> <assets_dir> <audio.mp3> [output.mp4]',
  );
  process.exit(1);
}
