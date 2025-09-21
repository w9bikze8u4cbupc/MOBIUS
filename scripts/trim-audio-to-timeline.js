#!/usr/bin/env node

import { spawnSync } from 'child_process';
import { readFileSync } from 'fs';
import path from 'path';

// Use full path to FFmpeg
const FFMPEG_PATH =
  'c:\\Users\\danie\\Documents\\mobius-games-tutorial-generator\\ffmpeg\\ffmpeg-master-latest-win64-gpl\\bin\\ffmpeg.exe';

function hasFfmpeg() {
  const r = spawnSync(FFMPEG_PATH, ['-version'], { stdio: 'ignore' });
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
    console.error('Unknown timeline format');
    process.exit(1);
  }
}

function trimAudioToTimeline(audioPath, timelinePath, outputPath) {
  if (!hasFfmpeg()) {
    console.error('FFmpeg is not available.');
    process.exit(1);
  }

  // Get timeline duration
  const timelineDuration = getTimelineDuration(timelinePath);
  console.log(`Timeline duration: ${timelineDuration} seconds`);

  // Trim audio to timeline duration
  const args = [
    '-y',
    '-i',
    audioPath,
    '-t',
    timelineDuration.toString(),
    '-c:a',
    'aac',
    '-b:a',
    '128k',
    outputPath,
  ];

  try {
    const result = spawnSync(FFMPEG_PATH, args, { encoding: 'utf8' });
    if (result.status === 0) {
      console.log(`Audio trimmed successfully to ${timelineDuration} seconds`);
      console.log(`Output saved to ${outputPath}`);
    } else {
      console.error('Error trimming audio:', result.stderr);
      process.exit(1);
    }
  } catch (error) {
    console.error('Error trimming audio:', error.message);
    process.exit(1);
  }
}

// If called directly, process command line arguments
if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.length !== 5) {
    console.error('Usage: node trim-audio-to-timeline.js <audio.mp3> <timeline.json> <output.mp3>');
    process.exit(1);
  }

  const audioPath = process.argv[2];
  const timelinePath = process.argv[3];
  const outputPath = process.argv[4];

  trimAudioToTimeline(audioPath, timelinePath, outputPath);
}

export { trimAudioToTimeline };
