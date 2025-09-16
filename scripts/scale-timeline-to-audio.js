#!/usr/bin/env node

import { spawnSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import path from 'path';

// Use full path to FFprobe
const FFPROBE_PATH = 'c:\\Users\\danie\\Documents\\mobius-games-tutorial-generator\\ffmpeg\\ffmpeg-master-latest-win64-gpl\\bin\\ffprobe.exe';

function hasFfprobe() {
  const r = spawnSync(FFPROBE_PATH, ["-version"], { stdio: "ignore" });
  return r.status === 0;
}

function getAudioDuration(audioPath) {
  if (!hasFfprobe()) {
    console.error("FFprobe is not available.");
    process.exit(1);
  }

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
    console.error("Unknown timeline format");
    process.exit(1);
  }
  
  console.log(`Visual duration: ${visualDuration} seconds`);
  
  // If durations are within 5%, no adjustment needed
  const diffPercent = Math.abs(audioDuration - visualDuration) / Math.min(audioDuration, visualDuration) * 100;
  if (diffPercent <= 5) {
    console.log(`Durations are within 5% (${diffPercent.toFixed(2)}%), no adjustment needed.`);
    return;
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
    timelineData.tracks[0].clips.forEach(clip => {
      clip.duration = Math.max(1, Math.round(clip.duration * scaleFactor));
    });
  }
  
  // Write updated timeline
  writeFileSync(timelinePath, JSON.stringify(timelineData, null, 2));
  console.log(`Timeline scaled and saved to ${timelinePath}`);
  console.log(`New visual duration: ${audioDuration} seconds`);
}

// If called directly, process command line arguments
if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.length !== 4) {
    console.error('Usage: node scale-timeline-to-audio.js <timeline.json> <audio.mp3>');
    process.exit(1);
  }
  
  const timelinePath = process.argv[2];
  const audioPath = process.argv[3];
  
  scaleTimelineToAudio(timelinePath, audioPath);
}

export { scaleTimelineToAudio };