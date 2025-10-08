# Video Rendering Pipeline Design

## Overview
This document outlines the design for the video rendering pipeline in the Mobius Tutorial Generator. The pipeline will orchestrate FFmpeg to create video outputs from game tutorial assets.

## Goals
- Produce MP4 video outputs with correct duration
- Generate thumbnails for preview purposes
- Create captions (SRT/VTT) and support burn-in and sidecar exports
- Support preview renders (5s, 30s) and full renders
- Run in CI as a smoke/validation step
- Be testable with mocked FFmpeg processes

## High-Level Architecture

### Orchestration Layer (Node.js)
Responsible for:
- Assembling render job metadata (sequence of stills, timings, audio files, subtitles, transition directives, overlay data)
- Validating inputs (paths, durations)
- Building FFmpeg commands
- Spawning FFmpeg with stdout/stderr progress parsing
- Resolving with artifact paths and metadata or rejecting with actionable error

### Renderer Implementation
- Single FFmpeg invocation using concat demuxer or complex filtergraph
- Subtitle generation via existing caption generator
- Audio ducking using volume filter automation
- Thumbnail generation using FFmpeg frame extraction

## API Design

### Core Function
```javascript
async render(job, options)
```

### Parameters
- `job`: Object containing render job metadata
- `options`: Configuration object with properties:
  - `previewSeconds`: Number of seconds for preview render (5 or 30)
  - `dryRun`: Boolean to simulate without actual rendering
  - `burnCaptions`: Boolean to burn-in captions
  - `outputDir`: String path for output directory
  - `timeoutMs`: Number of milliseconds before timeout

### Return Value
Promise that resolves to an object containing:
- `outputPath`: Path to the generated MP4 file
- `thumbnailPath`: Path to the generated thumbnail
- `captionPath`: Path to the generated SRT file
- `metadata`: Object with duration, fps, and other metadata

## Sample FFmpeg Commands

### Create slideshow from images with audio
Using concat demuxer:
```
ffmpeg -f concat -safe 0 -i images.txt -i audio.mp3 -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest out.mp4
```

### Burn subtitles into video
```
ffmpeg -i in.mp4 -vf "subtitles=path/to/captions.srt:force_style='Fontsize=24'" -c:a copy out_burn.mp4
```

### Generate thumbnail at 3s
```
ffmpeg -ss 00:00:03 -i out.mp4 -frames:v 1 -q:v 2 thumbnail.jpg
```

### Audio ducking
Pre-generate ducked BGM by lowering its volume where voice segments exist (using SRT timestamps).

## Implementation Phases

### Phase A — Prototype (2–4 days)
1. Design doc + sample FFmpeg commands
2. Implement Node orchestration module
3. Implement script CLI wrapper
4. Implement preview job flows
5. Add unit tests with mocked spawn

### Phase B — Features & QA (3–5 days)
1. Subtitles export integration and burn-in option
2. Thumbnail generation and metadata JSON
3. Audio ducking implementation
4. Add functional smoke job to CI

### Phase C — Hardening & Scale (3–7 days)
1. Robust progress parsing & checkpointing
2. Containerized runner setup
3. End-to-end tests
4. Monitoring hooks

## Testing Strategy

### Unit Tests
- Orchestration builds correct FFmpeg args
- Spawn mocked and expected sequence asserted

### Integration Tests (CI Smoke)
- Run 5s render using tiny set of images + short TTS audio
- Assert MP4 exists and duration within ±200ms

### Manual QA
- Run 30s preview locally
- Verify A/V sync <200ms
- Verify subtitles present and burn-in toggle works

## Risks & Mitigations

### CI Runner Limits/Timeouts
Mitigation: Keep smoke renders short and offload long renders to specialized runners

### FFmpeg Differences Across OS/Versions
Mitigation: Pin to stable FFmpeg version in container or document minimum version

### Performance
Mitigation: Avoid synchronous blocking; stream processing, set timeouts, and cleanup temp files