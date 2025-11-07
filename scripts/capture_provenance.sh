#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 2 ]; then
  echo "Usage: $0 <artifact-dir> <preview-path>" >&2
  exit 1
fi

artifact_dir="$1"
preview_path="$2"

mkdir -p "$artifact_dir"

ffprobe -hide_banner -v error -print_format json -show_streams -show_format "$preview_path" >"$artifact_dir/preview_ffprobe.json"

node <<'NODE' "$artifact_dir" "$preview_path"
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const [artifactDir, previewPath] = process.argv.slice(2);

function version(cmd) {
  const res = spawnSync(cmd, ['-version'], { encoding: 'utf8' });
  return res.error ? 'unknown' : (res.stdout.split('\n')[0] || '').trim();
}

const metadata = {
  captured_at: new Date().toISOString(),
  preview: previewPath,
  tools: {
    ffmpeg: version('ffmpeg'),
    ffprobe: version('ffprobe')
  }
};

writeFileSync(resolve(artifactDir, 'preview_provenance.json'), JSON.stringify(metadata, null, 2));
NODE
