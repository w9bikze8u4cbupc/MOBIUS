#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 <preview_ffprobe.json>" >&2
  exit 1
fi

json_path="$1"

if [ ! -f "$json_path" ]; then
  echo "Container report not found: $json_path" >&2
  exit 2
fi

node <<'NODE' "$json_path"
import fs from 'node:fs';
import path from 'node:path';

const jsonPath = process.argv[2];
let payload;
try {
  payload = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
} catch (err) {
  console.error(`Failed to read ${jsonPath}:`, err.message);
  process.exit(3);
}

const streams = payload.streams || [];
const video = streams.find(s => s.codec_type === 'video');
if (!video) {
  console.error('No video stream detected in preview.');
  process.exit(4);
}

if (video.codec_name && video.codec_name !== 'h264') {
  console.error(`Expected h264 video codec but found ${video.codec_name}.`);
  process.exit(5);
}

if (video.pix_fmt && video.pix_fmt !== 'yuv420p') {
  console.error(`Expected yuv420p pixel format but found ${video.pix_fmt}.`);
  process.exit(6);
}

const audio = streams.find(s => s.codec_type === 'audio');
if (!audio) {
  console.error('No audio stream detected in preview.');
  process.exit(7);
}

console.log(`Preview container looks healthy (video=${video.codec_name}, audio=${audio.codec_name || 'unknown'})`);
NODE
